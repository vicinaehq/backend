import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter } from "hono-rate-limiter";
import type { AppContext } from "@/types/app.js";
import { prisma } from "@/db.js";
import { systemInfoSchema, forgetSchema } from "@/schemas/telemetry.js";

const telemetry = new Hono<AppContext>();

telemetry.post("/forget", zValidator("json", forgetSchema), async (c) => {
	const data = c.req.valid("json");

	await prisma.telemetrySystemInfo.deleteMany({
		where: {
			userId: data.userId,
		},
	});

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
	zValidator("json", systemInfoSchema),
	async (c) => {
		const ua = c.req.header("User-Agent") || "";
		if (!ua.toLowerCase().startsWith("vicinae")) {
			return c.json({ error: "Forbidden" }, 403);
		}

		const data = c.req.valid("json");
		const today = new Date().toISOString().split("T")[0];
		const date = new Date(`${today}T00:00:00.000Z`);

		await prisma.telemetrySystemInfo.upsert({
			where: { userId_date: { userId: data.userId, date } },
			create: {
				userId: data.userId,
				date,
				desktops: JSON.stringify(data.desktops),
				vicinaeVersion: data.vicinaeVersion,
				displayProtocol: data.displayProtocol,
				architecture: data.architecture,
				operatingSystem: data.operatingSystem,
				buildProvenance: data.buildProvenance,
				locale: data.locale,
				screens: JSON.stringify(data.screens),
				chassisType: data.chassisType,
				kernelVersion: data.kernelVersion,
				productId: data.productId,
				productVersion: data.productVersion,
				qtVersion: data.qtVersion,
			},
			update: {
				desktops: JSON.stringify(data.desktops),
				vicinaeVersion: data.vicinaeVersion,
				displayProtocol: data.displayProtocol,
				architecture: data.architecture,
				operatingSystem: data.operatingSystem,
				buildProvenance: data.buildProvenance,
				locale: data.locale,
				screens: JSON.stringify(data.screens),
				chassisType: data.chassisType,
				kernelVersion: data.kernelVersion,
				productId: data.productId,
				productVersion: data.productVersion,
				qtVersion: data.qtVersion,
			},
		});

		return c.json({ message: "ok" });
	},
);

export default telemetry;
