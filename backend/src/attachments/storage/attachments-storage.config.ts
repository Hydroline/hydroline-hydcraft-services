export type AttachmentsStorageDriver = 'local' | 's3';

export type AttachmentsDeliveryMode = 'direct' | 'proxy';

export type AttachmentsStorageConfig = {
  driver: AttachmentsStorageDriver;
  attachmentsDir?: string;

  deliveryMode: AttachmentsDeliveryMode;
  publicBaseUrl?: string;

  s3?: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    keyPrefix: string;
    publicBaseUrl?: string;
  };
};

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required env: ${name}`);
  }
  return trimmed;
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

export function readAttachmentsStorageConfig(): AttachmentsStorageConfig {
  const driverRaw = process.env.ATTACHMENTS_STORAGE_DRIVER?.trim() || 'local';
  const driver = (
    driverRaw === 's3' ? 's3' : 'local'
  ) as AttachmentsStorageDriver;

  const deliveryModeRaw =
    process.env.ATTACHMENTS_DELIVERY_MODE?.trim() || 'direct';
  const deliveryMode =
    deliveryModeRaw === 'proxy'
      ? 'proxy'
      : ('direct' as AttachmentsDeliveryMode);

  const publicBaseUrl =
    process.env.ATTACHMENTS_PUBLIC_BASE_URL?.trim() || undefined;

  const attachmentsDir = process.env.ATTACHMENTS_DIR?.trim() || undefined;

  if (driver === 's3') {
    const endpoint = requireEnv('S3_ENDPOINT', process.env.S3_ENDPOINT);
    const region = requireEnv('S3_REGION', process.env.S3_REGION);
    const bucket = requireEnv('S3_BUCKET', process.env.S3_BUCKET);
    const accessKeyId = requireEnv(
      'S3_ACCESS_KEY_ID',
      process.env.S3_ACCESS_KEY_ID,
    );
    const secretAccessKey = requireEnv(
      'S3_SECRET_ACCESS_KEY',
      process.env.S3_SECRET_ACCESS_KEY,
    );
    const forcePathStyle = toBoolean(process.env.S3_FORCE_PATH_STYLE, false);
    const keyPrefix = (process.env.S3_KEY_PREFIX?.trim() || '').replace(
      /^\/+|\/+$/g,
      '',
    );
    const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim() || undefined;

    return {
      driver,
      attachmentsDir,
      deliveryMode,
      publicBaseUrl,
      s3: {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        forcePathStyle,
        keyPrefix,
        publicBaseUrl: s3PublicBaseUrl,
      },
    };
  }

  return {
    driver,
    attachmentsDir,
    deliveryMode,
    publicBaseUrl,
  };
}
