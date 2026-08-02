import { prisma } from "@/db.js";
import {
	NoReviewableExtensionChangesError,
	SupersededReviewError,
} from "./errors.js";
import { getGitHubBotLogin } from "./github.js";
import { scheduleLifecycleStatus } from "./lifecycle.js";
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

async function updateLifecycle(
	input: Parameters<typeof scheduleLifecycleStatus>[0],
): Promise<void> {
	try {
		await scheduleLifecycleStatus(input);
	} catch (error) {
		console.error(
			`[review-lifecycle] failed to update ${input.owner}/${input.repo}#${input.pullNumber} to ${input.status}:`,
			error,
		);
	}
}

function failureStatus(error: unknown): "superseded" | "skipped" | "failed" {
	if (error instanceof SupersededReviewError) return "superseded";
	if (error instanceof NoReviewableExtensionChangesError) return "skipped";
	return "failed";
}

function blockingFindingsMessage(count: number): string {
	return `${count} blocking finding${count === 1 ? "" : "s"} must be addressed.`;
}

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
		activeReview.controller.abort(new SupersededReviewError());
	}
}

async function processOne(): Promise<void> {
	if (running) return;
	running = true;
	try {
		// Do not claim work while GitHub is unavailable. The interval will retry,
		// leaving pending jobs intact instead of turning an outage into failures.
		try {
			await getGitHubBotLogin();
		} catch (error) {
			console.error(
				"[review-worker] GitHub is unavailable; retrying later:",
				error,
			);
			return;
		}
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
		let result: Awaited<ReturnType<typeof reviewPullRequest>>;
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
			result = await reviewPullRequest({
				owner: job.owner,
				repo: job.repository,
				pullNumber: job.pullNumber,
				expectedHeadSha: job.headSha,
				signal: controller.signal,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const status = failureStatus(error);
			if (status === "skipped")
				console.log(`Review job ${job.id} skipped: ${message}`);
			else if (status === "failed")
				console.error(`Review job ${job.id} failed:`, error);
			await prisma.pullRequestReviewJob.update({
				where: { id: job.id },
				data: {
					status,
					error: status === "skipped" ? null : message.slice(0, 2000),
				},
			});
			if (status === "skipped")
				await updateLifecycle({
					owner: job.owner,
					repo: job.repository,
					pullNumber: job.pullNumber,
					status: "skipped",
					headSha: job.headSha ?? undefined,
				});
			else if (status === "failed")
				await updateLifecycle({
					owner: job.owner,
					repo: job.repository,
					pullNumber: job.pullNumber,
					status: "failed",
					headSha: job.headSha ?? undefined,
					details: message,
				});
			return;
		} finally {
			activeReview = undefined;
		}
		await prisma.pullRequestReviewJob.update({
			where: { id: job.id },
			data: {
				status: "completed",
				headSha: result.headSha,
				reviewId: BigInt(result.reviewId),
			},
		});
		await updateLifecycle({
			owner: job.owner,
			repo: job.repository,
			pullNumber: job.pullNumber,
			status: result.decision,
			headSha: result.headSha,
			details:
				result.decision === "changes"
					? blockingFindingsMessage(result.blockingCount)
					: "No blocking findings remain on the latest commit.",
		});
	} finally {
		running = false;
	}
}

export async function startReviewWorker(): Promise<void> {
	if (process.env.CODEX_REVIEW_ENABLED !== "true") return;
	if (!process.env.CODEX_REVIEW_HOME)
		throw new Error("CODEX_REVIEW_HOME is required when reviews are enabled");
	try {
		const botLogin = await getGitHubBotLogin();
		console.log(`[review-worker] enabled for @${botLogin}`);
	} catch (error) {
		console.error(
			"[review-worker] GitHub authentication check failed; the store will remain available and the reviewer will retry on demand:",
			error,
		);
	}
	await prisma.pullRequestReviewJob.updateMany({
		where: { status: "processing" },
		data: { status: "pending", error: "Recovered after backend restart" },
	});
	void processOne();
	setInterval(() => void processOne(), 5_000);
}
