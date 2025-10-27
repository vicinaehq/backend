import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import { dirname, join } from "path";
import type { StorageAdapter, StorageMetadata } from "./interface";
import { StorageError } from "./interface";

export interface LocalStorageConfig {
  /**
   * Base directory where files will be stored
   * @example "/var/data/extensions"
   */
  basePath: string;

  /**
   * Base URL for serving files
   * @example "http://localhost:3000/storage"
   */
  baseUrl: string;
}

/**
 * Local filesystem storage adapter
 * Stores files in a local directory and serves them via HTTP
 */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private config: LocalStorageConfig) {}

  async put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void> {
    try {
      const filePath = this.getFilePath(key);

      // Create directory if it doesn't exist
      await mkdir(dirname(filePath), { recursive: true });

      // Handle different data types
      let buffer: Buffer;
      if (data instanceof ReadableStream) {
        // Convert ReadableStream to Buffer
        const reader = data.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        buffer = Buffer.concat(chunks);
      } else {
        buffer = data;
      }

      // Write file
      await writeFile(filePath, buffer);
    } catch (error) {
      throw new StorageError(
        `Failed to store file at key: ${key}`,
        "PUT_FAILED",
        error as Error
      );
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const filePath = this.getFilePath(key);
      return await readFile(filePath);
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        throw new StorageError(
          `File not found: ${key}`,
          "NOT_FOUND",
          error as Error
        );
      }
      throw new StorageError(
        `Failed to read file at key: ${key}`,
        "GET_FAILED",
        error as Error
      );
    }
  }

  async getUrl(key: string, expiresIn?: number): Promise<string> {
    // For local storage, expiration is not enforced (would need application-level logic)
    // Return a URL that the application can serve
    return `${this.config.baseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await unlink(filePath);
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        // File doesn't exist, consider it deleted
        return;
      }
      throw new StorageError(
        `Failed to delete file at key: ${key}`,
        "DELETE_FAILED",
        error as Error
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full filesystem path for a key
   */
  private getFilePath(key: string): string {
    // Normalize key to prevent directory traversal
    const normalizedKey = key.replace(/^\/+/, "").replace(/\.\.+/g, "");
    return join(this.config.basePath, normalizedKey);
  }
}
