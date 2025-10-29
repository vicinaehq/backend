/**
 * GitHub user information returned by the API
 */
export interface GitHubUserInfo {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string;
	twitter_username: string | null;
}

/**
 * Fetch user information from GitHub API
 * @param username - GitHub username/handle
 * @returns GitHub user information or null if not found
 */
export async function fetchGitHubUser(username: string): Promise<GitHubUserInfo | null> {
	const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

	try {
		const headers: Record<string, string> = {
			'Accept': 'application/vnd.github.v3+json',
			'User-Agent': 'Vicinae-Extension-Store',
		};

		// Add authorization header if token is available
		if (GITHUB_TOKEN) {
			headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
		}

		const response = await fetch(`https://api.github.com/users/${username}`, {
			headers,
		});

		if (!response.ok) {
			if (response.status === 404) {
				console.warn(`GitHub user not found: ${username}`);
				return null;
			}
			throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data as GitHubUserInfo;
	} catch (error) {
		console.error(`Failed to fetch GitHub user ${username}:`, error);
		return null;
	}
}

/**
 * Extract display name from GitHub user info
 * Falls back to username if name is not set
 */
export function getDisplayName(userInfo: GitHubUserInfo | null, fallbackUsername: string): string {
	if (!userInfo) {
		return fallbackUsername;
	}
	return userInfo.name || userInfo.login || fallbackUsername;
}
