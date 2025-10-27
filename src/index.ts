import { Hono } from 'hono'
import { createStorageFromEnv } from './storage/index.js'
import type { StorageAdapter } from './storage/index.js'
import { LocalStorageAdapter } from './storage/index.js'
import extensionsRouter from './routes/extensions.js'

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

      let contentType = 'application/octet-stream';
      if (path.endsWith('.zip')) {
        contentType = 'application/zip';
      } else if (path.endsWith('.json')) {
        contentType = 'application/json';
      }

      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
        },
      });
    } catch (error) {
      return c.json({ error: 'File not found' }, 404);
    }
  });
}

app.route('/', extensionsRouter)

export default app
