import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Fields hidden from every query unless a query asks for them with `omit: { field: false }`.
// Listed in the type too, so TypeScript knows these fields aren't in query results.
type PrismaOptions = {
  adapter: PrismaPg;
  omit: { employee: { password: true } };
};

@Injectable()
export class PrismaService extends PrismaClient<PrismaOptions> {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      omit: { employee: { password: true } },
    });
  }
}
