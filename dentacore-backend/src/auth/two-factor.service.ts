import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TotpService } from './totp.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Checks an employee's 2FA code and enforces the rules that apply across all login attempts:
 * - wrong codes are counted per employee; after 5 in a row, codes are refused for 15 minutes
 * - each code works once: a code from a period at or before the last accepted one is rejected
 *
 * Used by login, activation and turning 2FA off. It reads and writes the 2FA fields on Employee.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totpService: TotpService,
  ) {}

  /** Throws if the code is wrong, already used, or the employee is locked out. */
  async verify(employeeId: string, code: string) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        twoFactorSecret: true,
        lastTotpStep: true,
        totpLockedUntil: true,
      },
    });

    if (employee.totpLockedUntil && employee.totpLockedUntil > new Date()) {
      throw new HttpException(
        'Too many incorrect codes. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!employee.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not set up');
    }

    const step = this.totpService.matchStep(employee.twoFactorSecret, code);

    // Record success only if this period is newer than the last one used. Doing the check
    // inside the update means two requests racing with the same code can't both succeed.
    const accepted =
      step !== null &&
      (
        await this.prisma.employee.updateMany({
          where: {
            id: employeeId,
            OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }],
          },
          data: {
            lastTotpStep: step,
            failedTotpAttempts: 0,
            totpLockedUntil: null,
          },
        })
      ).count === 1;

    if (!accepted) {
      await this.recordFailure(employeeId);
      throw new UnauthorizedException('Invalid 2FA code');
    }
  }

  private async recordFailure(employeeId: string) {
    const { failedTotpAttempts } = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { failedTotpAttempts: { increment: 1 } },
      select: { failedTotpAttempts: true },
    });
    if (failedTotpAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          failedTotpAttempts: 0,
          totpLockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
        },
      });
    }
  }
}
