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
	findings: z.array(findingSchema),
});
export type CodexReview = z.infer<typeof codexReviewSchema>;
export type Finding = z.infer<typeof findingSchema>;

export const reviewRuleCatalogSchema = z
	.object({
		version: z.number().int().positive(),
		rules: z
			.array(
				z.object({
					id: z.string().regex(/^[A-Z]+-\d{3}$/),
					title: z.string().min(1),
					defaultSeverity: z.enum(["blocking", "warning", "suggestion"]),
					guidance: z.array(z.string().min(1)).min(1),
				}),
			)
			.min(1),
	})
	.refine(
		(catalog) =>
			new Set(catalog.rules.map((rule) => rule.id)).size ===
			catalog.rules.length,
		{ message: "Review rule IDs must be unique" },
	);

export function reviewOutputJsonSchema(ruleIds: string[]) {
	return {
		type: "object",
		properties: {
			summary: { type: "string" },
			findings: {
				type: "array",
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
						rule: { type: "string", enum: ruleIds },
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
}
