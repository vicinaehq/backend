export type CachedValue<T> = {
	value: T;
	fetchedAt: number;
};

/**
 * Single-entry TTL cache with request deduplication.
 *
 * Concurrent callers share one in-flight fetch. When a refresh fails but a
 * previously fetched value exists, the stale value is served instead of
 * surfacing the error.
 */
export class TtlCache<T> {
	private entry: CachedValue<T> | null = null;
	private inflight: Promise<T> | null = null;

	constructor(
		private readonly name: string,
		private readonly ttlMs: number,
		private readonly fetcher: () => Promise<T>,
		private readonly now: () => number = Date.now,
	) {}

	async get(): Promise<CachedValue<T>> {
		if (this.entry && this.now() - this.entry.fetchedAt < this.ttlMs) {
			return this.entry;
		}

		this.inflight ??= this.fetcher().finally(() => {
			this.inflight = null;
		});

		try {
			const value = await this.inflight;
			this.entry = { value, fetchedAt: this.now() };
			return this.entry;
		} catch (error) {
			if (this.entry) {
				console.warn(
					`[${this.name}] refresh failed, serving stale data:`,
					error,
				);
				return this.entry;
			}
			throw error;
		}
	}
}
