-- Rename User to Employee. Renames (not drop + create) so existing rows are kept.

-- RenameTable
ALTER TABLE "User" RENAME TO "Employee";
ALTER TABLE "Employee" RENAME CONSTRAINT "User_pkey" TO "Employee_pkey";
ALTER INDEX "User_email_key" RENAME TO "Employee_email_key";

-- RenameColumn
ALTER TABLE "Address" RENAME COLUMN "userId" TO "employeeId";
ALTER TABLE "Address" RENAME CONSTRAINT "Address_userId_fkey" TO "Address_employeeId_fkey";
ALTER INDEX "Address_userId_idx" RENAME TO "Address_employeeId_idx";
