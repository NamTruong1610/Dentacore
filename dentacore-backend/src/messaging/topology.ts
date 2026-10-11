import type { ConfirmChannel } from 'amqplib';

/**
 * RabbitMQ layout. Everything is declared by the app on startup (and again after a reconnect).
 *
 *   outbox relay ──publish──▶ "dentacore" (topic exchange)
 *                                ├─ email.#            ──▶ queue "email"
 *                                └─ employee.activated ──▶ queue "activation-notifications"
 *
 * Each queue has two helpers:
 *   "<queue>.retry": a failed message waits here RETRY_DELAY_MS, then goes back to "<queue>"
 *   "<queue>.dead":  after MAX_ATTEMPTS failures it's parked here for a person to look at
 *                    (RabbitMQ UI: http://localhost:15673 → Queues)
 *
 * Live notifications use a separate fanout exchange, "dentacore.live": every app instance gets
 * its own temporary queue, so each one can push to the browser tabs connected to it.
 */
export const EXCHANGE = 'dentacore';
export const LIVE_EXCHANGE = 'dentacore.live';

export const RETRY_DELAY_MS = 30_000;
export const MAX_ATTEMPTS = 5;

export const QUEUES = {
  email: { name: 'email', bindings: ['email.#'] },
  activationNotifications: {
    name: 'activation-notifications',
    bindings: ['employee.activated'],
  },
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]['name'];

export async function assertTopology(channel: ConfirmChannel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(LIVE_EXCHANGE, 'fanout', { durable: false });

  for (const { name, bindings } of Object.values(QUEUES)) {
    await channel.assertQueue(name, { durable: true });
    for (const routingKey of bindings) {
      await channel.bindQueue(name, EXCHANGE, routingKey);
    }
    // Messages expire from the retry queue back into the main queue (via the default exchange).
    await channel.assertQueue(`${name}.retry`, {
      durable: true,
      arguments: {
        'x-message-ttl': RETRY_DELAY_MS,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': name,
      },
    });
    await channel.assertQueue(`${name}.dead`, { durable: true });
  }
}
