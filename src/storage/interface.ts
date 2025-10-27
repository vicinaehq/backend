export interface StorageAdapter {
  put(
    key: string,
    data: Buffer | ReadableStream,
    metadata?: StorageMetadata
  ): Promise<void>;

  get(key: string): Promise<Buffer>;

  getUrl(key: string, expiresIn?: number): Promise<string>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}

export interface StorageMetadata {
  contentType?: string;
  contentLength?: number;
  [key: string]: any;
}

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
