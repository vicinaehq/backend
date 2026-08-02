import { Hono } from "hono";
import { prisma } from "@/db.js";
import {
	getGitHubClient,
	githubReviewCommand,
	isGitHubReviewCommand,
	verifyGitHubWebhook,
} from "@/reviews/github.js";
import { scheduleLifecycleStatus } from "@/reviews/lifecycle.js";
import { cancelSupersededReview } from "@/reviews/worker.js";
import { pullRequestDisposition } from "@/reviews/workflow.js";
import type { AppContext } from "@/types/app.js";

type Repository = { name: string; owner: { login: string }; full_name: string };
type PullRequestPayload = {
	action: string;
	repository: Repository;
	number: number;
	pull_request: { draft: boolean; head: { sha: string } };
};
type IssueCommentPayload = {
	action: string;
	repository: Repository;
	issue: { number: number; pull_request?: unknown; user: { login: string } };
	comment: {
		id: number;
		body: string;
		author_association: string;
		user: { login: string };
	};
};
type ReviewCoordinates = {
	owner: string;
	repo: string;
	pullNumber: number;
};

function reviewCoordinates(
	repository: Repository,
	pullNumber: number,
): ReviewCoordinates {
	return {
		owner: repository.owner.login,
		repo: repository.name,
		pullNumber,
	};
}

function repositoryAllowed(repository: Repository): boolean {
	const allowed =
		process.env.GITHUB_REVIEW_REPOSITORY ?? "vicinaehq/extensions";
	return repository.full_name.toLowerCase() === allowed.toLowerCase();
}

function queueLifecycleUpdate(
	input: Parameters<typeof scheduleLifecycleStatus>[0],
): void {
	void scheduleLifecycleStatus(input).catch((error) => {
		console.error(
			`Could not update review lifecycle for ${input.owner}/${input.repo}#${input.pullNumber}:`,
			error,
		);
	});
}

async function queueReview(input: {
	deliveryId: string;
	repository: Repository;
	pullNumber: number;
	headSha: string;
}): Promise<boolean> {
	const queued = await prisma.$transaction(async (transaction) => {
		const existingDelivery = await transaction.pullRequestReviewJob.findUnique({
			where: { deliveryId: input.deliveryId },
			select: { id: true },
		});
		if (existingDelivery) return false;
		await transaction.pullRequestReviewJob.updateMany({
			where: {
				owner: input.repository.owner.login,
				repository: input.repository.name,
				pullNumber: input.pullNumber,
				status: "pending",
				headSha: { not: input.headSha },
			},
			data: {
				status: "superseded",
				error: "Superseded by a newer review request",
			},
		});
		const active = await transaction.pullRequestReviewJob.findFirst({
			where: {
				owner: input.repository.owner.login,
				repository: input.repository.name,
				pullNumber: input.pullNumber,
				headSha: input.headSha,
				status: { in: ["pending", "processing"] },
			},
			select: { id: true },
		});
		if (active) return false;
		await transaction.pullRequestReviewJob.create({
			data: {
				deliveryId: input.deliveryId,
				owner: input.repository.owner.login,
				repository: input.repository.name,
				pullNumber: input.pullNumber,
				headSha: input.headSha,
			},
		});
		return true;
	});
	if (queued) {
		cancelSupersededReview({
			owner: input.repository.owner.login,
			repository: input.repository.name,
			pullNumber: input.pullNumber,
			headSha: input.headSha,
		});
		queueLifecycleUpdate({
			owner: input.repository.owner.login,
			repo: input.repository.name,
			pullNumber: input.pullNumber,
			status: "reviewing",
			headSha: input.headSha,
		});
	}
	return queued;
}

const githubWebhook = new Hono<AppContext>();

githubWebhook.post("/", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("X-Hub-Signature-256");
	if (!signature || !verifyGitHubWebhook(body, signature))
		return c.json({ error: "Invalid signature" }, 401);
	if (process.env.CODEX_REVIEW_ENABLED !== "true")
		return c.json({ ignored: true, reason: "reviewer disabled" });

	const event = c.req.header("X-GitHub-Event");
	const deliveryId = c.req.header("X-GitHub-Delivery");
	if (!deliveryId)
		return c.json({ error: "GitHub delivery ID is missing" }, 400);

	if (event === "pull_request") {
		const payload = JSON.parse(body) as PullRequestPayload;
		if (!repositoryAllowed(payload.repository))
			return c.json({ ignored: true });
		const coordinates = reviewCoordinates(payload.repository, payload.number);
		const disposition = pullRequestDisposition(
			payload.action,
			payload.pull_request.draft,
		);
		if (disposition === "draft") {
			queueLifecycleUpdate({ ...coordinates, status: "draft" });
			return c.json({ welcomed: true });
		}
		if (disposition === "ignore") return c.json({ ignored: true });
		const queued = await queueReview({
			deliveryId,
			repository: payload.repository,
			pullNumber: payload.number,
			headSha: payload.pull_request.head.sha,
		});
		return c.json({ queued }, queued ? 202 : 200);
	}

	if (event === "issue_comment") {
		const payload = JSON.parse(body) as IssueCommentPayload;
		if (
			payload.action !== "created" ||
			!payload.issue.pull_request ||
			!repositoryAllowed(payload.repository) ||
			!(await isGitHubReviewCommand(payload.comment.body))
		)
			return c.json({ ignored: true });
		const trusted = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
		const octokit = getGitHubClient();
		if (!trusted.has(payload.comment.author_association)) {
			await octokit.rest.issues.createComment({
				owner: payload.repository.owner.login,
				repo: payload.repository.name,
				issue_number: payload.issue.number,
				body: `@${payload.comment.user.login} only a Vicinae organization member or repository collaborator can request a manual review. New commits are reviewed automatically.`,
			});
			return c.json(
				{
					error:
						"Only an organization member or repository collaborator can request a manual review",
				},
				403,
			);
		}
		try {
			await octokit.rest.reactions.createForIssueComment({
				owner: payload.repository.owner.login,
				repo: payload.repository.name,
				comment_id: payload.comment.id,
				content: "eyes",
			});
		} catch (error) {
			console.warn(
				`Could not react to ${await githubReviewCommand()} comment ${payload.comment.id}:`,
				error,
			);
		}
		const { data: pull } = await octokit.rest.pulls.get({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			pull_number: payload.issue.number,
		});
		if (pull.draft) {
			queueLifecycleUpdate({
				...reviewCoordinates(payload.repository, payload.issue.number),
				status: "draft",
			});
			return c.json({ queued: false, draft: true });
		}
		const queued = await queueReview({
			deliveryId,
			repository: payload.repository,
			pullNumber: payload.issue.number,
			headSha: pull.head.sha,
		});
		return c.json({ queued }, queued ? 202 : 200);
	}

	return c.json({ ignored: true });
});

export default githubWebhook;
