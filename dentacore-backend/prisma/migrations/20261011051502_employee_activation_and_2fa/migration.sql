-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "activationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenHash" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "status" "EmployeeStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_activationTokenHash_key" ON "Employee"("activationTokenHash");
