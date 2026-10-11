import type { ConfigService } from '@nestjs/config';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { MessageEncryption } from './message-encryption.js';
import { RabbitMqService, type MessageHandler } from './rabbitmq.service.js';
import { MAX_ATTEMPTS } from './topology.js';

const config = {
  get: () => Buffer.alloc(32, 1).toString('base64'),
} as unknown as ConfigService;
const encryption = new MessageEncryption(config);
const service = new RabbitMqService(config, encryption);

function message(routingKey: string, headers: Record<string, unknown> = {}) {
  return {
    content: Buffer.from(encryption.encode({ hello: 'world' })),
    fields: { routingKey },
    properties: { messageId: 'm1', headers },
  } as unknown as ConsumeMessage;
}

function channel() {
  return { ack: vi.fn(), sendToQueue: vi.fn() };
}

// handle() is private; it's the part that decides retry / dead-letter.
function handle(
  ch: ReturnType<typeof channel>,
  msg: ConsumeMessage,
  handler: MessageHandler<unknown>,
) {
  return (
    service as unknown as {
      handle: (
        c: ConfirmChannel,
        q: string,
        m: ConsumeMessage,
        h: MessageHandler<unknown>,
      ) => Promise<void>;
    }
  ).handle(ch as unknown as ConfirmChannel, 'email', msg, handler);
}

describe('RabbitMqService message handling', () => {
  it('decrypts the payload, calls the handler and acknowledges', async () => {
    const ch = channel();
    const handler = vi.fn().mockResolvedValue(undefined);
    await handle(ch, message('email.employee-invite'), handler);

    expect(handler).toHaveBeenCalledWith(
      { hello: 'world' },
      { routingKey: 'email.employee-invite', messageId: 'm1', attempt: 1 },
    );
    expect(ch.ack).toHaveBeenCalledOnce();
    expect(ch.sendToQueue).not.toHaveBeenCalled();
  });

  it('on failure, sends to the retry queue with the original routing key and next attempt', async () => {
    const ch = channel();
    await handle(ch, message('email.employee-invite'), () =>
      Promise.reject(new Error('SMTP down')),
    );

    const [queue, , options] = ch.sendToQueue.mock.calls[0];
    expect(queue).toBe('email.retry');
    expect(options.headers).toMatchObject({
      'x-attempt': 2,
      'x-original-routing-key': 'email.employee-invite',
      'x-last-error': 'SMTP down',
    });
    expect(ch.ack).toHaveBeenCalledOnce();
  });

  it('a retried message (routed by queue name) reaches the handler with its original routing key', async () => {
    const ch = channel();
    const handler = vi.fn().mockRejectedValue(new Error('still down'));
    // Coming back from email.retry, RabbitMQ delivers it with the queue name as routing key.
    await handle(
      ch,
      message('email', {
        'x-attempt': 2,
        'x-original-routing-key': 'email.employee-invite',
      }),
      handler,
    );

    expect(handler.mock.calls[0][1].routingKey).toBe('email.employee-invite');
    expect(
      ch.sendToQueue.mock.calls[0][2].headers['x-original-routing-key'],
    ).toBe('email.employee-invite');
  });

  it(`moves the message to the dead-letter queue after ${MAX_ATTEMPTS} attempts`, async () => {
    const ch = channel();
    await handle(
      ch,
      message('email', {
        'x-attempt': MAX_ATTEMPTS,
        'x-original-routing-key': 'email.employee-invite',
      }),
      () => Promise.reject(new Error('gave up')),
    );
    expect(ch.sendToQueue.mock.calls[0][0]).toBe('email.dead');
  });
});
