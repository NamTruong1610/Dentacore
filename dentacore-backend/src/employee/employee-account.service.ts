import {
  BadRequestException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { hashToken } from '../auth/tokens.js';
import { TotpService } from '../auth/totp.service.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompleteActivationDto,
  StartActivationDto,
} from './dto/activation.dto.js';

/**
 * Activating an invite. (Turning 2FA off lives in AuthController, for logged-in employees.)
 *
 * Activation happens in two steps, both from the page the email links to:
 *   1. startActivation: check the link + temporary password, create a 2FA secret, return the QR code
 *   2. completeActivation: check a code from the authenticator app, save the employee's own password
 */
@Injectable()
export class EmployeeAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly totpService: TotpService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async startActivation({ token, temporaryPassword }: StartActivationDto) {
    const employee = await this.findValidInvite(token, temporaryPassword);

    // Calling this again (e.g. the QR code was lost) replaces the secret with a new one.
    const setup = await this.totpService.createSetup(
      String(employee.employeeNumber),
    );
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { twoFactorSecret: setup.encryptedSecret },
    });

    return {
      employeeNumber: employee.employeeNumber,
      secret: setup.secret, // for typing into the app by hand
      otpauthUri: setup.otpauthUri,
      qrCodeDataUrl: setup.qrCodeDataUrl, // an <img src="..."> the page can show directly
    };
  }

  async completeActivation({
    token,
    temporaryPassword,
    newPassword,
    code,
  }: CompleteActivationDto) {
    const employee = await this.findValidInvite(token, temporaryPassword);

    if (!employee.twoFactorSecret) {
      throw new BadRequestException('Set up two-factor authentication first');
    }
    if (newPassword === temporaryPassword) {
      throw new BadRequestException(
        'Choose a new password, not the temporary one',
      );
    }
    // Same checks as login: wrong-code lockout, and this code can't be reused to log in.
    await this.twoFactorService.verify(employee.id, code);

    return await this.prisma.employee.update({
      where: { id: employee.id },
      data: {
        password: await this.passwordService.hash(newPassword),
        status: 'ACTIVE',
        activatedAt: new Date(),
        twoFactorEnabled: true,
        // The link and temporary password can't be used again.
        activationTokenHash: null,
        activationExpiresAt: null,
      },
    });
  }

  private async findValidInvite(token: string, temporaryPassword: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        activationTokenHash: hashToken(token),
        status: 'PENDING',
        deletedAt: null,
      },
      omit: { password: false, twoFactorSecret: false },
    });
    // Same message whether the link or the password is wrong, so neither can be checked on its own.
    if (
      !employee ||
      !(await this.passwordService.verify(employee.password, temporaryPassword))
    ) {
      throw new UnauthorizedException(
        'Invalid activation link or temporary password',
      );
    }
    if (
      !employee.activationExpiresAt ||
      employee.activationExpiresAt < new Date()
    ) {
      throw new GoneException(
        'This activation link has expired. Ask an administrator to send a new invite.',
      );
    }
    return employee;
  }
}
