import { Module } from '@nestjs/common';
import { EmailConsumer } from './email.consumer.js';
import { MailService } from './mail.service.js';

// Sends queued emails. To send one, queue it with OutboxService and a routing key from EMAIL.
@Module({
  providers: [MailService, EmailConsumer],
})
export class MailModule {}
