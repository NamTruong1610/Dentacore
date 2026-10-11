import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RabbitMqService } from './rabbitmq.service.js';

const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 50;

type OutboxRow = { id: string; routingKey: string; payload: string };

/**
 * Publishes OutboxMessage rows to RabbitMQ, oldest first, and deletes each one once RabbitMQ
 * confirms it. Runs every second in every app instance; "FOR UPDATE SKIP LOCKED" lets several
 * instances share the work without publishing the same row twice.
 *
 * If RabbitMQ is down, rows stay in the table (with attempts/lastError) and go out once it's back.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMqService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) {
      return; // the previous batch is still being published
    }
    this.running = true;
    try {
      await this.publishBatch();
    } catch (error) {
      this.logger.error(`Outbox relay failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async publishBatch() {
    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<OutboxRow[]>`
          SELECT id, "routingKey", payload FROM "OutboxMessage"
          ORDER BY "createdAt"
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED`;

        for (const row of rows) {
          try {
            await this.rabbit.publish(row.routingKey, row.payload, row.id);
            await tx.outboxMessage.delete({ where: { id: row.id } });
          } catch (error) {
            await tx.outboxMessage.update({
              where: { id: row.id },
              data: {
                attempts: { increment: 1 },
                lastError: (error as Error).message.slice(0, 500),
              },
            });
            break; // RabbitMQ is probably unavailable; try again on the next tick
          }
        }
      },
      { timeout: 30_000 },
    );
  }
}
