import { prisma } from "@/db.js";
import { setLifecycleStatus } from "./lifecycle.js";
import { reviewPullRequest } from "./reviewer.js";

let running = false;

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
			const result = await reviewPullRequest({
				installationId: job.installationId,
				owner: job.owner,
				repo: job.repository,
				pullNumber: job.pullNumber,
				expectedHeadSha: job.headSha,
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
				installationId: job.installationId,
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
					installationId: job.installationId,
					owner: job.owner,
					repo: job.repository,
					pullNumber: job.pullNumber,
					status: "failed",
					headSha: job.headSha ?? undefined,
					details: message,
				});
		}
	} finally {
		running = false;
	}
}

export async function startReviewWorker(): Promise<void> {
	if (process.env.CODEX_REVIEW_ENABLED !== "true") return;
	await prisma.pullRequestReviewJob.updateMany({
		where: { status: "processing" },
		data: { status: "pending", error: "Recovered after backend restart" },
	});
	void processOne();
	setInterval(() => void processOne(), 5_000);
}
