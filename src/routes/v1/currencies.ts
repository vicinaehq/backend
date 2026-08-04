import { Hono } from "hono";
import type { AppContext } from "@/types/app.js";
import { cryptoPricesCache, fiatRatesCache } from "@/utils/currencies.js";

const currencies = new Hono<AppContext>();

/**
 * GET /v1/currencies
 *
 * `fiat.rates` are units per 1 USD; `crypto.prices` are USD per 1 unit,
 * covering the top coins by market cap. The crypto section is best-effort:
 * it is omitted when its upstream is unavailable.
 */
currencies.get("/", async (c) => {
	try {
		const fiat = await fiatRatesCache.get();

		let crypto:
			| { updatedAt: string; prices: Record<string, number> }
			| undefined;

		try {
			const prices = await cryptoPricesCache.get();
			crypto = {
				updatedAt: new Date(prices.fetchedAt).toISOString(),
				prices: prices.value,
			};
		} catch (error) {
			console.error("[currencies] crypto fetch failed:", error);
		}

		c.header("Cache-Control", "public, max-age=600");
		return c.json({
			base: "USD",
			fiat: { updatedAt: fiat.value.updatedAt, rates: fiat.value.rates },
			...(crypto ? { crypto } : {}),
		});
	} catch (error) {
		console.error("[currencies] upstream fetch failed:", error);
		return c.json({ error: "Failed to fetch exchange rates." }, 502);
	}
});

export default currencies;
