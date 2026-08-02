import { describe, expect, test } from "bun:test";
import {
	githubReviewCommand,
	isGitHubReviewCommand,
	verifyGitHubWebhook,
} from "./github.js";

describe("GitHub review mention command", () => {
	test("accepts only the bot mention followed by review", async () => {
		expect(await githubReviewCommand("vicinae-clanker")).toBe(
			"@vicinae-clanker review",
		);
		expect(
			await isGitHubReviewCommand(
				"  @Vicinae-Clanker review\n",
				"vicinae-clanker",
			),
		).toBe(true);
	});

	test("rejects aliases, extra words, and embedded mentions", async () => {
		expect(await isGitHubReviewCommand("/ai-review", "vicinae-clanker")).toBe(
			false,
		);
		expect(
			await isGitHubReviewCommand(
				"@vicinae-clanker review security",
				"vicinae-clanker",
			),
		).toBe(false);
		expect(
			await isGitHubReviewCommand(
				"please @vicinae-clanker review",
				"vicinae-clanker",
			),
		).toBe(false);
	});
});

describe("GitHub webhook signature", () => {
	test("accepts only a valid HMAC signature", () => {
		const previous = process.env.GITHUB_WEBHOOK_SECRET;
		process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
		try {
			expect(
				verifyGitHubWebhook(
					'{"zen":"testing"}',
					"sha256=497ceeb11048ac47f955fcd7ca2125ffc0c6fb754c7ce7b5571483a805040e3d",
				),
			).toBe(true);
			expect(verifyGitHubWebhook('{"zen":"tampered"}', "sha256=invalid")).toBe(
				false,
			);
		} finally {
			if (previous === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
			else process.env.GITHUB_WEBHOOK_SECRET = previous;
		}
	});
});
