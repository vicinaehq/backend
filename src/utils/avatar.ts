/**
 * Generate GitHub avatar URL for a given username
 * @param username - GitHub username/handle
 * @returns GitHub avatar URL (clients can append ?s=SIZE to request specific size)
 */
export function getGitHubAvatarUrl(username: string): string {
	return `https://avatars.githubusercontent.com/${username}`;
}
