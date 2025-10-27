import type { StorageAdapter } from "./interface";
import { LocalStorageAdapter, type LocalStorageConfig } from "./local";
import { S3StorageAdapter, type S3StorageConfig } from "./s3";

/**
 * Storage provider types
 */
export type StorageProvider = "local" | "s3";

/**
 * Configuration for storage factory
 */
export interface StorageConfig {
  provider: StorageProvider;
  local?: LocalStorageConfig;
  s3?: S3StorageConfig;
}

/**
 * Create a storage adapter based on configuration
 * @param config - Storage configuration
 * @returns Configured storage adapter instance
 */
export function createStorage(config: StorageConfig): StorageAdapter {
  switch (config.provider) {
    case "local":
      if (!config.local) {
        throw new Error("Local storage config is required when provider is 'local'");
      }
      return new LocalStorageAdapter(config.local);

    case "s3":
      if (!config.s3) {
        throw new Error("S3 storage config is required when provider is 's3'");
      }
      return new S3StorageAdapter(config.s3);

    default:
      throw new Error(`Unknown storage provider: ${config.provider}`);
  }
}

/**
 * Create storage from environment variables
 * Supports the following env vars:
 *
 * Common:
 * - STORAGE_PROVIDER: "local" or "s3"
 *
 * Local storage:
 * - LOCAL_STORAGE_PATH: Base directory for file storage
 * - LOCAL_STORAGE_URL: Base URL for serving files
 *
 * S3 storage:
 * - S3_REGION: AWS region
 * - S3_BUCKET: Bucket name
 * - S3_ACCESS_KEY_ID: AWS access key (optional if using IAM)
 * - S3_SECRET_ACCESS_KEY: AWS secret key (optional if using IAM)
 * - S3_ENDPOINT: Custom endpoint for S3-compatible services (optional)
 * - S3_FORCE_PATH_STYLE: "true" to force path-style URLs (optional)
 * - S3_URL_EXPIRATION: Default URL expiration in seconds (optional)
 */
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
  } else if (provider === "s3") {
    const region = process.env.S3_REGION;
    const bucket = process.env.S3_BUCKET;

    if (!region || !bucket) {
      throw new Error("S3_REGION and S3_BUCKET are required when STORAGE_PROVIDER=s3");
    }

    config.s3 = {
      region,
      bucket,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      defaultUrlExpiration: process.env.S3_URL_EXPIRATION
        ? parseInt(process.env.S3_URL_EXPIRATION, 10)
        : undefined,
    };
  }

  return createStorage(config);
}

// Re-export types and classes
export type { StorageAdapter, StorageMetadata } from "./interface";
export { StorageError } from "./interface";
export type { LocalStorageConfig } from "./local";
export { LocalStorageAdapter } from "./local";
export type { S3StorageConfig } from "./s3";
export { S3StorageAdapter } from "./s3";
