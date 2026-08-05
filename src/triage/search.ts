export type SearchableIssue = {
	number: number;
	title: string;
	body: string | null;
	state: string;
	labels: string[];
};

const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"been",
	"but",
	"by",
	"can",
	"do",
	"does",
	"for",
	"from",
	"has",
	"have",
	"i",
	"if",
	"in",
	"is",
	"it",
	"issue",
	"not",
	"of",
	"on",
	"or",
	"problem",
	"that",
	"the",
	"this",
	"to",
	"using",
	"vicinae",
	"was",
	"when",
	"with",
	"would",
]);

function tokens(value: string): string[] {
	return (
		value
			.toLowerCase()
			.replace(/https?:\/\/\S+/g, " ")
			.match(/[\p{L}\p{N}_+.#:/-]{2,}/gu)
			?.filter((token) => !STOP_WORDS.has(token)) ?? []
	);
}

function exactTechnicalLines(value: string): Set<string> {
	return new Set(
		value
			.split("\n")
			.map((line) => line.trim().toLowerCase())
			.filter(
				(line) =>
					line.length >= 12 &&
					line.length <= 240 &&
					(/error|exception|failed|crash|segfault|\b0x[0-9a-f]+\b/.test(line) ||
						line.includes("`")),
			),
	);
}

export function rankDuplicateCandidates(
	current: SearchableIssue,
	issues: SearchableIssue[],
	limit = 20,
): SearchableIssue[] {
	const corpus = issues.filter((issue) => issue.number !== current.number);
	const documentFrequency = new Map<string, number>();
	for (const issue of corpus) {
		const unique = new Set(tokens(`${issue.title}\n${issue.body ?? ""}`));
		for (const token of unique)
			documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
	}
	const currentTitle = new Set(tokens(current.title));
	const currentBody = new Set(tokens(current.body ?? ""));
	const currentAll = new Set([...currentTitle, ...currentBody]);
	const currentTechnical = exactTechnicalLines(
		`${current.title}\n${current.body ?? ""}`,
	);
	const weight = (token: string) =>
		Math.log((corpus.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) +
		1;

	return corpus
		.map((issue) => {
			const issueTitle = new Set(tokens(issue.title));
			const issueBody = new Set(tokens(issue.body ?? ""));
			const issueAll = new Set([...issueTitle, ...issueBody]);
			let score = 0;
			for (const token of currentAll) {
				if (!issueAll.has(token)) continue;
				const rarity = weight(token);
				score += rarity;
				if (currentTitle.has(token) && issueTitle.has(token))
					score += rarity * 4;
			}
			const technical = exactTechnicalLines(
				`${issue.title}\n${issue.body ?? ""}`,
			);
			for (const line of currentTechnical) if (technical.has(line)) score += 25;
			return { issue, score };
		})
		.filter(({ score }) => score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, limit)
		.map(({ issue }) => issue);
}
