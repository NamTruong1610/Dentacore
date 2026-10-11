import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EMAIL, type PasswordChangedEmail } from '../mail/email-messages.js';
import { OutboxService } from '../messaging/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOGIN_CHALLENGE_MS } from './auth-cookies.js';
import { CredentialsService } from './credentials.service.js';
import {
  ChangePasswordDto,
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  LoginDto,
} from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import { ClientInfo, SessionService } from './session.service.js';
import { createToken, hashToken } from './tokens.js';
import { TwoFactorService } from './two-factor.service.js';

type LoginResult =
  | {
      twoFactorRequired: false;
      token: string;
      session: { absoluteExpiresAt: Date; rememberMe: boolean };
    }
  | { twoFactorRequired: true; challengeToken: string };

/**
 * Login in two steps:
 *   1. login(): employee ID + password. With 2FA on, this only creates a 5-minute login
 *      challenge; with 2FA off, it creates the session straight away.
 *   2. completeLogin(): the challenge (from its cookie) + a 2FA code → session.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  // Used when the employee ID doesn't exist, so the response takes as long as a wrong password
  // and doesn't reveal which employee IDs are real.
  private dummyPasswordHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly credentialsService: CredentialsService,
    private readonly twoFactorService: TwoFactorService,
    private readonly sessionService: SessionService,
    private readonly outbox: OutboxService,
  ) {}

  async onModuleInit() {
    this.dummyPasswordHash = await this.passwordService.hash(randomUUID());
  }

  async login(
    { employeeNumber, password, rememberMe }: LoginDto,
    client: ClientInfo,
  ): Promise<LoginResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeNumber, status: 'ACTIVE', deletedAt: null },
    });
    if (!employee) {
      await this.passwordService.verify(this.dummyPasswordHash, password);
      throw new UnauthorizedException('Invalid employee ID or password');
    }
    // Counts wrong passwords and locks the employee out after too many (see CredentialsService).
    await this.credentialsService.verifyPassword(
      employee.id,
      password,
      'Invalid employee ID or password',
    );

    await this.sessionService.deleteExpiredForEmployee(employee.id);

    if (!employee.twoFactorEnabled) {
      const { token, session } = await this.sessionService.create(
        employee.id,
        rememberMe,
        client,
      );
      return { twoFactorRequired: false, token, session };
    }

    // Several challenges can exist at once (back button, two devices). That's safe: each one is
    // single-use, expires in 5 minutes, and wrong codes are counted per employee, not per challenge.
    const { token, tokenHash } = createToken();
    await this.prisma.loginChallenge.create({
      data: {
        tokenHash,
        employeeId: employee.id,
        rememberMe,
        expiresAt: new Date(Date.now() + LOGIN_CHALLENGE_MS),
      },
    });
    return { twoFactorRequired: true, challengeToken: token };
  }

  async completeLogin(
    challengeToken: string | undefined,
    code: string,
    client: ClientInfo,
  ) {
    const challenge = challengeToken
      ? await this.prisma.loginChallenge.findUnique({
          where: { tokenHash: hashToken(challengeToken) },
          include: { employee: { select: { status: true, deletedAt: true } } },
        })
      : null;
    const valid =
      challenge &&
      challenge.expiresAt > new Date() &&
      challenge.employee.status === 'ACTIVE' &&
      !challenge.employee.deletedAt;
    if (!valid) {
      throw new UnauthorizedException(
        'Your login has expired. Please log in again.',
      );
    }

    await this.twoFactorService.verify(challenge.employeeId, code);

    return await this.prisma.$transaction(async (tx) => {
      // Deleting the challenge here makes it single-use: if two requests race,
      // only one deletes it and gets a session.
      const { count } = await tx.loginChallenge.deleteMany({
        where: { id: challenge.id },
      });
      if (count === 0) {
        throw new UnauthorizedException(
          'Your login has expired. Please log in again.',
        );
      }
      return await this.sessionService.create(
        challenge.employeeId,
        challenge.rememberMe,
        client,
        tx,
      );
    });
  }

  async disableTwoFactor(
    employeeId: string,
    sessionId: string,
    { password, code }: DisableTwoFactorDto,
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    await this.credentialsService.verifyPassword(employeeId, password);
    if (!employee.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already off');
    }
    await this.twoFactorService.verify(employeeId, code);

    // The secret is kept, so 2FA can be turned back on with the same authenticator app.
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { twoFactorEnabled: false },
    });
    // A security setting changed: log out every other device.
    await this.sessionService.revokeAllForEmployee(employeeId, sessionId);
    return { twoFactorEnabled: false };
  }

  /** Turns 2FA back on using the secret kept from activation: just a current code, no new QR. */
  async enableTwoFactor(employeeId: string, { code }: EnableTwoFactorDto) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    if (employee.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already on');
    }
    // Also checks the secret exists, the code is current and unused, and the lockout.
    await this.twoFactorService.verify(employeeId, code);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { twoFactorEnabled: true },
    });
    return { twoFactorEnabled: true };
  }

  /** Needs the current password, plus a 2FA code if 2FA is on. Logs out other devices. */
  async changePassword(
    employeeId: string,
    sessionId: string,
    { currentPassword, newPassword, code }: ChangePasswordDto,
    client: ClientInfo,
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    await this.credentialsService.verifyPassword(employeeId, currentPassword);
    if (employee.twoFactorEnabled) {
      if (!code) {
        throw new BadRequestException(
          'Enter the 6-digit code from your authenticator app',
        );
      }
      await this.twoFactorService.verify(employeeId, code);
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'The new password must be different from the current one',
      );
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: { password: passwordHash },
      });
      // Lets the employee notice if it wasn't them.
      const email: PasswordChangedEmail = {
        to: employee.email,
        firstName: employee.firstName,
        changedAt: new Date().toISOString(),
        ...client,
      };
      await this.outbox.add(tx, EMAIL.passwordChanged, email);
    });
    // Anyone else logged in with the old password is logged out.
    const otherSessionsEnded = await this.sessionService.revokeAllForEmployee(
      employeeId,
      sessionId,
    );
    return { otherSessionsEnded };
  }
}
