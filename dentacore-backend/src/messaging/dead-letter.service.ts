import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConfirmChannel, GetMessage } from 'amqplib';
import { MessageEncryption } from './message-encryption.js';
import { RabbitMqService } from './rabbitmq.service.js';
import { EXCHANGE, QUEUES } from './topology.js';

// Look at (or act on) at most this many dead messages per queue per request.
const MAX_PER_QUEUE = 500;

const DEAD_QUEUES = Object.values(QUEUES).map(({ name }) => `${name}.dead`);

/**
 * Messages that failed every retry end up in "<queue>.dead". This lets an admin see them,
 * send them again (e.g. after fixing the mail server) or discard them.
 *
 * How it reads a queue without losing anything: it takes messages with channel.get() and only
 * acknowledges the ones it re-sends or discards. Closing the channel puts the rest back.
 */
@Injectable()
export class DeadLetterService {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly encryption: MessageEncryption,
  ) {}

  async list() {
    return await this.rabbit.withTemporaryChannel(async (channel) => {
      const result = [];
      for (const queue of DEAD_QUEUES) {
        for (const message of await takeAll(channel, queue)) {
          result.push(this.describe(queue, message));
        }
      }
      return result; // nothing acknowledged: all go back when the channel closes
    });
  }

  /** Puts messages back on their original route (all of them if `messageIds` is omitted). */
  async retry(messageIds?: string[]) {
    return await this.process(messageIds, async (channel, message) => {
      const { headers = {} } = message.properties;
      const routingKey = String(
        headers['x-original-routing-key'] ?? message.fields.routingKey,
      );
      // Same message ID (so consumers still recognise repeats), fresh attempt count.
      channel.publish(EXCHANGE, routingKey, message.content, {
        persistent: true,
        messageId: message.properties.messageId,
        contentType: message.properties.contentType,
      });
      await channel.waitForConfirms();
    });
  }

  async discard(messageIds: string[]) {
    if (messageIds.length === 0) {
      throw new BadRequestException('List the messageIds to discard');
    }
    return await this.process(messageIds, async () => undefined);
  }

  private async process(
    messageIds: string[] | undefined,
    action: (channel: ConfirmChannel, message: GetMessage) => Promise<void>,
  ) {
    const wanted = messageIds && new Set(messageIds);
    return await this.rabbit.withTemporaryChannel(async (channel) => {
      let count = 0;
      for (const queue of DEAD_QUEUES) {
        for (const message of await takeAll(channel, queue)) {
          if (!wanted || wanted.has(String(message.properties.messageId))) {
            await action(channel, message);
            channel.ack(message); // removes it from the dead-letter queue
            count += 1;
          }
        }
      }
      return { count };
    });
  }

  // What an admin needs to decide; never the full payload (invites contain temporary passwords).
  private describe(queue: string, message: GetMessage) {
    const { headers = {}, messageId } = message.properties;
    const routingKey = String(
      headers['x-original-routing-key'] ?? message.fields.routingKey,
    );
    return {
      queue,
      messageId: String(messageId),
      routingKey,
      attempts: Number(headers['x-attempt'] ?? 1) - 1,
      lastError: headers['x-last-error']
        ? String(headers['x-last-error'])
        : null,
      details: this.safeDetails(message.content.toString()),
    };
  }

  private safeDetails(content: string) {
    try {
      const payload = this.encryption.decode<Record<string, unknown>>(content);
      return {
        to: typeof payload.to === 'string' ? payload.to : undefined,
        employeeId:
          typeof payload.employeeId === 'string'
            ? payload.employeeId
            : undefined,
      };
    } catch {
      return { unreadable: true }; // e.g. encrypted with a different OUTBOX_ENCRYPTION_KEY
    }
  }
}

async function takeAll(channel: ConfirmChannel, queue: string) {
  const messages: GetMessage[] = [];
  while (messages.length < MAX_PER_QUEUE) {
    const message = await channel.get(queue, { noAck: false });
    if (!message) {
      break;
    }
    messages.push(message);
  }
  return messages;
}
