/**
 * Convert a string into a URL-friendly slug
 *
 * @param text - The text to slugify
 * @returns A lowercase, hyphenated slug with special characters removed
 *
 * @example
 * slugify("Hello World!") // "hello-world"
 * slugify("Café & Restaurant") // "cafe-restaurant"
 * slugify("  Multiple   Spaces  ") // "multiple-spaces"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Remove leading hyphens
    .replace(/-+$/, ''); // Remove trailing hyphens
}
