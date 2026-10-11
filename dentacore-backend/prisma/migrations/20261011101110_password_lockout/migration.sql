-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "failedPasswordAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordLockedUntil" TIMESTAMP(3);
