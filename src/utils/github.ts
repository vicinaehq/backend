import { Octokit } from "@octokit/rest";

let publicGitHubClient: Octokit | undefined;

function getPublicGitHubClient(): Octokit {
	publicGitHubClient ??= new Octokit({
		auth: process.env.GITHUB_TOKEN || undefined,
		userAgent: "Vicinae-Extension-Store",
	});
	return publicGitHubClient;
}

/**
 * GitHub user information returned by the API
 */
export interface GitHubUserInfo {
	login: string;
	name: string | null;
}

/**
 * Fetch user information from GitHub API
 * @param username - GitHub username/handle
 * @returns GitHub user information or null if not found
 */
export async function fetchGitHubUser(
	username: string,
): Promise<GitHubUserInfo | null> {
	try {
		const { data } = await getPublicGitHubClient().rest.users.getByUsername({
			username,
		});
		return { login: data.login, name: data.name ?? null };
	} catch (error) {
		if (error instanceof Error && "status" in error && error.status === 404) {
			console.warn(`GitHub user not found: ${username}`);
			return null;
		}
		console.error(`Failed to fetch GitHub user ${username}:`, error);
		return null;
	}
}

/**
 * Extract display name from GitHub user info
 * Falls back to username if name is not set
 */
export function getDisplayName(
	userInfo: GitHubUserInfo | null,
	fallbackUsername: string,
): string {
	if (!userInfo) {
		return fallbackUsername;
	}
	return userInfo.name || userInfo.login || fallbackUsername;
}
