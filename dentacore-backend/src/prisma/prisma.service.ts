import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Fields hidden from every query unless a query asks for them with `omit: { field: false }`.
// Listed in the type too, so TypeScript knows these fields aren't in query results.
const omit = {
  employee: {
    password: true,
    twoFactorSecret: true,
    activationTokenHash: true,
  },
} as const;

type PrismaOptions = {
  adapter: PrismaPg;
  omit: typeof omit;
};

@Injectable()
export class PrismaService extends PrismaClient<PrismaOptions> {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      omit,
    });
  }
}
