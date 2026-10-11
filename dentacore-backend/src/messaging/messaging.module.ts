import { Global, Module } from '@nestjs/common';
import { MessageEncryption } from './message-encryption.js';
import { OutboxRelay } from './outbox.relay.js';
import { OutboxService } from './outbox.service.js';
import { RabbitMqService } from './rabbitmq.service.js';

// Global: any module can queue messages (OutboxService) or consume them (RabbitMqService).
@Global()
@Module({
  providers: [MessageEncryption, OutboxRelay, OutboxService, RabbitMqService],
  exports: [OutboxService, RabbitMqService],
})
export class MessagingModule {}
