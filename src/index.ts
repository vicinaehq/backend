import { Hono } from 'hono'
import { createStorageFromEnv } from './storage/index.js'
import type { StorageAdapter } from './storage/index.js'
import { LocalStorageAdapter } from './storage/index.js'
import extensionsRouter from './routes/extensions.js'
import { getMimeType } from './utils/mime.js'

const storage = createStorageFromEnv()

type AppContext = {
  Variables: {
    storage: StorageAdapter
  }
}

const app = new Hono<AppContext>()

app.use('*', async (c, next) => {
  c.set('storage', storage)
  await next()
})

app.get('/', (c) => {
  return c.json({ message: 'Vicinae Extension Store API' })
})

if (storage instanceof LocalStorageAdapter) {
  app.get('/storage/*', async (c) => {
    try {
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
}

app.route('/', extensionsRouter)

export default app
