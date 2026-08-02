import { describe, expect, test } from "bun:test";
import { addedLines, commentableLines } from "./diff.js";

describe("diff line parsing", () => {
	test("returns new-side line numbers across hunks", () => {
		const patch = `@@ -2,3 +2,4 @@
 context
-old
+new
+another
 context
@@ -20,2 +21,2 @@
 context
+added`;
		expect([...addedLines(patch)]).toEqual([3, 4, 22]);
	});

	test("returns no lines when GitHub omitted the patch", () => {
		expect([...addedLines(undefined)]).toEqual([]);
	});

	test("returns added and context lines that GitHub can comment on", () => {
		const patch = `@@ -2,3 +2,4 @@
 context
-old
+new
+another
 context`;
		expect([...commentableLines(patch)]).toEqual([2, 3, 4, 5]);
	});
});
