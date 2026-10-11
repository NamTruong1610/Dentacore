import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth-context.js';
import { AuthCookies } from './auth-cookies.js';
import { SessionService } from './session.service.js';

/**
 * Runs on every route (registered globally in AuthModule): every endpoint requires a valid
 * session unless it's marked @Public(). That way a new endpoint is protected by default.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService,
    private readonly cookies: AuthCookies,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.cookies.readSession(req);
    const session = token
      ? await this.sessionService.authenticate(token)
      : null;
    if (!session) {
      throw new UnauthorizedException('Not logged in');
    }

    req.auth = { sessionId: session.id, employee: session.employee };
    return true;
  }
}
