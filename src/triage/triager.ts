import { getGitHubClient } from "@/reviews/github.js";
import { runIssueTriage } from "./runner.js";
import { rankDuplicateCandidates, type SearchableIssue } from "./search.js";

const DUPLICATE_MARKER = "<!-- vicinae-ai-duplicate-suggestions -->";
const DUPLICATE_THRESHOLD = 0.85;
export const AUTO_TRIAGED_LABEL = "auto-triaged";
const PROTECTED_LABELS = new Set([
	AUTO_TRIAGED_LABEL,
	"confirmed",
	"duplicate",
	"good first issue",
	"help wanted",
	"not planned",
	"wontfix",
]);

function labelNames(labels: Array<string | { name?: string }>): string[] {
	return labels
		.map((label) => (typeof label === "string" ? label : label.name))
		.filter((label): label is string => Boolean(label));
}

export type TriageContext = {
	issues: SearchableIssue[];
	labels: Array<{ name: string; description: string | null }>;
};

export async function loadTriageContext(input: {
	owner: string;
	repo: string;
}): Promise<TriageContext> {
	const octokit = getGitHubClient();
	const [all, labels] = await Promise.all([
		octokit.paginate(octokit.rest.issues.listForRepo, {
			owner: input.owner,
			repo: input.repo,
			state: "all",
			per_page: 100,
		}),
		octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
			owner: input.owner,
			repo: input.repo,
			per_page: 100,
		}),
	]);
	return {
		issues: all
			.filter((candidate) => !candidate.pull_request)
			.map((candidate) => ({
				number: candidate.number,
				title: candidate.title,
				body: candidate.body,
				state: candidate.state,
				labels: labelNames(candidate.labels),
			})),
		labels: labels.map((label) => ({
			name: label.name,
			description: label.description,
		})),
	};
}

export async function triageIssue(input: {
	owner: string;
	repo: string;
	issueNumber: number;
	context?: TriageContext;
}): Promise<void> {
	const octokit = getGitHubClient();
	const context = input.context ?? (await loadTriageContext(input));
	const issue = context.issues.find(
		(candidate) => candidate.number === input.issueNumber,
	);
	if (!issue) throw new Error(`Issue #${input.issueNumber} was not found`);

	const candidates = rankDuplicateCandidates(issue, context.issues);
	const catalog = context.labels.filter(
		(label) => !PROTECTED_LABELS.has(label.name),
	);
	const result = await runIssueTriage({ issue, candidates, labels: catalog });
	const existingLabels = new Set(issue.labels);
	const allowedLabels = new Set(catalog.map((label) => label.name));
	const wantedLabels = result.labels.filter(
		(label) => allowedLabels.has(label) && !existingLabels.has(label),
	);
	if (wantedLabels.length)
		await octokit.rest.issues.addLabels({
			owner: input.owner,
			repo: input.repo,
			issue_number: input.issueNumber,
			labels: wantedLabels,
		});

	const candidateNumbers = new Set(
		candidates.map((candidate) => candidate.number),
	);
	const duplicates = result.duplicates.filter(
		(duplicate) =>
			duplicate.confidence >= DUPLICATE_THRESHOLD &&
			candidateNumbers.has(duplicate.issueNumber),
	);
	if (duplicates.length) {
		const maintainer = process.env.GITHUB_REVIEW_MAINTAINER?.replace(/^@/, "");
		if (!maintainer)
			throw new Error(
				"GITHUB_REVIEW_MAINTAINER is required for duplicate alerts",
			);
		const body = `${DUPLICATE_MARKER}\n@${maintainer} this issue may duplicate:\n\n${duplicates
			.map((duplicate) => `- #${duplicate.issueNumber} — ${duplicate.reason}`)
			.join(
				"\n",
			)}\n\n_Automated duplicate detection; maintainer confirmation is required._`;
		const comments = await octokit.paginate(octokit.rest.issues.listComments, {
			owner: input.owner,
			repo: input.repo,
			issue_number: input.issueNumber,
			per_page: 100,
		});
		const previous = comments.find((comment) =>
			comment.body?.includes(DUPLICATE_MARKER),
		);
		if (previous)
			await octokit.rest.issues.updateComment({
				owner: input.owner,
				repo: input.repo,
				comment_id: previous.id,
				body,
			});
		else
			await octokit.rest.issues.createComment({
				owner: input.owner,
				repo: input.repo,
				issue_number: input.issueNumber,
				body,
			});
	}

	if (!context.labels.some((label) => label.name === AUTO_TRIAGED_LABEL))
		throw new Error(`Repository label ${AUTO_TRIAGED_LABEL} does not exist`);
	if (!existingLabels.has(AUTO_TRIAGED_LABEL))
		await octokit.rest.issues.addLabels({
			owner: input.owner,
			repo: input.repo,
			issue_number: input.issueNumber,
			labels: [AUTO_TRIAGED_LABEL],
		});
}
