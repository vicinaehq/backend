import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import { dirname, join } from "path";
import type { StorageAdapter, StorageMetadata } from "./interface.js";
import { StorageError } from "./interface.js";

export interface LocalStorageConfig {
  basePath: string;
  baseUrl: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private config: LocalStorageConfig) {}

  async put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void> {
    try {
      const filePath = this.getFilePath(key);

      await mkdir(dirname(filePath), { recursive: true });

      let buffer: Buffer;
      if (data instanceof ReadableStream) {
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
    return `${this.config.baseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await unlink(filePath);
    } catch (error) {
      if ((error as any).code === "ENOENT") {
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

  private getFilePath(key: string): string {
    const normalizedKey = key.replace(/^\/+/, "").replace(/\.\.+/g, "");
    return join(this.config.basePath, normalizedKey);
  }
}
