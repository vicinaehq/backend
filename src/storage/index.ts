import type { StorageAdapter } from "./interface.js";
import { LocalStorageAdapter, type LocalStorageConfig } from "./local.js";

export interface StorageConfig {
  basePath: string;
  baseUrl: string;
}

export function createStorage(config: StorageConfig): StorageAdapter {
  return new LocalStorageAdapter(config);
}

export function createStorageFromEnv(): StorageAdapter {
  const basePath = process.env.LOCAL_STORAGE_PATH || "./storage";
  const baseUrl = process.env.LOCAL_STORAGE_URL || "http://localhost:3000/storage";

  return createStorage({
    basePath,
    baseUrl,
  });
}

export type { StorageAdapter, StorageMetadata } from "./interface.js";
export { StorageError } from "./interface.js";
export type { LocalStorageConfig } from "./local.js";
export { LocalStorageAdapter } from "./local.js";
