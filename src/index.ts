import { Hono } from "hono";
import { logger } from "hono/logger";
import { rateLimiter } from "hono-rate-limiter";
import { initAnalytics } from "@/analytics.js";
import { VALID_PLATFORMS } from "@/constants/platforms.js";
import { prisma } from "@/db.js";
import { ipMiddleware } from "@/middleware/ip.js";
import { startReviewWorker } from "@/reviews/worker.js";
import storageRouter from "@/routes/storage.js";
import v1 from "@/routes/v1/index.js";
import githubWebhook from "@/routes/webhooks/github.js";
import { createStorageFromEnv, LocalStorageAdapter } from "@/storage/index.js";
import type { AppContext } from "@/types/app.js";
import { authMiddleware } from "./middleware/auth";

await prisma.$transaction(
	VALID_PLATFORMS.map((p) =>
		prisma.extensionPlatform.upsert({
			create: { id: p },
			where: { id: p },
			update: {},
		}),
	),
);

await initAnalytics();

const app = new Hono<AppContext>();
const storage = createStorageFromEnv();

app.use(logger());
app.use("*", ipMiddleware());
app.use(
	"*",
	rateLimiter<AppContext>({
		windowMs: 60 * 1000,
		limit: 60,
		keyGenerator: (c) => c.get("clientIp"),
	}),
);
app.use("*", authMiddleware());
app.use("*", async (c, next) => {
	c.set("storage", storage);
	await next();
});

if (storage instanceof LocalStorageAdapter) {
	app.route("/", storageRouter);
}

app.get("/", (c) => {
	return c.json({ message: "Vicinae Backend" });
});

app.route("/webhooks/github", githubWebhook);

app.route("/v1", v1);

await startReviewWorker();

export default app;
