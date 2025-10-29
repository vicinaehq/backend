export const VALID_PLATFORMS = ['linux', 'macos', 'windows'] as const;
export type Platform = typeof VALID_PLATFORMS[number];

export function isValidPlatform(platform: string): platform is Platform {
	return VALID_PLATFORMS.includes(platform as Platform);
}
