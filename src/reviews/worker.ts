import { prisma } from "@/db.js";
import { getGitHubBotLogin } from "./github.js";
import { setLifecycleStatus } from "./lifecycle.js";
import { reviewPullRequest } from "./reviewer.js";

let running = false;
let activeReview:
	| {
			owner: string;
			repository: string;
			pullNumber: number;
			headSha: string;
			controller: AbortController;
	  }
	| undefined;

export function cancelSupersededReview(input: {
	owner: string;
	repository: string;
	pullNumber: number;
	headSha: string;
}): void {
	if (
		activeReview &&
		activeReview.owner.toLowerCase() === input.owner.toLowerCase() &&
		activeReview.repository.toLowerCase() === input.repository.toLowerCase() &&
		activeReview.pullNumber === input.pullNumber &&
		activeReview.headSha !== input.headSha
	) {
		console.log(
			`[review-worker] cancelling superseded review for ${input.owner}/${input.repository}#${input.pullNumber}`,
		);
		activeReview.controller.abort(
			new Error("Review job was superseded by a newer commit"),
		);
	}
}

async function processOne(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const job = await prisma.pullRequestReviewJob.findFirst({
			where: { status: "pending" },
			orderBy: { createdAt: "asc" },
		});
		if (!job) return;
		const claimed = await prisma.pullRequestReviewJob.updateMany({
			where: { id: job.id, status: "pending" },
			data: { status: "processing", attempts: { increment: 1 }, error: null },
		});
		if (claimed.count !== 1) return;
		try {
			if (!job.headSha) throw new Error("Review job has no target commit");
			const controller = new AbortController();
			activeReview = {
				owner: job.owner,
				repository: job.repository,
				pullNumber: job.pullNumber,
				headSha: job.headSha,
				controller,
			};
			const result = await reviewPullRequest({
				owner: job.owner,
				repo: job.repository,
				pullNumber: job.pullNumber,
				expectedHeadSha: job.headSha,
				signal: controller.signal,
			});
			await prisma.pullRequestReviewJob.update({
				where: { id: job.id },
				data: {
					status: "completed",
					headSha: result.headSha,
					reviewId: BigInt(result.reviewId),
				},
			});
			await setLifecycleStatus({
				owner: job.owner,
				repo: job.repository,
				pullNumber: job.pullNumber,
				status: result.decision,
				headSha: result.headSha,
				details:
					result.decision === "changes"
						? `${result.blockingCount} blocking finding${result.blockingCount === 1 ? "" : "s"} must be addressed.`
						: "No blocking findings remain on the latest commit.",
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Review job ${job.id} failed:`, error);
			const superseded = message.includes("superseded by a newer commit");
			await prisma.pullRequestReviewJob.update({
				where: { id: job.id },
				data: {
					status: superseded ? "superseded" : "failed",
					error: message.slice(0, 2000),
				},
			});
			if (!superseded)
				await setLifecycleStatus({
					owner: job.owner,
					repo: job.repository,
					pullNumber: job.pullNumber,
					status: "failed",
					headSha: job.headSha ?? undefined,
					details: message,
				});
		} finally {
			activeReview = undefined;
		}
	} finally {
		running = false;
	}
}

export async function startReviewWorker(): Promise<void> {
	if (process.env.CODEX_REVIEW_ENABLED !== "true") return;
	if (!process.env.CODEX_REVIEW_HOME)
		throw new Error("CODEX_REVIEW_HOME is required when reviews are enabled");
	const botLogin = await getGitHubBotLogin();
	console.log(`[review-worker] enabled for @${botLogin}`);
	await prisma.pullRequestReviewJob.updateMany({
		where: { status: "processing" },
		data: { status: "pending", error: "Recovered after backend restart" },
	});
	void processOne();
	setInterval(() => void processOne(), 5_000);
}
