import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

export const LOGIN_CHALLENGE_MS = 5 * 60 * 1000;

/**
 * Reads and writes the two auth cookies:
 * - session: proves the browser is logged in
 * - login challenge: password was correct, waiting for the 2FA code (5 minutes)
 *
 * Both are HttpOnly (page JavaScript can't read them) and SameSite=Lax
 * (not sent on cross-site POSTs, which blocks most CSRF).
 * With COOKIE_SECURE=true (production, HTTPS) they're also Secure and use the __Host- prefix,
 * which makes browsers refuse them unless they come from this exact host over HTTPS.
 */
@Injectable()
export class AuthCookies {
  private readonly secure: boolean;
  private readonly sessionName: string;
  private readonly challengeName: string;

  constructor(config: ConfigService) {
    this.secure = config.get<string>('COOKIE_SECURE') === 'true';
    const prefix = this.secure ? '__Host-' : '';
    this.sessionName = `${prefix}session`;
    this.challengeName = `${prefix}login_challenge`;
  }

  readSession(req: Request): string | undefined {
    return req.cookies?.[this.sessionName];
  }

  /**
   * Remember me: a persistent cookie that lasts until the session's hard limit.
   * Otherwise: a browser-session cookie (no expiry), deleted when the browser closes.
   * Either way the server enforces the real expiry.
   */
  setSession(res: Response, token: string, persistUntil?: Date) {
    res.cookie(this.sessionName, token, {
      ...this.baseOptions(),
      expires: persistUntil,
    });
  }

  clearSession(res: Response) {
    res.clearCookie(this.sessionName, this.baseOptions());
  }

  readChallenge(req: Request): string | undefined {
    return req.cookies?.[this.challengeName];
  }

  setChallenge(res: Response, token: string) {
    res.cookie(this.challengeName, token, {
      ...this.baseOptions(),
      maxAge: LOGIN_CHALLENGE_MS,
    });
  }

  clearChallenge(res: Response) {
    res.clearCookie(this.challengeName, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }
}
