import { z } from 'zod';

const screenSchema = z.object({
	resolution: z.object({
		width: z.number().int().positive().max(32768),
		height: z.number().int().positive().max(32768),
	}),
	scale: z.number().positive().max(10),
});

export const forgetSchema = z.object({
	userId: z.string().min(1).max(256),
});

export const systemInfoSchema = z.object({
	userId: z.string().min(1).max(256),
	desktops: z.array(z.string().min(1).max(64)).min(1).max(10),
	vicinaeVersion: z.string().regex(/^v\d+\.\d+\.\d+$/),
	displayProtocol: z.string().min(1).max(32),
	architecture: z.string().min(1).max(32),
	operatingSystem: z.string().min(1).max(32),
	buildProvenance: z.string().min(1).max(64),
	locale: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
	screens: z.array(screenSchema).min(1).max(16),
	chassisType: z.enum(['laptop', 'desktop', 'other']),
	kernelVersion: z.string().min(1).max(128),
	productId: z.string().min(1).max(128),
	productVersion: z.string().min(1).max(128),
	qtVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional()
});

export type SystemInfoPayload = z.infer<typeof systemInfoSchema>;
