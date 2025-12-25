import { Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';
import type {
  AttachmentStorage,
  HeadObjectResult,
  PutObjectParams,
  PutObjectResult,
} from './attachment-storage.interface';

export type S3AttachmentStorageOptions = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  keyPrefix: string;
  publicBaseUrl?: string;
};

function normalizeKeyPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^\/+|\/+$/g, '') + '/';
}

function joinKey(prefix: string, key: string): string {
  const normalizedPrefix = normalizeKeyPrefix(prefix);
  const normalizedKey = key.replace(/^\/+/, '');
  return `${normalizedPrefix}${normalizedKey}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorName(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const name = error['name'];
  return typeof name === 'string' ? name : undefined;
}

function getHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const meta = error['$metadata'];
  if (!isRecord(meta)) return undefined;
  const code = meta['httpStatusCode'];
  return typeof code === 'number' ? code : undefined;
}

@Injectable()
export class S3AttachmentStorage implements AttachmentStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3AttachmentStorageOptions) {
    const config: S3ClientConfig = {
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };
    this.client = new S3Client(config);
  }

  private toObjectKey(key: string) {
    return joinKey(this.options.keyPrefix, key);
  }

  async putObject(params: PutObjectParams): Promise<PutObjectResult> {
    const objectKey = this.toObjectKey(params.key);
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
      },
    });
    const result = (await upload.done()) as {
      ETag?: string;
      VersionId?: string;
    };
    return {
      etag: result.ETag,
      versionId: result.VersionId,
    };
  }

  async getObjectStream(key: string): Promise<Readable> {
    const objectKey = this.toObjectKey(key);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );

    const body = result.Body;
    if (!body) {
      throw new Error('S3 object body missing');
    }

    // AWS SDK v3 returns Readable for Node
    return body as Readable;
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const objectKey = this.toObjectKey(key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey,
        }),
      );
      return {
        exists: true,
        size:
          typeof result.ContentLength === 'number'
            ? result.ContentLength
            : undefined,
      };
    } catch (error: unknown) {
      if (getErrorName(error) === 'NotFound' || error instanceof NoSuchKey) {
        return { exists: false };
      }
      // Some S3-compatible providers use 404 with different shapes
      if (getHttpStatus(error) === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  deleteObject(key: string): Promise<void> {
    // Optional for now; keep as noop to avoid accidental data loss.
    // If needed later, implement DeleteObjectCommand.
    void key;
    return Promise.resolve();
  }

  getPublicUrl(key: string): string | null {
    const base = this.options.publicBaseUrl?.trim();
    if (!base) {
      return null;
    }
    const objectKey = this.toObjectKey(key);
    return new URL(
      objectKey.replace(/^\/+/, ''),
      base.endsWith('/') ? base : `${base}/`,
    ).toString();
  }
}
