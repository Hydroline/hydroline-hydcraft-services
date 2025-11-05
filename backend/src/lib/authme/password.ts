import { createHash, timingSafeEqual } from 'node:crypto';

function sha256(buffer: Buffer): Buffer {
  return createHash('sha256').update(buffer).digest();
}

export function normalizePasswordSegments(
  stored: string,
): { algorithm: string; salt: string; hash: string } | null {
  if (!stored?.startsWith('$')) {
    return null;
  }
  const parts = stored.split('$');
  if (parts.length < 4) {
    return null;
  }
  const [, algorithm, salt, hash] = parts;
  if (!algorithm || !salt || !hash) {
    return null;
  }
  return { algorithm: algorithm.toUpperCase(), salt, hash };
}

export async function verifyShaPassword(
  stored: string,
  plain: string,
): Promise<boolean> {
  const segments = normalizePasswordSegments(stored);
  if (!segments || segments.algorithm !== 'SHA') {
    return false;
  }
  const stage1Hex = sha256(Buffer.from(plain, 'utf8')).toString('hex');
  const stage2 = sha256(Buffer.from(stage1Hex + segments.salt, 'utf8'));
  const stage2Hex = stage2.toString('hex');
  const expected = Buffer.from(stage2Hex, 'utf8');
  const storedHash = Buffer.from(segments.hash, 'utf8');
  try {
    return timingSafeEqual(expected, storedHash);
  } catch {
    return false;
  }
}
