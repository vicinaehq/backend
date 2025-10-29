import { Hono } from 'hono'
import type { AppContext } from './types/app.js';
import { createStorageFromEnv, LocalStorageAdapter } from './storage/index.js'
import extensionsRouter from './routes/extensions.js'
import localStorageRouter from './routes/storage.js'
import { prisma } from './db.js';
import { VALID_PLATFORMS } from './constants/platforms.js';

const app = new Hono<AppContext>()
const storage = createStorageFromEnv();

await prisma.$transaction(
	VALID_PLATFORMS.map(p => prisma.extensionPlatform.upsert({
		create: { id: p },
		where: { id: p },
		update: {}
	})),
);

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
