import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthCookies } from './auth-cookies.js';
import { type AuthContext, CurrentAuth, Public } from './auth-context.js';
import { AuthService } from './auth.service.js';
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  LoginDto,
  SetupTwoFactorDto,
  LoginTwoFactorDto,
} from './dto/login.dto.js';
import { AuthRateLimit } from './rate-limit.js';
import { ClientInfo, SessionService } from './session.service.js';

// @Res({ passthrough: true }) lets a handler set cookies while still returning a normal value.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly cookies: AuthCookies,
  ) {}

  // POST /auth/login — step 1: employee ID + password
  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, clientInfo(req));
    if (result.twoFactorRequired) {
      this.cookies.setChallenge(res, result.challengeToken);
      return { twoFactorRequired: true };
    }
    this.setSessionCookie(res, result.token, result.session);
    return { twoFactorRequired: false };
  }

  // POST /auth/login/2fa — step 2: the code from the authenticator app
  @Public()
  @AuthRateLimit()
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  async loginTwoFactor(
    @Body() { code }: LoginTwoFactorDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, session } = await this.authService.completeLogin(
      this.cookies.readChallenge(req),
      code,
      clientInfo(req),
    );
    this.cookies.clearChallenge(res);
    this.setSessionCookie(res, token, session);
    return { twoFactorRequired: false };
  }

  // POST /auth/logout — ends this device's session
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.sessionService.revoke(auth.sessionId, auth.employee.id);
    this.cookies.clearSession(res);
  }

  // GET /auth/me — who is logged in, their roles, and what they may do (for showing/hiding UI)
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return {
      ...auth.employee,
      roles: auth.roles,
      permissions: [...auth.permissions].sort(),
    };
  }

  // GET /auth/sessions — this employee's logged-in devices
  @Get('sessions')
  async listSessions(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.sessionService.listForEmployee(
      auth.employee.id,
    );
    return sessions.map(({ employeeId: _employeeId, ...session }) => ({
      ...session,
      current: session.id === auth.sessionId,
    }));
  }

  // POST /auth/sessions/revoke-others — "log out of all other devices"
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentAuth() auth: AuthContext) {
    const revoked = await this.sessionService.revokeAllForEmployee(
      auth.employee.id,
      auth.sessionId,
    );
    return { revoked };
  }

  // DELETE /auth/sessions/:id — log out one device
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!(await this.sessionService.revoke(id, auth.employee.id))) {
      throw new NotFoundException('Session not found');
    }
    if (id === auth.sessionId) {
      this.cookies.clearSession(res);
    }
  }

  // POST /auth/password — needs current password (+ 2FA code if on); logs out other devices
  @AuthRateLimit()
  @Post('password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(
      auth.employee.id,
      auth.sessionId,
      dto,
      clientInfo(req),
    );
  }

  // POST /auth/2fa/disable — needs password + current code; logs out other devices
  @AuthRateLimit()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(
      auth.employee.id,
      auth.sessionId,
      dto,
    );
  }

  // POST /auth/2fa/setup — new authenticator: returns a QR code; then confirm with /2fa/enable
  @AuthRateLimit()
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  setupTwoFactor(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SetupTwoFactorDto,
  ) {
    return this.authService.setupTwoFactor(auth.employee.id, dto);
  }

  // POST /auth/2fa/enable — turns 2FA on with a code from the set-up authenticator app
  @AuthRateLimit()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTwoFactor(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: EnableTwoFactorDto,
  ) {
    return this.authService.enableTwoFactor(auth.employee.id, dto);
  }

  private setSessionCookie(
    res: Response,
    token: string,
    session: { rememberMe: boolean; absoluteExpiresAt: Date },
  ) {
    this.cookies.setSession(
      res,
      token,
      session.rememberMe ? session.absoluteExpiresAt : undefined,
    );
  }
}

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}
