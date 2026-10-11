-- Email is no longer unique: drop the active-only unique index.
-- (Written by hand: without the partialIndexes preview feature, Prisma can't see this index to drop it.)
DROP INDEX "Employee_email_key";

-- employeeNumber: 6-digit staff number.
-- Same as SERIAL, but the sequence starts at 100000 and stops at 999999, so numbers are always 6 digits.
CREATE SEQUENCE "Employee_employeeNumber_seq" AS INTEGER START WITH 100000 MINVALUE 100000 MAXVALUE 999999;
ALTER TABLE "Employee" ADD COLUMN "employeeNumber" INTEGER NOT NULL DEFAULT nextval('"Employee_employeeNumber_seq"');
ALTER SEQUENCE "Employee_employeeNumber_seq" OWNED BY "Employee"."employeeNumber";

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
