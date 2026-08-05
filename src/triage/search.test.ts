import { describe, expect, test } from "bun:test";
import { rankDuplicateCandidates, type SearchableIssue } from "./search.js";

const issue = (number: number, title: string, body = ""): SearchableIssue => ({
	number,
	title,
	body,
	state: "open",
	labels: [],
});

describe("rankDuplicateCandidates", () => {
	test("prefers matching behavior and environment", () => {
		const current = issue(
			10,
			"Clipboard history empty after restart on KDE Wayland",
		);
		const ranked = rankDuplicateCandidates(current, [
			current,
			issue(1, "Clipboard images are blurry"),
			issue(2, "Clipboard history resets after restarting on KDE Wayland"),
			issue(3, "Vicinae does not launch on KDE"),
		]);
		expect(ranked[0]?.number).toBe(2);
		expect(ranked.some((candidate) => candidate.number === 10)).toBe(false);
	});

	test("returns no candidates without lexical overlap", () => {
		expect(
			rankDuplicateCandidates(issue(1, "Calculator precision"), [
				issue(2, "Clipboard images are blurry"),
			]),
		).toEqual([]);
	});
});
