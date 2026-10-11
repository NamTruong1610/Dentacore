import { Module } from '@nestjs/common';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';

// Password hashing and 2FA helpers. Login/JWT will live here too once we build it.
@Module({
  providers: [PasswordService, TotpService],
  exports: [PasswordService, TotpService],
})
export class AuthModule {}
