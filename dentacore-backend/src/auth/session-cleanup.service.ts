import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Deletes expired sessions and login challenges: once when the app starts (clearing any
 * backlog from while it was down), then every hour.
 *
 * Expired rows can't be used anyway (every request checks expiry); this only keeps the tables
 * small. Each app instance runs it; deleting already-deleted rows is harmless.
 */
@Injectable()
export class SessionCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SessionCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void this.run();
    this.timer = setInterval(() => void this.run(), CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run() {
    try {
      const now = new Date();
      const sessions = await this.prisma.session.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      const challenges = await this.prisma.loginChallenge.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      if (sessions.count + challenges.count > 0) {
        this.logger.log(
          `Removed ${sessions.count} expired sessions and ${challenges.count} expired login challenges`,
        );
      }
    } catch (error) {
      this.logger.error(`Cleanup failed: ${(error as Error).message}`);
    }
  }
}
