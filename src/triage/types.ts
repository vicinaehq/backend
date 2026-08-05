import { z } from "zod";

export const issueTriageSchema = z.object({
	labels: z.array(z.string()).max(5),
	duplicates: z
		.array(
			z.object({
				issueNumber: z.number().int().positive(),
				confidence: z.number().min(0).max(1),
				reason: z.string().min(1),
			}),
		)
		.max(3),
});

export type IssueTriage = z.infer<typeof issueTriageSchema>;

export function issueTriageOutputSchema(
	labels: string[],
	candidates: number[],
) {
	const labelItems = labels.length
		? { type: "string" as const, enum: labels }
		: { type: "string" as const };
	const issueNumber = candidates.length
		? { type: "integer" as const, enum: candidates }
		: { type: "integer" as const };
	return {
		type: "object",
		properties: {
			labels: {
				type: "array",
				items: labelItems,
				maxItems: labels.length ? 5 : 0,
			},
			duplicates: {
				type: "array",
				maxItems: candidates.length ? 3 : 0,
				items: {
					type: "object",
					properties: {
						issueNumber,
						confidence: { type: "number", minimum: 0, maximum: 1 },
						reason: { type: "string" },
					},
					required: ["issueNumber", "confidence", "reason"],
					additionalProperties: false,
				},
			},
		},
		required: ["labels", "duplicates"],
		additionalProperties: false,
	} as const;
}
