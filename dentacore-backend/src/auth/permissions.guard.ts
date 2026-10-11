import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRED_PERMISSIONS_KEY } from './auth-context.js';
import { missingPermissions, type Permission } from './permissions.js';

/**
 * Runs after SessionGuard (both registered globally in AuthModule, in that order).
 * Checks @RequirePermissions(...) against the logged-in employee's roles.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndMerge<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required.length === 0) {
      return true;
    }

    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth) {
      // A route with @RequirePermissions must not also be @Public.
      throw new Error(
        '@RequirePermissions() used on a route without a session',
      );
    }
    const missing = missingPermissions(auth.permissions, required);
    if (missing.length > 0) {
      throw new ForbiddenException(
        `You don't have permission to do this (requires ${missing.join(', ')})`,
      );
    }
    return true;
  }
}
