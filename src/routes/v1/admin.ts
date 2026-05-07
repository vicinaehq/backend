import { Hono } from "hono";
import type { AppContext } from "@/types/app.js";
import { startMigration } from "@/analytics.js";

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

export default admin;
