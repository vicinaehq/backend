import { z } from "zod";

export const findingSchema = z.object({
	path: z.string().min(1),
	line: z.number().int().positive(),
	endLine: z.number().int().positive().nullable(),
	severity: z.enum(["blocking", "warning", "suggestion"]),
	rule: z.string().min(1),
	title: z.string().min(1),
	explanation: z.string().min(1),
	remediation: z.string().min(1),
	suggestedChange: z.string().min(1).nullable(),
});
export const codexReviewSchema = z.object({
	summary: z.string().min(1),
	findings: z.array(findingSchema).max(30),
});
export type CodexReview = z.infer<typeof codexReviewSchema>;
export type Finding = z.infer<typeof findingSchema>;

export const reviewOutputJsonSchema = {
	type: "object",
	properties: {
		summary: { type: "string" },
		findings: {
			type: "array",
			maxItems: 30,
			items: {
				type: "object",
				properties: {
					path: { type: "string" },
					line: { type: "integer", minimum: 1 },
					endLine: {
						anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
					},
					severity: {
						type: "string",
						enum: ["blocking", "warning", "suggestion"],
					},
					rule: { type: "string" },
					title: { type: "string" },
					explanation: { type: "string" },
					remediation: { type: "string" },
					suggestedChange: {
						anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
					},
				},
				required: [
					"path",
					"line",
					"endLine",
					"severity",
					"rule",
					"title",
					"explanation",
					"remediation",
					"suggestedChange",
				],
				additionalProperties: false,
			},
		},
	},
	required: ["summary", "findings"],
	additionalProperties: false,
} as const;
