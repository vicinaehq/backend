import { Hono } from "hono";
import { startMigration } from "@/analytics.js";
import { enqueueMassIssueTriage } from "@/triage/worker.js";
import type { AppContext } from "@/types/app.js";

const admin = new Hono<AppContext>();

admin.use("*", async (c, next) => {
	if (!c.get("authenticated")) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
});

admin.post("/telemetry/migrate", (c) => {
	if (!startMigration()) {
		return c.json({ error: "Migration already in progress" }, 409);
	}
	return c.json({ message: "Migration started" }, 202);
});

admin.post("/issues/triage", async (c) => {
	const fullName = process.env.GITHUB_TRIAGE_REPOSITORY;
	if (!fullName)
		return c.json({ error: "GITHUB_TRIAGE_REPOSITORY is not configured" }, 503);
	let body: { limit?: unknown; state?: unknown };
	try {
		body = await c.req.json();
	} catch {
		body = {};
	}
	const limit = body.limit === undefined ? 25 : Number(body.limit);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
		return c.json({ error: "limit must be an integer between 1 and 100" }, 400);
	const state = body.state ?? "open";
	if (state !== "open" && state !== "all")
		return c.json({ error: "state must be open or all" }, 400);
	const [owner, repo, ...extra] = fullName.split("/");
	if (!owner || !repo || extra.length)
		return c.json({ error: "GITHUB_TRIAGE_REPOSITORY is invalid" }, 500);
	const queued = enqueueMassIssueTriage({ owner, repo, limit, state });
	if (!queued)
		return c.json(
			{ error: "Mass issue triage is already queued or running" },
			409,
		);
	return c.json({ message: "Mass issue triage queued", limit, state }, 202);
});

export default admin;
