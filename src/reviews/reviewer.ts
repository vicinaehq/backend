import { addedLines } from "./diff.js";
import { getGitHubApp } from "./github-app.js";
import { type ReviewSourceFile, runCodexReview } from "./runner.js";
import type { Finding } from "./types.js";
import { reviewDecision } from "./workflow.js";

const MAX_FILES = 40;
const MAX_BYTES = 500_000;
const MAX_COMMENTS = 20;

function commentBody(finding: Finding): string {
	const label = {
		blocking: "🔴 Blocking",
		warning: "🟠 Warning",
		suggestion: "🔵 Suggestion",
	}[finding.severity];
	const suggestion =
		finding.suggestedChange && !finding.suggestedChange.includes("```")
			? `\n\n\`\`\`suggestion\n${finding.suggestedChange}\n\`\`\``
			: "";
	return `**${label} — ${finding.title}**\n\nRule: \`${finding.rule}\`\n\n${finding.explanation}\n\n**Suggested resolution:** ${finding.remediation}${suggestion}`;
}

export async function reviewPullRequest(input: {
	installationId: number;
	owner: string;
	repo: string;
	pullNumber: number;
	expectedHeadSha: string;
}): Promise<{
	headSha: string;
	reviewId: number;
	decision: "changes" | "ready";
	blockingCount: number;
}> {
	const octokit = await getGitHubApp().getInstallationOctokit(
		input.installationId,
	);
	const coordinates = {
		owner: input.owner,
		repo: input.repo,
		pull_number: input.pullNumber,
	};
	const { data: pull } = await octokit.rest.pulls.get(coordinates);
	if (pull.draft) throw new Error("Pull request is still a draft");
	if (pull.head.sha !== input.expectedHeadSha)
		throw new Error("Review job was superseded by a newer commit");

	const changed = await octokit.paginate(octokit.rest.pulls.listFiles, {
		...coordinates,
		per_page: 100,
	});
	const candidates = changed.filter(
		(file) =>
			file.status !== "removed" && file.filename.startsWith("extensions/"),
	);
	if (candidates.length === 0)
		throw new Error("Pull request has no reviewable extension files");
	if (candidates.length > MAX_FILES)
		throw new Error(`Pull request exceeds the ${MAX_FILES}-file review limit`);

	let bytes = 0;
	const sources: ReviewSourceFile[] = [];
	for (const file of candidates) {
		const { data } = await octokit.rest.git.getBlob({
			owner: input.owner,
			repo: input.repo,
			file_sha: file.sha,
		});
		if (data.encoding !== "base64")
			throw new Error(
				`Unsupported GitHub blob encoding for ${file.filename}: ${data.encoding}`,
			);
		const decoded = Buffer.from(data.content.replaceAll("\n", ""), "base64");
		const content =
			bytes + decoded.byteLength <= MAX_BYTES
				? decoded.toString("utf8")
				: `[Content omitted from the review context: ${data.size} byte file exceeds the ${MAX_BYTES} byte total source budget. Review its patch and treat unreviewed generated or binary content cautiously.]`;
		bytes += Buffer.byteLength(content);
		sources.push({ path: file.filename, content });
	}

	const { data: guidelinesData } = await octokit.rest.repos.getContent({
		owner: input.owner,
		repo: input.repo,
		path: "GUIDELINES.md",
		ref: pull.base.sha,
	});
	if (
		Array.isArray(guidelinesData) ||
		guidelinesData.type !== "file" ||
		guidelinesData.encoding !== "base64" ||
		!("content" in guidelinesData)
	)
		throw new Error("Could not load trusted GUIDELINES.md");
	const guidelines = Buffer.from(
		guidelinesData.content.replaceAll("\n", ""),
		"base64",
	).toString("utf8");
	const diff = changed
		.map(
			(file) =>
				`diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch ?? ""}`,
		)
		.join("\n");
	const result = await runCodexReview(sources, guidelines, diff);
	const { blockingCount, decision } = reviewDecision(result.findings);

	const linesByPath = new Map(
		changed.map((file) => [file.filename, addedLines(file.patch)]),
	);
	const comments: Array<{
		path: string;
		line: number;
		side: "RIGHT";
		start_line?: number;
		start_side?: "RIGHT";
		body: string;
	}> = [];
	const summaryOnly: Finding[] = [];
	for (const finding of result.findings.slice(0, MAX_COMMENTS)) {
		const allowed = linesByPath.get(finding.path);
		const end = finding.endLine ?? finding.line;
		const valid =
			allowed &&
			end >= finding.line &&
			Array.from(
				{ length: end - finding.line + 1 },
				(_, offset) => finding.line + offset,
			).every((line) => allowed.has(line));
		if (!valid) {
			summaryOnly.push(finding);
			continue;
		}
		comments.push({
			path: finding.path,
			line: end,
			side: "RIGHT",
			...(end > finding.line
				? { start_line: finding.line, start_side: "RIGHT" as const }
				: {}),
			body: commentBody(finding),
		});
	}

	const { data: current } = await octokit.rest.pulls.get(coordinates);
	if (current.head.sha !== pull.head.sha)
		throw new Error("Review job was superseded by a newer commit");
	const fallback = summaryOnly.length
		? `\n\n### Findings without an inline diff location\n\n${summaryOnly.map((finding) => `- **${finding.title}** (\`${finding.path}:${finding.line}\`, ${finding.rule}): ${finding.explanation} ${finding.remediation}`).join("\n")}`
		: "";
	const body = `${result.summary}${fallback}\n\n---\n_${blockingCount > 0 ? `Automated review found ${blockingCount} publication-blocking issue${blockingCount === 1 ? "" : "s"}.` : "Automated extension review passed. A maintainer review is still required."}_`;
	const { data: review } = await octokit.rest.pulls.createReview({
		...coordinates,
		commit_id: pull.head.sha,
		event: blockingCount > 0 ? "REQUEST_CHANGES" : "APPROVE",
		body,
		comments,
	});
	const { data: afterReview } = await octokit.rest.pulls.get(coordinates);
	if (afterReview.head.sha !== pull.head.sha)
		throw new Error("Review job was superseded by a newer commit");
	return {
		headSha: pull.head.sha,
		reviewId: review.id,
		decision,
		blockingCount,
	};
}
