import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter, StorageMetadata } from "./interface";
import { StorageError } from "./interface";

export interface S3StorageConfig {
  /**
   * AWS region (e.g., "us-east-1")
   */
  region: string;

  /**
   * S3 bucket name
   */
  bucket: string;

  /**
   * AWS access key ID (optional if using IAM roles)
   */
  accessKeyId?: string;

  /**
   * AWS secret access key (optional if using IAM roles)
   */
  secretAccessKey?: string;

  /**
   * Custom S3 endpoint (for S3-compatible services like MinIO, DigitalOcean Spaces)
   */
  endpoint?: string;

  /**
   * Force path style URLs (required for some S3-compatible services)
   */
  forcePathStyle?: boolean;

  /**
   * Default expiration time for signed URLs in seconds
   * @default 3600 (1 hour)
   */
  defaultUrlExpiration?: number;
}

/**
 * S3 storage adapter
 * Supports AWS S3 and S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
 */
export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private defaultUrlExpiration: number;

  constructor(private config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      credentials: config.accessKeyId
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey!,
          }
        : undefined,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
    });

    this.defaultUrlExpiration = config.defaultUrlExpiration ?? 3600;
  }

  async put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void> {
    try {
      // Handle different data types
      let body: Buffer | ReadableStream;
      if (data instanceof ReadableStream) {
        // S3 SDK can handle ReadableStream directly
        body = data;
      } else {
        body = data;
      }

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: metadata?.contentType,
        ContentLength: metadata?.contentLength,
        Metadata: this.extractCustomMetadata(metadata),
      });

      await this.client.send(command);
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
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error("Empty response body");
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      if ((error as any).name === "NoSuchKey") {
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
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(
        this.client,
        command,
        { expiresIn: expiresIn ?? this.defaultUrlExpiration }
      );

      return signedUrl;
    } catch (error) {
      throw new StorageError(
        `Failed to generate URL for key: ${key}`,
        "GET_URL_FAILED",
        error as Error
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      throw new StorageError(
        `Failed to delete file at key: ${key}`,
        "DELETE_FAILED",
        error as Error
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if ((error as any).name === "NotFound" || (error as any).name === "NoSuchKey") {
        return false;
      }
      throw new StorageError(
        `Failed to check existence of key: ${key}`,
        "EXISTS_FAILED",
        error as Error
      );
    }
  }

  /**
   * Extract custom metadata from StorageMetadata
   * Filters out standard fields (contentType, contentLength)
   */
  private extractCustomMetadata(
    metadata?: StorageMetadata
  ): Record<string, string> | undefined {
    if (!metadata) return undefined;

    const { contentType, contentLength, ...custom } = metadata;
    if (Object.keys(custom).length === 0) return undefined;

    // Convert all values to strings (S3 metadata requirement)
    return Object.fromEntries(
      Object.entries(custom).map(([k, v]) => [k, String(v)])
    );
  }
}
