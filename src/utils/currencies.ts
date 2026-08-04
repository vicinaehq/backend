import { z } from "zod";
import { TtlCache } from "./ttl-cache.js";

const FIAT_TTL_MS = 6 * 60 * 60 * 1000;
const CRYPTO_TTL_MS = 30 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10_000;

export const TOP_CRYPTO_COUNT = 100;

export type FiatRates = {
	/** Units of each currency per 1 USD. */
	rates: Record<string, number>;
	/** Upstream's last update time, ISO 8601. */
	updatedAt: string;
};

const openExchangeRatesSchema = z.object({
	timestamp: z.number(),
	rates: z.record(z.number()),
});

const openErApiSchema = z.object({
	result: z.literal("success"),
	time_last_update_unix: z.number(),
	rates: z.record(z.number()),
});

const coinGeckoMarketsSchema = z.array(
	z.object({
		symbol: z.string(),
		current_price: z.number().nullable(),
	}),
);

export function normalizeOpenExchangeRates(payload: unknown): FiatRates {
	const data = openExchangeRatesSchema.parse(payload);
	return {
		rates: data.rates,
		updatedAt: new Date(data.timestamp * 1000).toISOString(),
	};
}

export function normalizeOpenErApi(payload: unknown): FiatRates {
	const data = openErApiSchema.parse(payload);
	return {
		rates: data.rates,
		updatedAt: new Date(data.time_last_update_unix * 1000).toISOString(),
	};
}

/**
 * Map CoinGecko market rows to a ticker -> USD price record, keeping the
 * top coins. Rows are sorted by market cap, so on a ticker collision the
 * biggest coin wins.
 */
export function buildCryptoPrices(payload: unknown): Record<string, number> {
	const markets = coinGeckoMarketsSchema.parse(payload);
	const prices: Record<string, number> = {};
	let count = 0;
	for (const coin of markets) {
		if (count >= TOP_CRYPTO_COUNT) break;
		const ticker = coin.symbol.toUpperCase();
		if (coin.current_price !== null && !(ticker in prices)) {
			prices[ticker] = coin.current_price;
			count++;
		}
	}
	return prices;
}

async function fetchJson(
	url: string,
	headers?: Record<string, string>,
): Promise<unknown> {
	const response = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`${new URL(url).host} responded with ${response.status}`);
	}
	return response.json();
}

async function fetchFiatRates(): Promise<FiatRates> {
	const appId = process.env.OPENEXCHANGERATES_APP_ID;
	if (appId) {
		const payload = await fetchJson(
			`https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`,
		);
		return normalizeOpenExchangeRates(payload);
	}
	const payload = await fetchJson("https://open.er-api.com/v6/latest/USD");
	return normalizeOpenErApi(payload);
}

async function fetchCryptoPrices(): Promise<Record<string, number>> {
	const apiKey = process.env.COINGECKO_API_KEY;
	const payload = await fetchJson(
		"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1",
		apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
	);
	return buildCryptoPrices(payload);
}

export const fiatRatesCache = new TtlCache(
	"currencies/fiat",
	FIAT_TTL_MS,
	fetchFiatRates,
);

export const cryptoPricesCache = new TtlCache(
	"currencies/crypto",
	CRYPTO_TTL_MS,
	fetchCryptoPrices,
);
