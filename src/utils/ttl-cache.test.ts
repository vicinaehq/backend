import { describe, expect, test } from "bun:test";
import { TtlCache } from "./ttl-cache.js";

describe("TtlCache", () => {
	test("caches the value within the TTL", async () => {
		let calls = 0;
		let clock = 0;
		const cache = new TtlCache(
			"test",
			1000,
			async () => {
				calls++;
				return calls;
			},
			() => clock,
		);

		expect((await cache.get()).value).toBe(1);
		clock = 999;
		expect((await cache.get()).value).toBe(1);
		expect(calls).toBe(1);
	});

	test("refetches once the TTL has elapsed", async () => {
		let calls = 0;
		let clock = 0;
		const cache = new TtlCache(
			"test",
			1000,
			async () => {
				calls++;
				return calls;
			},
			() => clock,
		);

		expect((await cache.get()).value).toBe(1);
		clock = 1000;
		expect((await cache.get()).value).toBe(2);
		expect(calls).toBe(2);
	});

	test("deduplicates concurrent fetches", async () => {
		let calls = 0;
		let release: (value: number) => void = () => {};
		const cache = new TtlCache("test", 1000, () => {
			calls++;
			return new Promise<number>((resolve) => {
				release = resolve;
			});
		});

		const first = cache.get();
		const second = cache.get();
		release(42);

		expect((await first).value).toBe(42);
		expect((await second).value).toBe(42);
		expect(calls).toBe(1);
	});

	test("serves stale data when a refresh fails", async () => {
		let calls = 0;
		let clock = 0;
		const cache = new TtlCache(
			"test",
			1000,
			async () => {
				calls++;
				if (calls > 1) throw new Error("upstream down");
				return "fresh";
			},
			() => clock,
		);

		expect((await cache.get()).value).toBe("fresh");
		clock = 2000;
		expect((await cache.get()).value).toBe("fresh");
		expect(calls).toBe(2);
	});

	test("throws when the first fetch fails", async () => {
		const cache = new TtlCache("test", 1000, async () => {
			throw new Error("upstream down");
		});

		await expect(cache.get()).rejects.toThrow("upstream down");
	});
});
