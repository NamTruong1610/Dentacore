// Development seed: creates an active admin account so there's someone to invite employees.
// Run with: npx prisma db seed   (safe to run again: it skips if an admin already exists)
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@dentacore.local';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set SEED_ADMIN_PASSWORD in .env');
  }

  // The Admin role itself is created by the roles_and_permissions migration.
  const adminRole = await prisma.role.findFirstOrThrow({
    where: { isAdmin: true },
  });

  const existing = await prisma.employee.findFirst({
    where: { deletedAt: null, roles: { some: { roleId: adminRole.id } } },
  });
  if (existing) {
    console.log(
      `Admin already exists: ${existing.email} (employee ID ${existing.employeeNumber})`,
    );
    return;
  }

  const admin = await prisma.employee.create({
    data: {
      email,
      password: await hash(password),
      firstName: 'Dev',
      lastName: 'Admin',
      roles: { create: { roleId: adminRole.id } },
      status: 'ACTIVE',
      activatedAt: new Date(),
      twoFactorEnabled: false, // no authenticator set up for the seeded admin
    },
  });
  console.log(
    `Created admin ${admin.email} (employee ID ${admin.employeeNumber})`,
  );
}

await main().finally(() => prisma.$disconnect());
