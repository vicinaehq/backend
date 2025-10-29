import { Hono } from 'hono'
import type { AppContext } from './types/app.js';
import { createStorageFromEnv, LocalStorageAdapter, type StorageAdapter } from './storage/index.js'
import extensionsRouter from './routes/extensions.js'
import localStorageRouter from './routes/storage.js'

const app = new Hono<AppContext>()
const storage = createStorageFromEnv();

app.use('*', async (c, next) => {
  c.set('storage', storage)
  await next()
})

app.get('/', (c) => {
  return c.json({ message: 'Vicinae Backend' })
})

app.route('/', extensionsRouter)

if (storage instanceof LocalStorageAdapter) {
	app.route('/', localStorageRouter);
}

export default app
