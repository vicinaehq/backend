import { describe, expect, test } from "bun:test";
import {
	buildCryptoPrices,
	normalizeOpenErApi,
	normalizeOpenExchangeRates,
	TOP_CRYPTO_COUNT,
} from "./currencies.js";

describe("buildCryptoPrices", () => {
	test("keys by uppercased symbol, first (biggest) coin wins", () => {
		const prices = buildCryptoPrices([
			{ symbol: "btc", current_price: 100000 },
			{ symbol: "btc", current_price: 1 },
			{ symbol: "eth", current_price: null },
		]);

		expect(prices).toEqual({ BTC: 100000 });
	});

	test("keeps at most the top coins", () => {
		const rows = Array.from({ length: TOP_CRYPTO_COUNT + 50 }, (_, i) => ({
			symbol: `c${i}`,
			current_price: i + 1,
		}));
		const prices = buildCryptoPrices(rows);

		expect(Object.keys(prices).length).toBe(TOP_CRYPTO_COUNT);
		expect(prices.C0).toBe(1);
		expect(prices[`C${TOP_CRYPTO_COUNT}`]).toBeUndefined();
	});

	test("rejects malformed payloads", () => {
		expect(() => buildCryptoPrices({ not: "an array" })).toThrow();
	});
});

describe("fiat normalizers", () => {
	test("normalizes an Open Exchange Rates payload", () => {
		const result = normalizeOpenExchangeRates({
			timestamp: 1754265600,
			base: "USD",
			rates: { EUR: 0.92 },
		});
		expect(result.rates.EUR).toBe(0.92);
		expect(result.updatedAt).toBe("2025-08-04T00:00:00.000Z");
	});

	test("normalizes an open.er-api.com payload", () => {
		const result = normalizeOpenErApi({
			result: "success",
			time_last_update_unix: 1754265600,
			rates: { EUR: 0.92 },
		});
		expect(result.rates.EUR).toBe(0.92);
		expect(result.updatedAt).toBe("2025-08-04T00:00:00.000Z");
	});

	test("rejects an open.er-api.com error payload", () => {
		expect(() => normalizeOpenErApi({ result: "error" })).toThrow();
	});
});
