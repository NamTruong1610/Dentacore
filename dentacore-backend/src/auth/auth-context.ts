import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Employee } from '../generated/prisma/client.js';
import type { Permission } from './permissions.js';

// The logged-in employee, without the fields PrismaService hides from every query.
export type AuthEmployee = Omit<
  Employee,
  'password' | 'twoFactorSecret' | 'activationTokenHash'
>;

export type AuthContext = {
  sessionId: string;
  employee: AuthEmployee;
  roles: { id: string; name: string; isAdmin: boolean }[];
  // Worked out from the employee's current roles on every request,
  // so role changes take effect immediately.
  permissions: ReadonlySet<Permission>;
  isAdmin: boolean;
};

// SessionGuard puts the logged-in employee on the request as `req.auth`.
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route (or whole controller) as reachable without logging in. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * The logged-in employee must have all of these permissions (checked by PermissionsGuard).
 * Routes without it only require being logged in.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

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
