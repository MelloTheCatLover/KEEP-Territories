import crypto from 'crypto';
import { env } from './env';

// Reversible encryption for issued passwords: the DB never holds them in clear,
// but an admin can recover them through the app. Key is derived from JWT_SECRET
// so no extra env var is needed (rotating JWT_SECRET invalidates old values).
const KEY = crypto.createHash('sha256').update(env.jwt.secret).digest();
const PREFIX = 'enc:v1:';

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypts a value produced by encryptSecret. Values without the marker are
 * returned as-is (legacy plaintext) so old rows keep working; values that fail
 * to decrypt return null rather than throwing.
 */
export function decryptSecret(stored: string | null): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
