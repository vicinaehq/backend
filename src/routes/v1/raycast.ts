import { Hono } from "hono";
import type { AppContext } from "@/types/app.js";

const app = new Hono<AppContext>();

const COMPAT_FILE_KEY = "raycast-compat.json";

app.get("/get-compat", async (c) => {
	const storage = c.get("storage");
	const compat = await storage.get(COMPAT_FILE_KEY);

	return c.json(JSON.parse(compat.toString("utf8")));
});

app.post("/upload-compat", async (c) => {
	if (!c.get("authenticated")) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.parseBody();
	const file = body["file"];

	if (!file || !(file instanceof File)) {
		return c.json({ error: "No file uploaded" }, 400);
	}

	const storage = c.get("storage");
	await storage.put(COMPAT_FILE_KEY, file.stream());

	return c.json({ message: "file uploaded successfuly" }, 201);
});

export default app;
