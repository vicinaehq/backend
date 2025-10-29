import { Hono } from "hono";
import { getMimeType } from "../utils/mime";
import type { AppContext } from '../types/app.js';

const app = new Hono<AppContext>();

app.get('/storage/*', async (c) => {
try {
  const storage = c.var.storage;
  const path = c.req.path.replace('/storage/', '');
  const file = await storage.get(path);

  const contentType = getMimeType(path);
  const filename = path.split('/').pop();

  // For images and markdown, use inline display instead of attachment
  const isInline = contentType.startsWith('image/') || contentType === 'text/markdown';

  // Compute ETag from file buffer for cache validation
  const crypto = await import('crypto');
  const hash = crypto.createHash('md5').update(file).digest('hex');
  const etag = `"${hash}"`;

  // Check if client has cached version
  const ifNoneMatch = c.req.header('if-none-match');
  if (ifNoneMatch === etag) {
	return new Response(null, { status: 304 });
  }

  return new Response(file, {
	headers: {
	  'Content-Type': contentType,
	  'Content-Disposition': isInline
		? `inline; filename="${filename}"`
		: `attachment; filename="${filename}"`,
	  // Cache for 1 year since files are content-addressed (path includes version)
	  'Cache-Control': 'public, max-age=31536000, immutable',
	  'ETag': etag,
	},
  });
} catch (error) {
  return c.json({ error: 'File not found' }, 404);
}
});


export default app;
