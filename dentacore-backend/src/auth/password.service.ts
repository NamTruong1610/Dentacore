import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

// No look-alike characters (0/O, 1/l/I), so a temporary password is easy to type from an email.
const TEMP_PASSWORD_CHARS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

@Injectable()
export class PasswordService {
  // argon2id with the library's defaults (OWASP-recommended).
  async hash(password: string) {
    return await hash(password);
  }

  async verify(passwordHash: string, password: string) {
    return await verify(passwordHash, password);
  }

  generateTemporaryPassword(length = 16) {
    return Array.from(
      { length },
      () => TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)],
    ).join('');
  }
}
