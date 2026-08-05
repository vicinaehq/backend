import {
	AUTO_TRIAGED_LABEL,
	loadTriageContext,
	triageIssue,
} from "./triager.js";

type TriageJob = { owner: string; repo: string; issueNumber: number };
type MassTriageJob = {
	owner: string;
	repo: string;
	limit: number;
	state: "open" | "all";
	mass: true;
};
const queue: Array<TriageJob | MassTriageJob> = [];
const queued = new Set<string>();
let running = false;

function key(job: TriageJob | MassTriageJob): string {
	if ("mass" in job) return `${job.owner}/${job.repo}#mass`.toLowerCase();
	return `${job.owner}/${job.repo}#${job.issueNumber}`.toLowerCase();
}

async function processMassTriage(job: MassTriageJob): Promise<void> {
	const context = await loadTriageContext(job);
	const issues = context.issues
		.filter(
			(issue) =>
				!issue.labels.includes(AUTO_TRIAGED_LABEL) &&
				(job.state === "all" || issue.state === "open"),
		)
		.sort((left, right) => left.number - right.number)
		.slice(0, job.limit);
	console.log(
		`[issue-triage] mass run starting for ${job.owner}/${job.repo}: ${issues.length} issues`,
	);
	let completed = 0;
	let failed = 0;
	for (const issue of issues) {
		try {
			await triageIssue({
				owner: job.owner,
				repo: job.repo,
				issueNumber: issue.number,
				context,
			});
			completed++;
		} catch (error) {
			failed++;
			console.error(
				`[issue-triage] mass run failed ${job.owner}/${job.repo}#${issue.number}:`,
				error,
			);
		}
	}
	console.log(
		`[issue-triage] mass run finished for ${job.owner}/${job.repo}: ${completed} completed, ${failed} failed`,
	);
}

async function processQueue(): Promise<void> {
	if (running) return;
	running = true;
	try {
		for (let job = queue.shift(); job; job = queue.shift()) {
			try {
				if ("mass" in job) await processMassTriage(job);
				else await triageIssue(job);
				console.log(`[issue-triage] completed ${key(job)}`);
			} catch (error) {
				console.error(`[issue-triage] failed ${key(job)}:`, error);
			} finally {
				queued.delete(key(job));
			}
		}
	} finally {
		running = false;
	}
}

export function enqueueIssueTriage(job: TriageJob): boolean {
	const jobKey = key(job);
	if (queued.has(jobKey)) return false;
	queued.add(jobKey);
	queue.push(job);
	void processQueue();
	return true;
}

export function enqueueMassIssueTriage(input: {
	owner: string;
	repo: string;
	limit: number;
	state: "open" | "all";
}): boolean {
	const job: MassTriageJob = { ...input, mass: true };
	const jobKey = key(job);
	if (queued.has(jobKey)) return false;
	queued.add(jobKey);
	queue.push(job);
	void processQueue();
	return true;
}
