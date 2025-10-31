import type { StorageAdapter } from "@/storage/index.js"

export type AppContext = {
  Variables: {
    storage: StorageAdapter
    clientIp: string
    baseUrl: string
	version: `v${number}`;
	authenticated: boolean;
  }
}
