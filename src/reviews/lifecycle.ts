import { prisma } from "@/db.js";
import { getGitHubClient, githubReviewCommand } from "./github.js";

const MARKER = "<!-- vicinae-ai-review-status -->";
const LABELS = {
	reviewing: {
		name: "ai-reviewing",
		color: "FBCA04",
		description: "Automated extension review is running",
	},
	changes: {
		name: "ai-changes-requested",
		color: "D93F0B",
		description: "Automated review found blocking issues",
	},
	ready: {
		name: "human-reviewable",
		color: "0E8A16",
		description: "Automated review passed; ready for maintainer review",
	},
	failed: {
		name: "ai-review-failed",
		color: "B60205",
		description: "Automated review could not complete",
	},
} as const;

export type LifecycleStatus =
	| "draft"
	| "reviewing"
	| "changes"
	| "ready"
	| "failed";
type Coordinates = {
	owner: string;
	repo: string;
	pullNumber: number;
};

async function statusText(
	status: LifecycleStatus,
	details?: string,
): Promise<string> {
	const text = {
		draft:
			"📝 **Draft received.** The automated review will start when this pull request is marked ready for review.",
		reviewing:
			"⏳ **Automated review in progress.** A new decision will be submitted for the latest commit.",
		changes:
			"🔴 **Contributor changes requested.** Address the blocking inline findings and push a new commit; the bot will review it automatically.",
		ready:
			"✅ **Ready for human review.** The automated reviewer approved the latest commit and a maintainer has been notified.",
		failed: `⚠️ **Automated review failed.** A maintainer can retry by commenting \`${await githubReviewCommand()}\`.`,
	}[status];
	return details ? `${text}\n\n${details}` : text;
}

async function statusComment(
	status: LifecycleStatus,
	details?: string,
): Promise<string> {
	return `${MARKER}
Thanks for contributing an extension to Vicinae! 👋

Before publication, this pull request receives two reviews:

1. An automated review for extension guidelines, safety, error handling, and likely correctness issues.
2. A final review from a Vicinae maintainer.

${await statusText(status, details)}

The automated reviewer examines only the current commit. New commits invalidate its previous decision and start another review.`;
}

export async function setLifecycleStatus(
	input: Coordinates & {
		status: LifecycleStatus;
		headSha?: string;
		details?: string;
	},
): Promise<void> {
	const octokit = getGitHubClient();
	for (const label of Object.values(LABELS)) {
		try {
			await octokit.rest.issues.getLabel({
				owner: input.owner,
				repo: input.repo,
				name: label.name,
			});
		} catch (error) {
			if (
				!(error instanceof Error && "status" in error && error.status === 404)
			)
				throw error;
			await octokit.rest.issues.createLabel({
				owner: input.owner,
				repo: input.repo,
				...label,
			});
		}
	}
	const issue = {
		owner: input.owner,
		repo: input.repo,
		issue_number: input.pullNumber,
	};
	const state = await prisma.pullRequestReviewState.upsert({
		where: {
			owner_repository_pullNumber: {
				owner: input.owner,
				repository: input.repo,
				pullNumber: input.pullNumber,
			},
		},
		update: {
			...(input.status === "reviewing"
				? { targetHeadSha: input.headSha }
				: input.status === "draft"
					? { targetHeadSha: null }
					: {}),
		},
		create: {
			owner: input.owner,
			repository: input.repo,
			pullNumber: input.pullNumber,
			targetHeadSha: input.status === "reviewing" ? input.headSha : null,
		},
	});
	if (
		!["reviewing", "draft"].includes(input.status) &&
		input.headSha &&
		state.targetHeadSha !== input.headSha
	)
		return;

	// Octokit represents GitHub IDs as safe JavaScript numbers, while Prisma Int
	// is signed 32-bit. Store the ID as BigInt and convert only at the API edge.
	let commentId = state.statusCommentId
		? Number(state.statusCommentId)
		: undefined;
	if (!commentId) {
		const comments = await octokit.paginate(octokit.rest.issues.listComments, {
			...issue,
			per_page: 100,
		});
		commentId = comments.find((comment) => comment.body?.includes(MARKER))?.id;
	}
	const body = await statusComment(input.status, input.details);
	if (commentId)
		await octokit.rest.issues.updateComment({
			owner: input.owner,
			repo: input.repo,
			comment_id: commentId,
			body,
		});
	else
		commentId = (await octokit.rest.issues.createComment({ ...issue, body }))
			.data.id;

	const wanted =
		input.status === "reviewing"
			? LABELS.reviewing.name
			: input.status === "changes"
				? LABELS.changes.name
				: input.status === "ready"
					? LABELS.ready.name
					: input.status === "failed"
						? LABELS.failed.name
						: undefined;
	const managedLabels = new Set<string>(
		Object.values(LABELS).map((label) => label.name),
	);
	const { data: currentIssue } = await octokit.rest.issues.get(issue);
	const labels = currentIssue.labels
		.map((label) => (typeof label === "string" ? label : label.name))
		.filter(
			(name): name is string => Boolean(name) && !managedLabels.has(name),
		);
	if (wanted) labels.push(wanted);
	await octokit.rest.issues.setLabels({ ...issue, labels });
	console.log(
		`[review-lifecycle] ${input.owner}/${input.repo}#${input.pullNumber}: ${input.status} (${wanted ?? "no managed label"})`,
	);

	let lastNotifiedSha = state.lastNotifiedSha;
	if (
		input.status === "ready" &&
		input.headSha &&
		state.lastNotifiedSha !== input.headSha
	) {
		const maintainer = process.env.GITHUB_REVIEW_MAINTAINER?.replace(/^@/, "");
		if (maintainer)
			await octokit.rest.issues.createComment({
				...issue,
				body: `@${maintainer} automated review passed for \`${input.headSha.slice(0, 7)}\`; this extension is ready for your review.`,
			});
		lastNotifiedSha = input.headSha;
	}
	await prisma.pullRequestReviewState.update({
		where: { id: state.id },
		data: {
			statusCommentId: commentId === undefined ? undefined : BigInt(commentId),
			lastNotifiedSha,
		},
	});
}
