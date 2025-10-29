import type { StorageAdapter } from "../storage"

export type AppContext = {
  Variables: {
    storage: StorageAdapter
    clientIp: string
    baseUrl: string
	version: `v${number}`;
  }
}
