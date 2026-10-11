import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { permissionsOfRoles } from '../auth/permissions.js';
import type { EmployeeActivatedEvent } from '../employee/employee-events.js';
import { EMAIL, type EmployeeActivatedEmail } from '../mail/email-messages.js';
import { OutboxService } from '../messaging/outbox.service.js';
import { RabbitMqService } from '../messaging/rabbitmq.service.js';
import { QUEUES } from '../messaging/topology.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationStream } from './notification-stream.js';

const withRoles = {
  roles: { include: { role: { include: { permissions: true } } } },
} as const;

/**
 * When an employee activates their account: tells the admin who invited them, with an in-app
 * notification (saved, then pushed live) and an email.
 */
@Injectable()
export class EmployeeActivatedConsumer implements OnModuleInit {
  private readonly logger = new Logger(EmployeeActivatedConsumer.name);

  constructor(
    private readonly rabbit: RabbitMqService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly stream: NotificationStream,
  ) {}

  onModuleInit() {
    this.rabbit.consume<EmployeeActivatedEvent>(
      QUEUES.activationNotifications.name,
      (event, { messageId }) => this.handle(event, messageId),
    );
  }

  private async handle(event: EmployeeActivatedEvent, messageId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: event.employeeId },
      include: { invitedBy: { include: withRoles } },
    });
    if (!employee) {
      return; // removed since; nothing to report
    }
    const recipients = await this.recipientsFor(employee.invitedBy);
    if (recipients.length === 0) {
      this.logger.warn(
        `No one to notify about employee ${employee.employeeNumber}`,
      );
      return;
    }

    const employeeName = [
      employee.firstName,
      employee.middleName,
      employee.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    const created = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          recipientId: recipient.id,
          type: 'employee.activated',
          title: `${employeeName} activated their account`,
          body: `Employee ID ${employee.employeeNumber}`,
          data: { employeeId: employee.id },
          sourceMessageId: messageId,
        })),
        // If this message was already handled (delivered twice), these already exist.
        skipDuplicates: true,
      });
      if (count === 0) {
        return []; // already handled: don't send the emails again either
      }
      for (const recipient of recipients) {
        const email: EmployeeActivatedEmail = {
          to: recipient.email,
          recipientFirstName: recipient.firstName,
          employeeName,
          employeeNumber: employee.employeeNumber,
          activatedAt: event.activatedAt,
        };
        await this.outbox.add(tx, EMAIL.employeeActivated, email);
      }
      return await tx.notification.findMany({
        where: { sourceMessageId: messageId },
      });
    });
    this.stream.broadcast(created);
  }

  // The admin who sent the invite, if they still can invite people.
  // Otherwise (removed, deactivated, or lost the permission): all active admins.
  private async recipientsFor(
    inviter: {
      id: string;
      email: string;
      firstName: string;
      status: string;
      deletedAt: Date | null;
      roles: {
        role: { isAdmin: boolean; permissions: { permission: string }[] };
      }[];
    } | null,
  ) {
    const inviterCanInvite =
      inviter &&
      inviter.status === 'ACTIVE' &&
      !inviter.deletedAt &&
      permissionsOfRoles(inviter.roles.map(({ role }) => role)).has(
        'employee:invite',
      );
    if (inviterCanInvite) {
      return [inviter];
    }
    return await this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { isAdmin: true } } },
      },
    });
  }
}
