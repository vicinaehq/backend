/**
 * Generic storage interface for handling file uploads and downloads
 * Supports multiple backends (local filesystem, S3, etc.)
 */
export interface StorageAdapter {
  /**
   * Store a file at the given key
   * @param key - Unique identifier for the file (e.g., "extensions/ext-id/version.zip")
   * @param data - File data as Buffer or ReadableStream
   * @param metadata - Optional metadata (content-type, etc.)
   * @returns Promise that resolves when upload is complete
   */
  put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void>;

  /**
   * Retrieve a file by key
   * @param key - Unique identifier for the file
   * @returns Promise that resolves to file data as Buffer
   */
  get(key: string): Promise<Buffer>;

  /**
   * Get a URL for downloading the file
   * For S3: returns a signed URL with expiration
   * For local: returns a URL path that the server can serve
   * @param key - Unique identifier for the file
   * @param expiresIn - Optional expiration time in seconds (for signed URLs)
   * @returns Promise that resolves to download URL
   */
  getUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Delete a file by key
   * @param key - Unique identifier for the file
   * @returns Promise that resolves when deletion is complete
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a file exists
   * @param key - Unique identifier for the file
   * @returns Promise that resolves to true if file exists
   */
  exists(key: string): Promise<boolean>;
}

/**
 * Metadata that can be attached to stored files
 */
export interface StorageMetadata {
  contentType?: string;
  contentLength?: number;
  [key: string]: any;
}

/**
 * Storage error for unified error handling
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "StorageError";
  }
}
