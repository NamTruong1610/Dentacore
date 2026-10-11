import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-based login. Browsers send cookies automatically, so another
 * website could try to make a logged-in employee's browser submit requests here.
 * Browsers always add an Origin header to cross-site POST/PATCH/DELETE requests, so any
 * state-changing request from an origin other than our frontend is rejected.
 * (Requests with no Origin, like curl or server-to-server calls, aren't from a browser page.)
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;

  constructor(config: ConfigService) {
    this.allowedOrigins = new Set(
      parseOrigins(config.get<string>('FRONTEND_ORIGIN')),
    );
  }

  use(req: Request, _res: Response, next: NextFunction) {
    const origin = req.headers.origin;
    if (
      !SAFE_METHODS.has(req.method) &&
      origin &&
      !this.allowedOrigins.has(origin)
    ) {
      throw new ForbiddenException('Request origin not allowed');
    }
    next();
  }
}

/** FRONTEND_ORIGIN can list several origins, separated by commas. */
export function parseOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
