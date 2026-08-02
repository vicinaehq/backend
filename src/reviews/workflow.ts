import type { Finding } from "./types.js";

export type PullRequestDisposition = "draft" | "queue" | "ignore";

export function pullRequestDisposition(
	action: string,
	draft: boolean,
): PullRequestDisposition {
	if (action === "converted_to_draft" || (action === "opened" && draft))
		return "draft";
	if (
		!["opened", "ready_for_review", "synchronize", "reopened"].includes(
			action,
		) ||
		draft
	)
		return "ignore";
	return "queue";
}

export function reviewDecision(findings: Finding[]): {
	decision: "changes" | "ready";
	blockingCount: number;
} {
	const blockingCount = findings.filter(
		(finding) => finding.severity === "blocking",
	).length;
	return {
		decision: blockingCount > 0 ? "changes" : "ready",
		blockingCount,
	};
}
