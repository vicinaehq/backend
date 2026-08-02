import { addedLines } from "./diff.js";
import {
	NoReviewableExtensionChangesError,
	SupersededReviewError,
} from "./errors.js";
import { getGitHubBotLogin, getGitHubClient } from "./github.js";
import { type ReviewSourceFile, runCodexReview } from "./runner.js";
import type { Finding } from "./types.js";
import { reviewDecision } from "./workflow.js";

const MAX_FILES = 40;
const MAX_BYTES = 500_000;
const BINARY_EXTENSIONS = new Set([
	".avif",
	".bmp",
	".eot",
	".flac",
	".gif",
	".ico",
	".jpeg",
	".jpg",
	".mp3",
	".mp4",
	".ogg",
	".pdf",
	".png",
	".ttf",
	".wav",
	".webp",
	".woff",
	".woff2",
	".zip",
]);
const FINDING_LABEL = {
	blocking: "🔴 Blocking",
	warning: "🟠 Warning",
	suggestion: "🔵 Suggestion",
} as const;

function extension(path: string): string {
	const index = path.lastIndexOf(".");
	return index < 0 ? "" : path.slice(index).toLowerCase();
}

function commentBody(finding: Finding): string {
	const label = FINDING_LABEL[finding.severity];
	const suggestion =
		finding.suggestedChange && !finding.suggestedChange.includes("```")
			? `\n\n\`\`\`suggestion\n${finding.suggestedChange}\n\`\`\``
			: "";
	return `**${label} — ${finding.title}**\n\nRule: \`${finding.rule}\`\n\n${finding.explanation}\n\n**Suggested resolution:** ${finding.remediation}${suggestion}`;
}

function sourceContent(
	decoded: Buffer,
	fileSize: number,
	fileSha: string,
	currentBytes: number,
): { content: string; binary: boolean } {
	if (decoded.includes(0))
		return {
			content: `Binary asset: ${fileSize} bytes, Git blob ${fileSha}. Do not inspect its bytes without concrete evidence that the asset is suspicious or mismatched.`,
			binary: true,
		};
	if (currentBytes + decoded.byteLength > MAX_BYTES)
		return {
			content: `[Content omitted from the review context: ${fileSize} byte file exceeds the ${MAX_BYTES} byte total source budget. Review its patch and treat unreviewed generated or binary content cautiously.]`,
			binary: false,
		};
	return { content: decoded.toString("utf8"), binary: false };
}

