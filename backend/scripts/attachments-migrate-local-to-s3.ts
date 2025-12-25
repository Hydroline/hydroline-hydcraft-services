import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { LocalAttachmentStorage } from '../src/attachments/storage/local-attachment.storage';
import { S3AttachmentStorage } from '../src/attachments/storage/s3-attachment.storage';
import { readAttachmentsStorageConfig } from '../src/attachments/storage/attachments-storage.config';

type Args = {
  dryRun: boolean;
  concurrency: number;
  batchSize: number;
  includeDeleted: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    concurrency: 8,
    batchSize: 200,
    includeDeleted: false,
  };

  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw === '--include-deleted') args.includeDeleted = true;
    else if (raw.startsWith('--concurrency=')) {
      args.concurrency = Math.max(1, Number(raw.split('=')[1] ?? ''));
    } else if (raw.startsWith('--batch-size=')) {
      args.batchSize = Math.max(1, Number(raw.split('=')[1] ?? ''));
    }
  }

  if (!Number.isFinite(args.concurrency) || args.concurrency <= 0) {
    throw new Error('Invalid --concurrency');
  }
  if (!Number.isFinite(args.batchSize) || args.batchSize <= 0) {
    throw new Error('Invalid --batch-size');
  }

  return args;
}

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= concurrency) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job();
  };

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const cfg = readAttachmentsStorageConfig();
  if (!cfg.s3) {
    throw new Error(
      'Missing S3 config. Set ATTACHMENTS_STORAGE_DRIVER=s3 and S3_* env vars.',
    );
  }

  const prisma = new PrismaClient();
  const local = new LocalAttachmentStorage(
    LocalAttachmentStorage.resolveRootDir(),
  );
  const s3 = new S3AttachmentStorage({
    endpoint: cfg.s3.endpoint,
    region: cfg.s3.region,
    bucket: cfg.s3.bucket,
    accessKeyId: cfg.s3.accessKeyId,
    secretAccessKey: cfg.s3.secretAccessKey,
    forcePathStyle: cfg.s3.forcePathStyle,
    keyPrefix: cfg.s3.keyPrefix,
    publicBaseUrl: cfg.s3.publicBaseUrl,
  });

  let scanned = 0;
  let uploaded = 0;
  let skippedExists = 0;
  let missingLocal = 0;
  let missingS3 = 0;
  let failed = 0;

  const limit = createLimiter(args.concurrency);

  let lastId: string | null = null;

  try {
    while (true) {
      const batch = await prisma.attachment.findMany({
        where: {
          ...(args.includeDeleted ? {} : { deletedAt: null }),
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: args.batchSize,
        select: {
          id: true,
          storageKey: true,
          mimeType: true,
          size: true,
          deletedAt: true,
        },
      });

      if (batch.length === 0) break;
      lastId = batch[batch.length - 1]!.id;

      const tasks = batch.map((row) =>
        limit(async () => {
          scanned++;

          const localHead = await local.headObject(row.storageKey);
          if (!localHead.exists) {
            missingLocal++;
            return;
          }

          const s3Head = await s3.headObject(row.storageKey);
          if (s3Head.exists) {
            skippedExists++;
            return;
          }

          if (args.dryRun) {
            uploaded++;
            return;
          }

          try {
            const stream = await local.getObjectStream(row.storageKey);
            await s3.putObject({
              key: row.storageKey,
              body: stream,
              contentType: row.mimeType ?? undefined,
              contentLength:
                typeof row.size === 'number' ? row.size : undefined,
            });
            uploaded++;
          } catch {
            failed++;
          }

          const verify = await s3.headObject(row.storageKey);
          if (!verify.exists) {
            missingS3++;
          }
        }),
      );

      await Promise.all(tasks);

      // eslint-disable-next-line no-console
      console.log(
        `[local->s3] scanned=${scanned} uploaded=${uploaded} exists=${skippedExists} missingLocal=${missingLocal} failed=${failed}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  // eslint-disable-next-line no-console
  console.log(
    `[local->s3] DONE scanned=${scanned} uploaded=${uploaded} exists=${skippedExists} missingLocal=${missingLocal} missingS3=${missingS3} failed=${failed}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
