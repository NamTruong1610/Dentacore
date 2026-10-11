import { Injectable, OnModuleInit } from '@nestjs/common';
import { RabbitMqService } from '../messaging/rabbitmq.service.js';
import { QUEUES } from '../messaging/topology.js';
import {
  EMAIL,
  type EmployeeActivatedEmail,
  type EmployeeInviteEmail,
  type PasswordChangedEmail,
} from './email-messages.js';
import { MailService } from './mail.service.js';

/**
 * Sends the emails queued on the "email" queue. If sending fails (e.g. the SMTP server is
 * down), RabbitMqService retries it and eventually moves it to "email.dead".
 */
@Injectable()
export class EmailConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.rabbit.consume<unknown>(
      QUEUES.email.name,
      async (payload, { routingKey }) => {
        switch (routingKey) {
          case EMAIL.employeeInvite:
            return await this.mail.sendEmployeeInvite(
              payload as EmployeeInviteEmail,
            );
          case EMAIL.passwordChanged:
            return await this.mail.sendPasswordChanged(
              payload as PasswordChangedEmail,
            );
          case EMAIL.employeeActivated:
            return await this.mail.sendEmployeeActivated(
              payload as EmployeeActivatedEmail,
            );
          default:
            throw new Error(`Unknown email type: ${routingKey}`);
        }
      },
    );
  }
}
