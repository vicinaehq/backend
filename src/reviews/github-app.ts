import { App } from "octokit";

let app: App | undefined;

export function getGitHubApp(): App {
	if (app) return app;
	const appId = process.env.GITHUB_APP_ID;
	const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
	const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!appId || !privateKeyBase64 || !webhookSecret) {
		throw new Error(
			"GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_BASE64, and GITHUB_WEBHOOK_SECRET are required",
		);
	}
	const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
	if (
		!privateKey.startsWith("-----BEGIN ") ||
		!privateKey.includes("PRIVATE KEY-----")
	) {
		throw new Error(
			"GITHUB_APP_PRIVATE_KEY_BASE64 must decode to a PEM private key",
		);
	}
	app = new App({
		appId,
		privateKey,
		webhooks: { secret: webhookSecret },
	});
	return app;
}
