import { createHash, randomBytes } from 'node:crypto';

/**
 * Random tokens for activation links, session cookies and login challenges.
 * The token goes to the browser (cookie or emailed link); only its SHA-256 hash is stored,
 * so someone who can read the database still can't use any of them.
 * (A fast hash is fine because the token is 32 random bytes, so it can't be guessed.)
 */
export function createToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
