import { createHash, randomBytes } from 'node:crypto';

/**
 * The token goes in the emailed link; only its SHA-256 hash is stored.
 * Someone who can read the database still can't build a working activation link.
 * (A fast hash is fine here because the token is 32 random bytes, so it can't be guessed.)
 */
export function createActivationToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashActivationToken(token) };
}

export function hashActivationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
