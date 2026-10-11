import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageEncryption } from './message-encryption.js';

// A transaction client (tx) or PrismaService itself.
type OutboxDb = Pick<PrismaService, 'outboxMessage'>;

/**
 * Queues a message by saving it in the OutboxMessage table. Pass the transaction (`tx`) that
 * makes the related change, so both are saved together or not at all. OutboxRelay publishes
 * it to RabbitMQ shortly after the transaction commits.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly encryption: MessageEncryption) {}

  async add(db: OutboxDb, routingKey: string, payload: unknown) {
    await db.outboxMessage.create({
      data: { routingKey, payload: this.encryption.encode(payload) },
    });
  }
}
