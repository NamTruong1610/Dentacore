import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthCookies } from './auth-cookies.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { PermissionsGuard } from './permissions.guard.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';
import { TotpService } from './totp.service.js';
import { TwoFactorService } from './two-factor.service.js';

// Login, sessions and 2FA. Owns the credential fields on Employee (password, 2FA secret,
// lockout) plus the Session and LoginChallenge tables.
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookies,
    PasswordService,
    SessionService,
    TotpService,
    TwoFactorService,
    // Every route requires login unless marked @Public(). Order matters: SessionGuard
    // identifies the employee, then PermissionsGuard checks @RequirePermissions(...).
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [PasswordService, SessionService, TotpService, TwoFactorService],
})
export class AuthModule {}
