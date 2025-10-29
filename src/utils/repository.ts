/**
 * Generate GitHub repository URLs for extensions
 * All extensions are stored in vicinaehq/extensions repo
 */

const REPO_BASE = 'https://github.com/vicinaehq/extensions';
const REPO_TREE = `${REPO_BASE}/tree/main/extensions`;

/**
 * Get GitHub URLs for an extension
 * @param extensionName - The extension name from manifest
 * @returns Object containing source URL, readme URL, and assets path
 */
export function getExtensionGitHubUrls(extensionName: string) {
	const sourceUrl = `${REPO_TREE}/${extensionName}`;
	const readmeUrl = `${sourceUrl}/README.md`;
	const assetsPath = `${sourceUrl}/assets`;

	return {
		sourceUrl,
		readmeUrl,
		assetsPath,
	};
}

/**
 * Build full asset URL from assets path and filename
 * @param assetsPath - Base assets path
 * @param filename - Asset filename (e.g., "icon.png" or "assets/icon.png")
 * @returns Full URL to the asset
 */
export function buildAssetUrl(assetsPath: string, filename: string | null): string | null {
	if (!filename) return null;

	// Remove leading "assets/" if present since assetsPath already includes /assets
	const cleanFilename = filename.startsWith('assets/')
		? filename.substring('assets/'.length)
		: filename;

	return `${assetsPath}/${cleanFilename}`;
}
