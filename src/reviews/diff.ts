export function addedLines(patch: string | undefined): Set<number> {
	const lines = new Set<number>();
	if (!patch) return lines;
	let newLine = 0;
	for (const text of patch.split("\n")) {
		const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
		if (hunk) {
			newLine = Number(hunk[2]);
			continue;
		}
		if (text.startsWith("+") && !text.startsWith("+++")) lines.add(newLine++);
		else if (text.startsWith("-") && !text.startsWith("---")) continue;
		else if (!text.startsWith("\\")) {
			newLine++;
		}
	}
	return lines;
}
