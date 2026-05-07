import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter } from "hono-rate-limiter";
import type { AppContext } from "@/types/app.js";
import {
	upsertSystemInfo,
	deleteUserData,
	queryAnalytics,
	VALID_GRANULARITIES,
	ALLOWED_FILTERS,
	type Granularity,
} from "@/analytics.js";
import { systemInfoSchema, forgetSchema } from "@/schemas/telemetry.js";

const telemetry = new Hono<AppContext>();

telemetry.post("/forget", zValidator("json", forgetSchema), async (c) => {
	const data = c.req.valid("json");

	await deleteUserData(data.userId);

	return c.json({
		message:
			"All records attached to this vicinae user id, if any, have been deleted.",
	});
});

telemetry.post(
	"/system-info",
	rateLimiter<AppContext>({
		windowMs: 60 * 1000,
		limit: 10,
		keyGenerator: (c) => c.get("clientIp"),
	}),
	zValidator("json", systemInfoSchema, (result, c) => {
		if ("error" in result && result.error) {
			const flat = result.error.flatten();
			console.warn("[telemetry] validation error:", JSON.stringify(flat));
			return c.json({ error: "Validation failed", details: flat }, 400);
		}
	}),
	async (c) => {
		const ua = c.req.header("User-Agent") || "";
		if (!ua.toLowerCase().startsWith("vicinae")) {
			return c.json({ error: "Forbidden" }, 403);
		}

		const data = c.req.valid("json");
		const today = new Date().toISOString().split("T")[0];
		const date = new Date(`${today}T00:00:00.000Z`);

		await upsertSystemInfo({ ...data, date });

		return c.json({ message: "ok" });
	},
);

telemetry.get("/analytics", async (c) => {
	const granularity = (c.req.query("granularity") || "daily") as Granularity;
	if (!VALID_GRANULARITIES.includes(granularity)) {
		return c.json(
			{
				error: `Invalid granularity. Must be one of: ${VALID_GRANULARITIES.join(", ")}`,
			},
			400,
		);
	}

	const periods = Math.min(Number(c.req.query("periods") || 30), 365);

	const filters: Record<string, string> = {};
	for (const key of Object.keys(ALLOWED_FILTERS)) {
		const value = c.req.query(key);
		if (value) {
			filters[key] = value;
		}
	}

	const data = await queryAnalytics(granularity, periods, filters);

	return c.json({ data, filters, granularity, periods });
});

export default telemetry;
