import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Employee } from '../generated/prisma/client.js';

// The logged-in employee, without the fields PrismaService hides from every query.
export type AuthEmployee = Omit<
  Employee,
  'password' | 'twoFactorSecret' | 'activationTokenHash'
>;

export type AuthContext = { sessionId: string; employee: AuthEmployee };

// SessionGuard puts the logged-in employee on the request as `req.auth`.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route (or whole controller) as reachable without logging in. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the logged-in employee and session ID into a route handler. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (!auth) {
      throw new Error('@CurrentAuth() used on a @Public() route');
    }
    return auth;
  },
);
