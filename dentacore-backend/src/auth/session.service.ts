import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { createToken, hashToken } from './tokens.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Each session has two limits:
 * - idle: ends after this long without any request (resets on every request)
 * - absolute: hard limit from login, however active the employee is
 */
export const SESSION_LIFETIME = {
  standard: { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR },
  rememberMe: { idleMs: 7 * DAY, absoluteMs: 30 * DAY },
} as const;

// Push the idle expiry forward at most once a minute, not on every request.
const TOUCH_INTERVAL_MS = MINUTE;

export type ClientInfo = { userAgent?: string; ipAddress?: string };

// Lets create() run inside a caller's transaction (login), or on its own.
type SessionDb = Pick<PrismaService, 'session'>;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the raw token (for the cookie) and the stored session. */
  async create(
    employeeId: string,
    rememberMe: boolean,
    client: ClientInfo,
    db: SessionDb = this.prisma,
  ) {
    const lifetime = lifetimeFor(rememberMe);
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + lifetime.absoluteMs);
    const { token, tokenHash } = createToken();

    const session = await db.session.create({
      data: {
        tokenHash,
        employeeId,
        rememberMe,
        expiresAt: new Date(now + lifetime.idleMs),
        absoluteExpiresAt,
        userAgent: client.userAgent?.slice(0, 500),
        ipAddress: client.ipAddress,
      },
    });
    return { token, session };
  }

  /**
   * Looks up the session for a cookie value. Returns it with its employee and their roles
   * (with permissions), or null if it doesn't exist, has expired, or the employee can no
   * longer log in. Also extends the idle expiry (see TOUCH_INTERVAL_MS).
   */
  async authenticate(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        employee: {
          include: {
            roles: { include: { role: { include: { permissions: true } } } },
          },
        },
      },
    });
    if (!session) {
      return null;
    }

    const now = new Date();
    const { employee } = session;
    // Checked on every request, so deactivating an employee takes effect immediately.
    const employeeCanLogIn =
      employee.status === 'ACTIVE' && !employee.deletedAt;
    if (session.expiresAt <= now || !employeeCanLogIn) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }

    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      const idleExpiresAt =
        now.getTime() + lifetimeFor(session.rememberMe).idleMs;
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          expiresAt: new Date(
            Math.min(idleExpiresAt, session.absoluteExpiresAt.getTime()),
          ),
        },
      });
    }
    return session;
  }

  /** True if the session still exists, hasn't expired, and its employee can still log in. */
  async isActive(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        expiresAt: true,
        employee: { select: { status: true, deletedAt: true } },
      },
    });
    return (
      !!session &&
      session.expiresAt > new Date() &&
      session.employee.status === 'ACTIVE' &&
      !session.employee.deletedAt
    );
  }

  async listForEmployee(employeeId: string) {
    return await this.prisma.session.findMany({
      where: { employeeId, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /** Returns false if the session doesn't exist or belongs to someone else. */
  async revoke(sessionId: string, employeeId: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, employeeId },
    });
    return count === 1;
  }

  /** Logs the employee out everywhere, optionally keeping one session (the current one). */
  async revokeAllForEmployee(employeeId: string, exceptSessionId?: string) {
    const { count } = await this.prisma.session.deleteMany({
      where: {
        employeeId,
        id: exceptSessionId ? { not: exceptSessionId } : undefined,
      },
    });
    return count;
  }

  /** Housekeeping: removes this employee's expired sessions. Called at login. */
  async deleteExpiredForEmployee(employeeId: string) {
    await this.prisma.session.deleteMany({
      where: { employeeId, expiresAt: { lte: new Date() } },
    });
  }
}

function lifetimeFor(rememberMe: boolean) {
  return rememberMe ? SESSION_LIFETIME.rememberMe : SESSION_LIFETIME.standard;
}