export async function reviewPullRequest(input: {
	owner: string;
	repo: string;
	pullNumber: number;
	expectedHeadSha: string;
	signal?: AbortSignal;
}): Promise<{
	headSha: string;
	reviewId: number;
	decision: "changes" | "ready";
	blockingCount: number;
}> {
	const reviewStartedAt = performance.now();
	let stageStartedAt = reviewStartedAt;
	const stageDone = (stage: string) => {
		const now = performance.now();
		console.log(
			`[review-timing] ${input.owner}/${input.repo}#${input.pullNumber} ${stage}: ${((now - stageStartedAt) / 1000).toFixed(2)}s (total ${((now - reviewStartedAt) / 1000).toFixed(2)}s)`,
		);
		stageStartedAt = now;
	};
	const octokit = getGitHubClient();
	const coordinates = {
		owner: input.owner,
		repo: input.repo,
		pull_number: input.pullNumber,
	};
	const { data: pull } = await octokit.rest.pulls.get(coordinates);
	stageDone("pull metadata");
	input.signal?.throwIfAborted();
	if (pull.draft) throw new Error("Pull request is still a draft");
	if (pull.head.sha !== input.expectedHeadSha)
		throw new SupersededReviewError();

	const botLogin = (await getGitHubBotLogin()).toLowerCase();
	const [issueComments, reviews, reviewComments] = await Promise.all([
		octokit.paginate(octokit.rest.issues.listComments, {
			owner: input.owner,
			repo: input.repo,
			issue_number: input.pullNumber,
			per_page: 100,
		}),
		octokit.paginate(octokit.rest.pulls.listReviews, {
			...coordinates,
			per_page: 100,
		}),
		octokit.paginate(octokit.rest.pulls.listReviewComments, {
			...coordinates,
			per_page: 100,
		}),
	]);
	const fromHuman = (user: { login: string; type?: string } | null) =>
		user?.login.toLowerCase() !== botLogin && user?.type !== "Bot";
	const pullRequestContext = JSON.stringify(
		{
			title: pull.title,
			description: pull.body,
			author: pull.user?.login,
			conversation: issueComments
				.filter((comment) => fromHuman(comment.user))
				.map((comment) => ({
					author: comment.user?.login,
					authorAssociation: comment.author_association,
					createdAt: comment.created_at,
					body: comment.body,
				})),
			reviews: reviews
				.filter((review) => fromHuman(review.user) && review.body)
				.map((review) => ({
					author: review.user?.login,
					state: review.state,
					submittedAt: review.submitted_at,
					body: review.body,
				})),
			inlineReviewComments: reviewComments
				.filter((comment) => fromHuman(comment.user))
				.map((comment) => ({
					author: comment.user.login,
					path: comment.path,
					line: comment.line ?? comment.original_line,
					createdAt: comment.created_at,
					body: comment.body,
				})),
		},
		null,
		2,
	);
	stageDone(
		`conversation (${issueComments.length} comments, ${reviews.length} reviews, ${reviewComments.length} inline comments)`,
	);
	input.signal?.throwIfAborted();

	const changed = await octokit.paginate(octokit.rest.pulls.listFiles, {
		...coordinates,
		per_page: 100,
	});
	stageDone(`changed-file metadata (${changed.length} files)`);
	const candidates = changed.filter(
		(file) =>
			file.status !== "removed" && file.filename.startsWith("extensions/"),
	);
	if (candidates.length === 0) throw new NoReviewableExtensionChangesError();
	if (candidates.length > MAX_FILES)
		throw new Error(`Pull request exceeds the ${MAX_FILES}-file review limit`);

	let bytes = 0;
	let fetchedBlobs = 0;
	const sources: ReviewSourceFile[] = [];
	for (const file of candidates) {
		input.signal?.throwIfAborted();
		if (BINARY_EXTENSIONS.has(extension(file.filename))) {
			sources.push({
				path: file.filename,
				content: `Binary asset (${file.status}), Git blob ${file.sha}. Content inspection is intentionally delegated to CI and human review.`,
				binary: true,
			});
			continue;
		}
		const { data } = await octokit.rest.git.getBlob({
			owner: input.owner,
			repo: input.repo,
			file_sha: file.sha,
		});
		fetchedBlobs++;
		if (data.encoding !== "base64")
			throw new Error(
				`Unsupported GitHub blob encoding for ${file.filename}: ${data.encoding}`,
			);
		const decoded = Buffer.from(data.content.replaceAll("\n", ""), "base64");
		const { content, binary } = sourceContent(
			decoded,
			data.size,
			file.sha,
			bytes,
		);
		if (!binary) bytes += Buffer.byteLength(content);
		sources.push({ path: file.filename, content, binary });
	}
	stageDone(
		`source blobs (${fetchedBlobs} fetched, ${sources.length - fetchedBlobs} skipped binaries, ${bytes} text bytes)`,
	);

	const { data: reviewSkillData } = await octokit.rest.repos.getContent({
		owner: input.owner,
		repo: input.repo,
		path: "skills/extension-reviewer/SKILL.md",
		ref: "main",
	});
	if (
		Array.isArray(reviewSkillData) ||
		reviewSkillData.type !== "file" ||
		reviewSkillData.encoding !== "base64" ||
		!("content" in reviewSkillData)
	)
		throw new Error("Could not load trusted extension reviewer skill");
	const reviewSkill = Buffer.from(
		reviewSkillData.content.replaceAll("\n", ""),
		"base64",
	).toString("utf8");
	const { data: reviewRulesData } = await octokit.rest.repos.getContent({
		owner: input.owner,
		repo: input.repo,
		path: "skills/extension-reviewer/rules.json",
		ref: "main",
	});
	if (
		Array.isArray(reviewRulesData) ||
		reviewRulesData.type !== "file" ||
		reviewRulesData.encoding !== "base64" ||
		!("content" in reviewRulesData)
	)
		throw new Error("Could not load trusted extension review rules from main");
	const reviewRules = Buffer.from(
		reviewRulesData.content.replaceAll("\n", ""),
		"base64",
	).toString("utf8");
	stageDone("review policy");
	input.signal?.throwIfAborted();
	const diff = changed
		.map(
			(file) =>
				`diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch ?? ""}`,
		)
		.join("\n");
	const result = await runCodexReview(
		sources,
		reviewSkill,
		reviewRules,
		pullRequestContext,
		diff,
		input.signal,
	);
	stageDone(`Codex (${result.findings.length} findings)`);
	input.signal?.throwIfAborted();
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
	for (const finding of result.findings) {
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
	if (current.head.sha !== pull.head.sha) throw new SupersededReviewError();
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
	stageDone(`GitHub review submission (${comments.length} inline comments)`);
	const { data: afterReview } = await octokit.rest.pulls.get(coordinates);
	if (afterReview.head.sha !== pull.head.sha) throw new SupersededReviewError();
	stageDone("final head verification");
	return {
		headSha: pull.head.sha,
		reviewId: review.id,
		decision,
		blockingCount,
	};
}
