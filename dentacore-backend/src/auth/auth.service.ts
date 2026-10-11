import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOGIN_CHALLENGE_MS } from './auth-cookies.js';
import { DisableTwoFactorDto, LoginDto } from './dto/login.dto.js';
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
    private readonly twoFactorService: TwoFactorService,
    private readonly sessionService: SessionService,
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
      omit: { password: false },
    });
    const passwordOk = await this.passwordService.verify(
      employee?.password ?? this.dummyPasswordHash,
      password,
    );
    if (!employee || !passwordOk) {
      throw new UnauthorizedException('Invalid employee ID or password');
    }

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
      omit: { password: false },
    });
    if (!(await this.passwordService.verify(employee.password, password))) {
      throw new UnauthorizedException('Incorrect password');
    }
    if (!employee.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already off');
    }
    await this.twoFactorService.verify(employeeId, code);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        lastTotpStep: null,
      },
    });
    // A security setting changed: log out every other device.
    await this.sessionService.revokeAllForEmployee(employeeId, sessionId);
    return { twoFactorEnabled: false };
  }
}
