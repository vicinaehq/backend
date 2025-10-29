/**
 * Get MIME type based on file extension
 * @param filename - The filename or path
 * @returns MIME type string
 */
export function getMimeType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop();

	const mimeTypes: Record<string, string> = {
		// Images
		'png': 'image/png',
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'gif': 'image/gif',
		'svg': 'image/svg+xml',
		'webp': 'image/webp',
		'ico': 'image/x-icon',

		// Archives
		'zip': 'application/zip',
		'tar': 'application/x-tar',
		'gz': 'application/gzip',

		// Text/Documents
		'txt': 'text/plain',
		'md': 'text/markdown',
		'json': 'application/json',
		'xml': 'application/xml',
		'pdf': 'application/pdf',

		// Web
		'html': 'text/html',
		'css': 'text/css',
		'js': 'application/javascript',
		'ts': 'application/typescript',

		// Fonts
		'woff': 'font/woff',
		'woff2': 'font/woff2',
		'ttf': 'font/ttf',
		'otf': 'font/otf',

		// Video
		'mp4': 'video/mp4',
		'webm': 'video/webm',
		'ogg': 'video/ogg',

		// Audio
		'mp3': 'audio/mpeg',
		'wav': 'audio/wav',
		'ogg': 'audio/ogg',
	};

	return mimeTypes[ext || ''] || 'application/octet-stream';
}
