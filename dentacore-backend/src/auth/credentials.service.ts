import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Checks an employee's password and counts wrong ones per employee: after 5 in a row, every
 * password (even the right one) is refused for 15 minutes. Used wherever a password is checked:
 * login, changing the password, turning 2FA off. Same idea as TwoFactorService for codes.
 *
 * Trade-off: someone who knows an employee ID can lock that employee out for 15 minutes by
 * entering wrong passwords. The per-IP rate limit (see rate-limit.ts) slows that down.
 */
@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /** Throws 429 while locked out, or 401 with `wrongMessage` if the password is wrong. */
  async verifyPassword(
    employeeId: string,
    password: string,
    wrongMessage = 'Incorrect password',
  ) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        password: true,
        failedPasswordAttempts: true,
        passwordLockedUntil: true,
      },
    });

    if (
      employee.passwordLockedUntil &&
      employee.passwordLockedUntil > new Date()
    ) {
      throw new HttpException(
        'Too many incorrect passwords. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!(await this.passwordService.verify(employee.password, password))) {
      await this.recordFailure(employeeId);
      throw new UnauthorizedException(wrongMessage);
    }

    if (employee.failedPasswordAttempts > 0 || employee.passwordLockedUntil) {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: { failedPasswordAttempts: 0, passwordLockedUntil: null },
      });
    }
  }

  private async recordFailure(employeeId: string) {
    const { failedPasswordAttempts } = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { failedPasswordAttempts: { increment: 1 } },
      select: { failedPasswordAttempts: true },
    });
    if (failedPasswordAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          failedPasswordAttempts: 0,
          passwordLockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
        },
      });
    }
  }
}
