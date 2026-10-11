import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const LIST_LIMIT = 50;

// The logged-in employee's own notifications.
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first, at most 50. */
  async list(recipientId: string, unreadOnly: boolean) {
    return await this.prisma.notification.findMany({
      where: { recipientId, ...(unreadOnly && { readAt: null }) },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async unreadCount(recipientId: string) {
    return await this.prisma.notification.count({
      where: { recipientId, readAt: null },
    });
  }

  async markRead(id: string, recipientId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id, recipientId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!notification.readAt) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
  }

  async markAllRead(recipientId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
