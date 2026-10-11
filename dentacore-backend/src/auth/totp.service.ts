import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

/**
 * TOTP two-factor auth: the 6-digit codes from authenticator apps (Google Authenticator, 1Password, ...).
 *
 * The secret has to be readable later to check codes, so it can't be hashed like a password.
 * Instead it's encrypted (AES-256-GCM) with TOTP_ENCRYPTION_KEY before it's stored,
 * so a leaked database alone isn't enough to generate someone's codes.
 */
@Injectable()
export class TotpService {
  private readonly key: Buffer;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('TOTP_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.key.length !== 32) {
      throw new Error(
        'TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)',
      );
    }
    this.issuer = config.get<string>('TOTP_ISSUER', 'Dentacore');
  }

  /**
   * Creates a new secret for an account.
   * `secret` and `otpauthUri` are shown to the employee once (as text and as a QR code);
   * only `encryptedSecret` is stored.
   */
  async createSetup(accountName: string) {
    const secret = new Secret({ size: 20 }).base32;
    const otpauthUri = this.totp(secret, accountName).toString();
    return {
      secret,
      otpauthUri,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUri),
      encryptedSecret: this.encrypt(secret),
    };
  }

  /**
   * Checks a 6-digit code against the previous, current and next 30-second period
   * (allows for slow typing and clock drift).
   * Returns the period the code belongs to, or null if it's wrong. Callers save that period
   * so the same code can't be used twice (see TwoFactorService).
   */
  matchStep(encryptedSecret: string, code: string): number | null {
    const totp = this.totp(this.decrypt(encryptedSecret));
    const delta = totp.validate({ token: code, window: 1 });
    return delta === null ? null : totp.counter() + delta;
  }

  private totp(secret: string, accountName?: string) {
    return new TOTP({
      issuer: this.issuer,
      label: accountName,
      secret: Secret.fromBase32(secret),
    });
  }

  // Stored as "iv.authTag.ciphertext" (base64url).
  private encrypt(plaintext: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decrypt(stored: string) {
    const [iv, authTag, ciphertext] = stored
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
