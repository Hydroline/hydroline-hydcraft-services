import type { Readable } from 'node:stream';

export type PutObjectParams = {
  key: string;
  contentType?: string;
  contentLength?: number;
  body: Readable;
};

export type PutObjectResult = {
  etag?: string;
  versionId?: string;
};

export type HeadObjectResult = {
  exists: boolean;
  size?: number;
};

export interface AttachmentStorage {
  putObject(params: PutObjectParams): Promise<PutObjectResult>;
  getObjectStream(key: string): Promise<Readable>;
  headObject(key: string): Promise<HeadObjectResult>;
  deleteObject(key: string): Promise<void>;

  /**
   * Return a public URL for the object key when possible.
   * If not configured/supported, return null.
   */
  getPublicUrl?(key: string): string | null;
}
