import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for data that must be readable later (unlike passwords, which are
 * hashed): 2FA secrets and queued messages. GCM also detects tampering: decrypting modified
 * data, or with the wrong key, throws.
 */

/** Reads a 32-byte key from a base64 setting, failing at startup if it's missing or wrong. */
export function keyFromBase64(value: string | undefined, settingName: string) {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error(
      `${settingName} must be 32 bytes, base64-encoded (openssl rand -base64 32)`,
    );
  }
  return key;
}

// Stored as "iv.authTag.ciphertext" (base64url).
export function encrypt(key: Buffer, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decrypt(key: Buffer, stored: string) {
  const [iv, authTag, ciphertext] = stored
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
