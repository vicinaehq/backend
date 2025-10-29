import type { StorageAdapter } from "../storage"

export type AppContext = {
  Variables: {
    storage: StorageAdapter
  }
}
