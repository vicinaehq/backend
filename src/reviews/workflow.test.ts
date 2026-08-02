import { describe, expect, test } from "bun:test";
import type { Finding } from "./types.js";
import { pullRequestDisposition, reviewDecision } from "./workflow.js";

describe("pullRequestDisposition", () => {
	test("welcomes drafts without queueing", () => {
		expect(pullRequestDisposition("opened", true)).toBe("draft");
		expect(pullRequestDisposition("converted_to_draft", true)).toBe("draft");
	});

	test("queues ready PRs and new commits", () => {
		expect(pullRequestDisposition("opened", false)).toBe("queue");
		expect(pullRequestDisposition("ready_for_review", false)).toBe("queue");
		expect(pullRequestDisposition("synchronize", false)).toBe("queue");
	});
});

describe("reviewDecision", () => {
	const finding = (severity: Finding["severity"]): Finding => ({
		path: "extensions/example/src/index.ts",
		line: 1,
		endLine: null,
		severity,
		rule: "TEST-001",
		title: "Test",
		explanation: "Test finding",
		remediation: "Fix it",
		suggestedChange: null,
	});

	test("requests changes only for blocking findings", () => {
		expect(reviewDecision([finding("warning")])).toEqual({
			decision: "ready",
			blockingCount: 0,
		});
		expect(reviewDecision([finding("blocking")])).toEqual({
			decision: "changes",
			blockingCount: 1,
		});
	});
});
