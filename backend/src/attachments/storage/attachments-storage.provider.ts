import { Provider } from '@nestjs/common';
import { ATTACHMENT_STORAGE } from './attachment-storage.token';
import { readAttachmentsStorageConfig } from './attachments-storage.config';
import { LocalAttachmentStorage } from './local-attachment.storage';
import { S3AttachmentStorage } from './s3-attachment.storage';
import type { AttachmentStorage } from './attachment-storage.interface';

export const attachmentsStorageProvider: Provider<AttachmentStorage> = {
  provide: ATTACHMENT_STORAGE,
  useFactory: () => {
    const config = readAttachmentsStorageConfig();

    if (config.driver === 's3') {
      const s3 = config.s3!;
      return new S3AttachmentStorage({
        endpoint: s3.endpoint,
        region: s3.region,
        bucket: s3.bucket,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        forcePathStyle: s3.forcePathStyle,
        keyPrefix: s3.keyPrefix,
        publicBaseUrl: config.publicBaseUrl || s3.publicBaseUrl,
      });
    }

    const rootDir = LocalAttachmentStorage.resolveRootDir();
    return new LocalAttachmentStorage(rootDir);
  },
};
