import { Hono } from "hono";
import type { AppContext } from "@/types/app.js";
import {
	queryRawRows,
	queryStats,
	queryAnalytics,
	migrateFromSqlite,
	VALID_GRANULARITIES,
	ALLOWED_FILTERS,
	type Granularity,
} from "@/analytics.js";

const admin = new Hono<AppContext>();

admin.use("*", async (c, next) => {
	if (!c.get("authenticated")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

admin.get("/telemetry/system-info", async (c) => {
	const limit = Math.min(Number(c.req.query("limit") || 100), 500);
	const offset = Number(c.req.query("offset") || 0);

	const data = await queryRawRows(limit, offset);

	return c.json({ data, limit, offset });
});

admin.get("/telemetry/system-info/stats", async (c) => {
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

	const data = await queryStats(granularity, periods);

	return c.json({ data, granularity, periods });
});

admin.get("/analytics", async (c) => {
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

admin.post("/telemetry/migrate", async (c) => {
	const result = await migrateFromSqlite();
	return c.json(result);
});

export default admin;
