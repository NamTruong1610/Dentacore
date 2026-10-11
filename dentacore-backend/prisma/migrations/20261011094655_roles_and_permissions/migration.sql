-- Replace the Employee.role enum with database roles (an employee can have several).
-- Written by hand so existing admins keep their access: Prisma's version drops the column first.

-- The new "Role" table needs the name the old enum type is using.
ALTER TYPE "Role" RENAME TO "Role_old";

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "EmployeeRole" (
    "employeeId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("employeeId","roleId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE INDEX "EmployeeRole_roleId_idx" ON "EmployeeRole"("roleId");
-- Only one role can be the Admin role. (Partial index: Prisma doesn't track it, so it won't drift.)
CREATE UNIQUE INDEX "Role_single_admin_key" ON "Role"("isAdmin") WHERE "isAdmin";

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Built-in roles. Admin is locked with every permission; the others are starting points the
-- business can edit or delete. (Their permissions grow as features like patients are added.)
INSERT INTO "Role" ("id", "name", "description", "isAdmin", "updatedAt") VALUES
  (gen_random_uuid(), 'Admin',        'Full access to everything. Cannot be edited or deleted.', true,  now()),
  (gen_random_uuid(), 'Dentist',      'Clinical staff.',                                         false, now()),
  (gen_random_uuid(), 'Accountant',   'Billing and finance.',                                    false, now()),
  (gen_random_uuid(), 'Receptionist', 'Front desk: patients and appointments.',                  false, now());

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "id", 'employee:read' FROM "Role" WHERE "name" IN ('Dentist', 'Accountant', 'Receptionist');

-- Existing admins get the Admin role.
INSERT INTO "EmployeeRole" ("employeeId", "roleId")
SELECT e."id", r."id" FROM "Employee" e CROSS JOIN "Role" r
WHERE e."role" = 'ADMIN' AND r."isAdmin";

-- AlterTable / DropEnum
ALTER TABLE "Employee" DROP COLUMN "role";
DROP TYPE "Role_old";
