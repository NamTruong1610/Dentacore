import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  filter,
  from,
  interval,
  map,
  merge,
  Observable,
  switchMap,
  takeUntil,
} from 'rxjs';
import { type AuthContext, CurrentAuth } from '../auth/auth-context.js';
import { SessionService } from '../auth/session.service.js';
import { NotificationStream } from './notification-stream.js';
import { NotificationService } from './notification.service.js';

const HEARTBEAT_MS = 25_000; // keeps proxies from closing an idle connection
const SESSION_CHECK_MS = 60_000;

class ListNotificationsQueryDto {
  // ?unread=true. Query values are strings, so convert explicitly ("false" must stay false).
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;
}

// Each employee's own notifications. Only requires being logged in.
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly stream: NotificationStream,
    private readonly sessions: SessionService,
  ) {}

  // GET /notifications?unread=true
  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(auth.employee.id, query.unread ?? false);
  }

  // GET /notifications/unread-count
  @Get('unread-count')
  async unreadCount(@CurrentAuth() auth: AuthContext) {
    return { unread: await this.notifications.unreadCount(auth.employee.id) };
  }

  // POST /notifications/read-all
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentAuth() auth: AuthContext) {
    return this.notifications.markAllRead(auth.employee.id);
  }

  // POST /notifications/:id/read
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notifications.markRead(id, auth.employee.id);
  }

  /**
   * GET /notifications/stream: Server-Sent Events. In the browser:
   *   const events = new EventSource('/notifications/stream', { withCredentials: true });
   *   events.addEventListener('notification', (e) => show(JSON.parse(e.data)));
   * Events: "ready" (with the unread count) on connect, "notification" for each new one,
   * "ping" every 25s. The stream closes if the session ends (logout, revoked, expired).
   */
  @Sse('stream')
  subscribe(@CurrentAuth() auth: AuthContext): Observable<MessageEvent> {
    const ready$ = from(this.notifications.unreadCount(auth.employee.id)).pipe(
      map((unread): MessageEvent => ({ type: 'ready', data: { unread } })),
    );
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: '' })),
    );
    // The session was checked when the stream opened; keep checking while it stays open.
    const sessionEnded$ = interval(SESSION_CHECK_MS).pipe(
      switchMap(() => from(this.sessions.isActive(auth.sessionId))),
      filter((active) => !active),
    );
    return merge(
      ready$,
      this.stream.subscribe(auth.employee.id),
      heartbeat$,
    ).pipe(takeUntil(sessionEnded$));
  }
}
