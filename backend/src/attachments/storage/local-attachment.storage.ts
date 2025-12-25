import { Injectable } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type {
  AttachmentStorage,
  HeadObjectResult,
  PutObjectParams,
  PutObjectResult,
} from './attachment-storage.interface';

@Injectable()
export class LocalAttachmentStorage implements AttachmentStorage {
  constructor(private readonly rootDir: string) {}

  static resolveRootDir(): string {
    const envValue = process.env.ATTACHMENTS_DIR?.trim();
    if (envValue && envValue.length > 0) {
      return isAbsolute(envValue) ? envValue : resolve(process.cwd(), envValue);
    }
    return resolve(process.cwd(), '..', 'uploads');
  }

  private getPhysicalPath(key: string) {
    return join(this.rootDir, key);
  }

  async putObject(params: PutObjectParams): Promise<PutObjectResult> {
    const filePath = this.getPhysicalPath(params.key);
    await fs.mkdir(dirname(filePath), { recursive: true });

    const writable = createWriteStream(filePath);
    await pipeline(params.body, writable);

    return {};
  }

  async getObjectStream(key: string): Promise<Readable> {
    const filePath = this.getPhysicalPath(key);
    await fs.access(filePath);
    return createReadStream(filePath);
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const filePath = this.getPhysicalPath(key);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return { exists: false };
      }
      return { exists: true, size: stat.size };
    } catch {
      return { exists: false };
    }
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.getPhysicalPath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore missing
    }
  }

  ensureDirectory(pathFragment: string) {
    const dir = join(this.rootDir, pathFragment);
    return fs.mkdir(dir, { recursive: true });
  }
}
