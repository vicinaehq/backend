import { Hono } from 'hono'
import type { AppContext } from './types/app.js';
import { prisma } from './db.js';
import { VALID_PLATFORMS } from './constants/platforms.js';
import { createStorageFromEnv, LocalStorageAdapter } from './storage/index.js';
import { ipMiddleware } from './middleware/ip.js';
import storageRouter from './routes/storage.js';
import v1 from './routes/v1';

await prisma.$transaction(
	VALID_PLATFORMS.map(p => prisma.extensionPlatform.upsert({
		create: { id: p },
		where: { id: p },
		update: {}
	})),
);

const app = new Hono<AppContext>()
const storage = createStorageFromEnv();

app.use('*', ipMiddleware());

app.use('*', async (c, next) => {
  c.set('storage', storage)
  await next()
})

if (storage instanceof LocalStorageAdapter) {
	app.route('/', storageRouter);
}

app.get('/', (c) => {
  return c.json({ message: 'Vicinae Backend' })
})

app.route('/v1', v1);

export default app;
