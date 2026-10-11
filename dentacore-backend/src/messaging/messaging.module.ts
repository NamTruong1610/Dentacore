import { Global, Module } from '@nestjs/common';
import { DeadLetterController } from './dead-letter.controller.js';
import { DeadLetterService } from './dead-letter.service.js';
import { MessageEncryption } from './message-encryption.js';
import { OutboxRelay } from './outbox.relay.js';
import { OutboxService } from './outbox.service.js';
import { RabbitMqService } from './rabbitmq.service.js';

// Global: any module can queue messages (OutboxService) or consume them (RabbitMqService).
@Global()
@Module({
  controllers: [DeadLetterController],
  providers: [
    DeadLetterService,
    MessageEncryption,
    OutboxRelay,
    OutboxService,
    RabbitMqService,
  ],
  exports: [OutboxService, RabbitMqService],
})
export class MessagingModule {}
