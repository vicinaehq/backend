import { put, del, head } from '@vercel/blob';
import type { StorageAdapter, StorageMetadata } from './interface.js';
import { StorageError } from './interface.js';

export interface VercelBlobStorageConfig {
  token: string;
}

export class VercelBlobStorageAdapter implements StorageAdapter {
  private urlCache = new Map<string, string>();

  constructor(private config: VercelBlobStorageConfig) {}

  async put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void> {
    try {
      const result = await put(key, data, {
        access: 'public',
        token: this.config.token,
        contentType: metadata?.contentType,
      });

      this.urlCache.set(key, result.url);
    } catch (error) {
      throw new StorageError(
        `Failed to store file at key: ${key}`,
        'PUT_FAILED',
        error as Error
      );
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const url = this.urlCache.get(key);
      if (!url) {
        throw new Error('URL not found in cache');
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new StorageError(
        `Failed to read file at key: ${key}`,
        'GET_FAILED',
        error as Error
      );
    }
  }

  async getUrl(key: string, expiresIn?: number): Promise<string> {
    const url = this.urlCache.get(key);
    if (url) {
      return url;
    }

    throw new StorageError(
      `URL not found for key: ${key}`,
      'GET_URL_FAILED'
    );
  }

  async delete(key: string): Promise<void> {
    try {
      const url = this.urlCache.get(key);
      if (!url) {
        return;
      }

      await del(url, {
        token: this.config.token,
      });

      this.urlCache.delete(key);
    } catch (error) {
      throw new StorageError(
        `Failed to delete file at key: ${key}`,
        'DELETE_FAILED',
        error as Error
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const url = this.urlCache.get(key);
      if (!url) {
        return false;
      }

      const metadata = await head(url, {
        token: this.config.token,
      });

      return metadata !== null;
    } catch {
      return false;
    }
  }
}
