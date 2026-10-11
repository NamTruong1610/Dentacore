import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type AmqpConnectionManager,
  type ChannelWrapper,
} from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { MessageEncryption } from './message-encryption.js';
import {
  assertTopology,
  EXCHANGE,
  LIVE_EXCHANGE,
  MAX_ATTEMPTS,
  type QueueName,
} from './topology.js';

const PUBLISH_TIMEOUT_MS = 5_000;

export type MessageHandler<T> = (
  payload: T,
  meta: { routingKey: string; messageId: string; attempt: number },
) => Promise<void>;

/**
 * The connection to RabbitMQ. amqp-connection-manager reconnects automatically and re-runs the
 * channel setup (queues, bindings, consumers) after a reconnect.
 *
 * Delivery is "at least once": a message can occasionally arrive twice (e.g. the app crashes
 * after handling it but before acknowledging), so handlers must cope with repeats.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection!: AmqpConnectionManager;
  private publisher!: ChannelWrapper;
  private readonly consumers: ChannelWrapper[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: MessageEncryption,
  ) {}

  onModuleInit() {
    this.connection = amqp.connect([
      this.config.getOrThrow<string>('RABBITMQ_URL'),
    ]);
    this.connection.on('connect', () =>
      this.logger.log('Connected to RabbitMQ'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `Disconnected from RabbitMQ: ${err?.message ?? 'unknown reason'}`,
      ),
    );
    // Confirm channel: publish() resolves only once RabbitMQ has stored the message.
    this.publisher = this.connection.createChannel({
      confirm: true,
      setup: (channel: ConfirmChannel) => assertTopology(channel),
    });
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map((channel) => channel.close()));
    await this.publisher.close();
    await this.connection.close();
  }

  /** Publishes an already-encrypted outbox payload. Rejects if RabbitMQ doesn't confirm in time. */
  async publish(
    routingKey: string,
    encryptedPayload: string,
    messageId: string,
  ) {
    await this.publisher.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(encryptedPayload),
      {
        persistent: true,
        messageId,
        contentType: 'text/plain',
        timeout: PUBLISH_TIMEOUT_MS,
      },
    );
  }

  /**
   * Handles messages from `queue`. If the handler throws, the message is retried after
   * RETRY_DELAY_MS, up to MAX_ATTEMPTS times, then moved to "<queue>.dead".
   */
  consume<T>(queue: QueueName, handler: MessageHandler<T>) {
    const channel = this.connection.createChannel({
      setup: async (ch: ConfirmChannel) => {
        await assertTopology(ch);
        await ch.prefetch(10); // at most 10 unacknowledged messages at a time
        await ch.consume(queue, (message) => {
          if (message) {
            void this.handle(ch, queue, message, handler);
          }
        });
      },
    });
    this.consumers.push(channel);
  }

  private async handle<T>(
    ch: ConfirmChannel,
    queue: QueueName,
    message: ConsumeMessage,
    handler: MessageHandler<T>,
  ) {
    const headers = message.properties.headers ?? {};
    const attempt = Number(headers['x-attempt'] ?? 1);
    const messageId = String(message.properties.messageId);
    // A retried message comes back from "<queue>.retry" addressed to the queue itself, so its
    // routing key is the queue name. The original (e.g. "email.employee-invite") is kept in a
    // header when it's first retried.
    const routingKey = String(
      headers['x-original-routing-key'] ?? message.fields.routingKey,
    );
    try {
      const payload = this.encryption.decode<T>(message.content.toString());
      await handler(payload, { routingKey, messageId, attempt });
      ch.ack(message);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const giveUp = attempt >= MAX_ATTEMPTS;
      this.logger.warn(
        `${queue}: message ${messageId} failed (attempt ${attempt}/${MAX_ATTEMPTS})` +
          `${giveUp ? ', moving to dead-letter queue' : ', will retry'}: ${reason}`,
      );
      ch.sendToQueue(`${queue}.${giveUp ? 'dead' : 'retry'}`, message.content, {
        ...message.properties,
        headers: {
          ...headers,
          'x-attempt': attempt + 1,
          'x-original-routing-key': routingKey,
          'x-last-error': reason.slice(0, 500),
        },
      });
      ch.ack(message);
    }
  }

  /**
   * Runs `fn` with a short-lived channel, for one-off operations like inspecting a queue.
   * Messages taken with channel.get() and not acknowledged go back to their queue when the
   * channel closes.
   */
  async withTemporaryChannel<T>(fn: (channel: ConfirmChannel) => Promise<T>) {
    const connection = this.connection.connection;
    if (!connection) {
      throw new ServiceUnavailableException('RabbitMQ is not connected');
    }
    const channel = await connection.createConfirmChannel();
    try {
      return await fn(channel);
    } finally {
      await channel.close().catch(() => undefined);
    }
  }

  // --- Live notifications: every app instance hears every message (fanout). ---

  publishLive(payload: unknown) {
    void this.publisher
      .publish(LIVE_EXCHANGE, '', Buffer.from(JSON.stringify(payload)), {
        persistent: false,
        timeout: PUBLISH_TIMEOUT_MS,
      })
      .catch((error: Error) =>
        // Best effort: the notification is already saved and shows up when the list is loaded.
        this.logger.warn(`Live notification not published: ${error.message}`),
      );
  }

  consumeLive<T>(handler: (payload: T) => void) {
    const channel = this.connection.createChannel({
      setup: async (ch: ConfirmChannel) => {
        await assertTopology(ch);
        // A private queue for this app instance, deleted when it disconnects.
        const { queue } = await ch.assertQueue('', {
          exclusive: true,
          autoDelete: true,
        });
        await ch.bindQueue(queue, LIVE_EXCHANGE, '');
        await ch.consume(
          queue,
          (message) => {
            if (message) {
              handler(JSON.parse(message.content.toString()) as T);
            }
          },
          { noAck: true },
        );
      },
    });
    this.consumers.push(channel);
  }
}
