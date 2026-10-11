import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { decrypt, encrypt, keyFromBase64 } from '../crypto/aes-gcm.js';

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
    this.key = keyFromBase64(
      config.get<string>('TOTP_ENCRYPTION_KEY'),
      'TOTP_ENCRYPTION_KEY',
    );
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
      encryptedSecret: encrypt(this.key, secret),
    };
  }

  /**
   * Checks a 6-digit code against the previous, current and next 30-second period
   * (allows for slow typing and clock drift).
   * Returns the period the code belongs to, or null if it's wrong. Callers save that period
   * so the same code can't be used twice (see TwoFactorService).
   */
  matchStep(encryptedSecret: string, code: string): number | null {
    const totp = this.totp(decrypt(this.key, encryptedSecret));
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
}
