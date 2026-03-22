import { z } from "zod";

const screenSchema = z.object({
	resolution: z.object({
		width: z.number(),
		height: z.number(),
	}),
	scale: z.number(),
});

export const forgetSchema = z.object({
	userId: z.string().min(1).max(256),
});

export const systemInfoSchema = z.object({
	userId: z.string().min(1).max(256),
	desktops: z.array(z.string().min(1).max(64)).max(10),
	vicinaeVersion: z.string().min(1).max(64),
	displayProtocol: z.string().min(1).max(32),
	architecture: z.string().min(1).max(32),
	operatingSystem: z.string().min(1).max(32),
	buildProvenance: z.string().min(1).max(64),
	locale: z.string().min(1).max(32),
	screens: z.array(screenSchema).max(16),
	chassisType: z.string().min(1).max(32),
	kernelVersion: z.string().min(1).max(128),
	productId: z.string().max(128),
	productVersion: z.string().max(128),
	qtVersion: z.string().max(64).optional(),
});

export type SystemInfoPayload = z.infer<typeof systemInfoSchema>;
