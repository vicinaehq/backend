import { Hono } from "hono";
import { prisma } from "@/db.js";
import { getGitHubApp } from "@/reviews/github-app.js";
import { setLifecycleStatus } from "@/reviews/lifecycle.js";
import { pullRequestDisposition } from "@/reviews/workflow.js";
import type { AppContext } from "@/types/app.js";

type Repository = { name: string; owner: { login: string }; full_name: string };
type PullRequestPayload = {
	action: string;
	installation?: { id: number };
	repository: Repository;
	number: number;
	pull_request: { draft: boolean; head: { sha: string } };
};
type IssueCommentPayload = {
	action: string;
	installation?: { id: number };
	repository: Repository;
	issue: { number: number; pull_request?: unknown; user: { login: string } };
	comment: {
		id: number;
		body: string;
		author_association: string;
		user: { login: string };
	};
};

function repositoryAllowed(repository: Repository): boolean {
	const allowed =
		process.env.GITHUB_REVIEW_REPOSITORY ?? "vicinaehq/extensions";
	return repository.full_name.toLowerCase() === allowed.toLowerCase();
}

async function queueReview(input: {
	deliveryId: string;
	installationId: number;
	repository: Repository;
	pullNumber: number;
	headSha: string;
}): Promise<void> {
	await prisma.pullRequestReviewJob.updateMany({
		where: {
			owner: input.repository.owner.login,
			repository: input.repository.name,
			pullNumber: input.pullNumber,
			status: "pending",
		},
		data: {
			status: "superseded",
			error: "Superseded by a newer review request",
		},
	});
	await prisma.pullRequestReviewJob.upsert({
		where: { deliveryId: input.deliveryId },
		update: {},
		create: {
			deliveryId: input.deliveryId,
			installationId: input.installationId,
			owner: input.repository.owner.login,
			repository: input.repository.name,
			pullNumber: input.pullNumber,
			headSha: input.headSha,
		},
	});
	await setLifecycleStatus({
		installationId: input.installationId,
		owner: input.repository.owner.login,
		repo: input.repository.name,
		pullNumber: input.pullNumber,
		status: "reviewing",
		headSha: input.headSha,
	});
}

const githubWebhook = new Hono<AppContext>();

githubWebhook.post("/", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("X-Hub-Signature-256");
	if (!signature || !(await getGitHubApp().webhooks.verify(body, signature)))
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
		if (!payload.installation?.id)
			return c.json({ error: "GitHub App installation is missing" }, 400);
		const coordinates = {
			installationId: payload.installation.id,
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			pullNumber: payload.number,
		};
		const disposition = pullRequestDisposition(
			payload.action,
			payload.pull_request.draft,
		);
		if (disposition === "draft") {
			await setLifecycleStatus({ ...coordinates, status: "draft" });
			return c.json({ welcomed: true });
		}
		if (disposition === "ignore") return c.json({ ignored: true });
		await queueReview({
			deliveryId,
			installationId: payload.installation.id,
			repository: payload.repository,
			pullNumber: payload.number,
			headSha: payload.pull_request.head.sha,
		});
		return c.json({ queued: true }, 202);
	}

	if (event === "issue_comment") {
		const payload = JSON.parse(body) as IssueCommentPayload;
		if (
			payload.action !== "created" ||
			!payload.issue.pull_request ||
			payload.comment.body.trim() !== "/ai-review" ||
			!repositoryAllowed(payload.repository)
		)
			return c.json({ ignored: true });
		if (!payload.installation?.id)
			return c.json({ error: "GitHub App installation is missing" }, 400);
		const trusted = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
		const isAuthor =
			payload.comment.user.login.toLowerCase() ===
			payload.issue.user.login.toLowerCase();
		if (!isAuthor && !trusted.has(payload.comment.author_association))
			return c.json(
				{
					error:
						"Only the pull request author or a collaborator can request a review",
				},
				403,
			);
		const octokit = await getGitHubApp().getInstallationOctokit(
			payload.installation.id,
		);
		try {
			await octokit.rest.reactions.createForIssueComment({
				owner: payload.repository.owner.login,
				repo: payload.repository.name,
				comment_id: payload.comment.id,
				content: "eyes",
			});
		} catch (error) {
			console.warn(
				`Could not react to /ai-review comment ${payload.comment.id}:`,
				error,
			);
		}
		const { data: pull } = await octokit.rest.pulls.get({
			owner: payload.repository.owner.login,
			repo: payload.repository.name,
			pull_number: payload.issue.number,
		});
		if (pull.draft) {
			await setLifecycleStatus({
				installationId: payload.installation.id,
				owner: payload.repository.owner.login,
				repo: payload.repository.name,
				pullNumber: payload.issue.number,
				status: "draft",
			});
			return c.json({ queued: false, draft: true });
		}
		await queueReview({
			deliveryId,
			installationId: payload.installation.id,
			repository: payload.repository,
			pullNumber: payload.issue.number,
			headSha: pull.head.sha,
		});
		return c.json({ queued: true }, 202);
	}

	return c.json({ ignored: true });
});

export default githubWebhook;
