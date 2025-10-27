import type { StorageAdapter } from "./interface";
import { LocalStorageAdapter, type LocalStorageConfig } from "./local";
import { VercelBlobStorageAdapter, type VercelBlobStorageConfig } from "./vercel-blob";

export type StorageProvider = "local" | "vercel-blob";

export interface StorageConfig {
  provider: StorageProvider;
  local?: LocalStorageConfig;
  vercelBlob?: VercelBlobStorageConfig;
}

export function createStorage(config: StorageConfig): StorageAdapter {
  switch (config.provider) {
    case "local":
      if (!config.local) {
        throw new Error("Local storage config is required when provider is 'local'");
      }
      return new LocalStorageAdapter(config.local);

    case "vercel-blob":
      if (!config.vercelBlob) {
        throw new Error("Vercel Blob storage config is required when provider is 'vercel-blob'");
      }
      return new VercelBlobStorageAdapter(config.vercelBlob);

    default:
      throw new Error(`Unknown storage provider: ${config.provider}`);
  }
}

export function createStorageFromEnv(): StorageAdapter {
  const provider = (process.env.STORAGE_PROVIDER || "local") as StorageProvider;

  const config: StorageConfig = { provider };

  if (provider === "local") {
    const basePath = process.env.LOCAL_STORAGE_PATH || "./storage";
    const baseUrl = process.env.LOCAL_STORAGE_URL || "http://localhost:3000/storage";

    config.local = {
      basePath,
      baseUrl,
    };
  } else if (provider === "vercel-blob") {
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER=vercel-blob");
    }

    config.vercelBlob = {
      token,
    };
  }

  return createStorage(config);
}

export type { StorageAdapter, StorageMetadata } from "./interface";
export { StorageError } from "./interface";
export type { LocalStorageConfig } from "./local";
export { LocalStorageAdapter } from "./local";
export type { VercelBlobStorageConfig } from "./vercel-blob";
export { VercelBlobStorageAdapter } from "./vercel-blob";
