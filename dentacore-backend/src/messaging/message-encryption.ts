import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decrypt, encrypt, keyFromBase64 } from '../crypto/aes-gcm.js';

/**
 * Queued messages can contain temporary passwords and activation links (invite emails), and
 * they sit in the OutboxMessage table and in RabbitMQ until delivered. They're encrypted the
 * whole way with OUTBOX_ENCRYPTION_KEY, so a database or broker leak doesn't expose them.
 */
@Injectable()
export class MessageEncryption {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = keyFromBase64(
      config.get<string>('OUTBOX_ENCRYPTION_KEY'),
      'OUTBOX_ENCRYPTION_KEY',
    );
  }

  encode(payload: unknown) {
    return encrypt(this.key, JSON.stringify(payload));
  }

  decode<T>(stored: string): T {
    return JSON.parse(decrypt(this.key, stored)) as T;
  }
}
