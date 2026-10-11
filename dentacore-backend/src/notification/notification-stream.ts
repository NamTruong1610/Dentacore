import { Injectable, MessageEvent, OnModuleInit } from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import type { Notification } from '../generated/prisma/client.js';
import { RabbitMqService } from '../messaging/rabbitmq.service.js';

type LiveNotification = Omit<Notification, 'sourceMessageId'>;

/**
 * Pushes new notifications to open browser tabs (Server-Sent Events).
 *
 * Several app instances may be running, and an employee's tab is connected to just one of them.
 * So broadcast() sends each notification through RabbitMQ's "dentacore.live" fanout exchange;
 * every instance receives it and delivers it to the tabs connected to that instance.
 */
@Injectable()
export class NotificationStream implements OnModuleInit {
  // Open tabs on this instance, per employee.
  private readonly tabs = new Map<string, Set<Subscriber<MessageEvent>>>();

  constructor(private readonly rabbit: RabbitMqService) {}

  onModuleInit() {
    this.rabbit.consumeLive<LiveNotification>((notification) =>
      this.deliver(notification),
    );
  }

  /** Call after notifications are saved. Best effort: a tab that misses one sees it in the list. */
  broadcast(notifications: LiveNotification[]) {
    for (const notification of notifications) {
      this.rabbit.publishLive(notification);
    }
  }

  /** Events for one employee's tab. Unsubscribing (tab closed) removes it. */
  subscribe(employeeId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const tabs = this.tabs.get(employeeId) ?? new Set();
      tabs.add(subscriber);
      this.tabs.set(employeeId, tabs);
      return () => {
        tabs.delete(subscriber);
        if (tabs.size === 0) {
          this.tabs.delete(employeeId);
        }
      };
    });
  }

  private deliver(notification: LiveNotification) {
    for (const tab of this.tabs.get(notification.recipientId) ?? []) {
      tab.next({ type: 'notification', data: notification });
    }
  }
}
