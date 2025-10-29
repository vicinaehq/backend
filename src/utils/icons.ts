/**
 * Parse icon string and generate light/dark variations
 *
 * Icon format:
 * - "icon.png" -> light: "icon.png", dark: "icon.png" (same for both)
 * - "icon@dark.png" -> light: null, dark: "icon@dark.png"
 * - "icon@light.png" -> light: "icon@light.png", dark: null
 *
 * When used in pairs, you'd have two separate icon fields:
 * - icon: "icon@light.png" + another with icon: "icon@dark.png"
 */

export interface IconVariations {
  light: string | null;
  dark: string | null;
}

/**
 * Parse an icon string to determine its theme variation
 * @param icon - Icon filename (e.g., "icon.png", "icon@dark.png", "icon@light.png")
 * @returns Object with light and dark variations
 */
export function parseIcon(icon: string | null | undefined): IconVariations {
  if (!icon) {
    return { light: null, dark: null };
  }

  // Check if icon has @dark suffix
  if (icon.includes('@dark')) {
    return { light: null, dark: icon };
  }

  // Check if icon has @light suffix
  if (icon.includes('@light')) {
    return { light: icon, dark: null };
  }

  // No theme suffix - use for both light and dark
  return { light: icon, dark: icon };
}

/**
 * Merge multiple icon variations into a single set
 * Used when manifest provides separate light/dark icons
 *
 * @param icons - Array of icon strings to merge
 * @returns Merged light and dark variations
 */
export function mergeIconVariations(icons: (string | null | undefined)[]): IconVariations {
  const result: IconVariations = { light: null, dark: null };

  for (const icon of icons) {
    const parsed = parseIcon(icon);
    if (parsed.light && !result.light) {
      result.light = parsed.light;
    }
    if (parsed.dark && !result.dark) {
      result.dark = parsed.dark;
    }
  }

  return result;
}
