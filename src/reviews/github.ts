import { createHmac, timingSafeEqual } from "node:crypto";
import { Octokit } from "@octokit/rest";

let octokit: Octokit | undefined;
let botLogin: Promise<string> | undefined;

export function getGitHubClient(): Octokit {
	if (octokit) return octokit;
	const token = process.env.GITHUB_PAT;
	if (!token) throw new Error("GITHUB_PAT is required");
	octokit = new Octokit({ auth: token });
	return octokit;
}

export function getGitHubBotLogin(): Promise<string> {
	if (!botLogin) {
		botLogin = getGitHubClient()
			.rest.users.getAuthenticated()
			.then(({ data }) => {
				console.log(`[github] authenticated as @${data.login}`);
				return data.login;
			})
			.catch((error) => {
				botLogin = undefined;
				throw error;
			});
	}
	return botLogin;
}

export async function githubReviewCommand(login?: string): Promise<string> {
	return `@${login ?? (await getGitHubBotLogin())} review`;
}

export async function isGitHubReviewCommand(
	body: string,
	login?: string,
): Promise<boolean> {
	return (
		body.trim().toLowerCase() ===
		(await githubReviewCommand(login)).toLowerCase()
	);
}

export function verifyGitHubWebhook(body: string, signature: string): boolean {
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is required");
	const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	return (
		actualBuffer.length === expectedBuffer.length &&
		timingSafeEqual(actualBuffer, expectedBuffer)
	);
}
