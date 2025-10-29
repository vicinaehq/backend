import { Hono } from 'hono'
import type { AppContext } from './types/app.js';
import { createStorageFromEnv, LocalStorageAdapter } from './storage/index.js'
import extensionsRouter from './routes/extensions.js'
import localStorageRouter from './routes/storage.js'
import { prisma } from './db.js';
import { VALID_PLATFORMS } from './constants/platforms.js';
import { ipMiddleware } from './middleware/ip.js';

const app = new Hono<AppContext>()
const storage = createStorageFromEnv();
const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

await prisma.$transaction(
	VALID_PLATFORMS.map(p => prisma.extensionPlatform.upsert({
		create: { id: p },
		where: { id: p },
		update: {}
	})),
);

// Extract client IP from reverse proxy headers
app.use('*', ipMiddleware());

// Inject shared context variables
app.use('*', async (c, next) => {
  c.set('storage', storage)
  c.set('baseUrl', baseUrl)
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
