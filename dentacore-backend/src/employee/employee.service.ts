import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthContext } from '../auth/auth-context.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleService } from '../role/role.service.js';
import { createToken } from '../auth/tokens.js';
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js';

const INVITE_VALID_FOR_MS = 48 * 60 * 60 * 1000; // 48 hours

// Employees are soft-deleted: deleteEmployee sets deletedAt instead of removing the row,
// so every read filters on deletedAt: null to hide deleted employees.
@Injectable()
export class EmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly roleService: RoleService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  // READ all
  async findAllEmployees() {
    return await this.prisma.employee.findMany({ where: { deletedAt: null } });
  }

  // READ one
  async findEmployeesById(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }
    return employee;
  }

  // CREATE (pending): an admin invites an employee, who then activates the account from the email
  // Requires the employee:invite permission (see EmployeeController)
  async createPendingEmployee(
    actor: AuthContext,
    { roleIds = [], ...createEmployeeDto }: CreatePendingEmployeeDto,
  ) {
    // Inviting someone with a role follows the same rules as giving it to them later.
    await this.roleService.assertCanAssignRoles(actor, roleIds);

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const { token, tokenHash } = createToken();
    const expiresAt = new Date(Date.now() + INVITE_VALID_FOR_MS);

    const activationUrl = new URL(
      this.config.getOrThrow<string>('ACTIVATION_URL'),
    );
    activationUrl.searchParams.set('token', token);

    // Create the employee and send the email in one transaction: if sending fails,
    // the employee isn't saved, so there's never a pending account without an invite.
    return await this.prisma.$transaction(
      async (tx) => {
        const employee = await tx.employee.create({
          data: {
            ...createEmployeeDto,
            password: passwordHash,
            activationTokenHash: tokenHash,
            activationExpiresAt: expiresAt,
            roles: { create: roleIds.map((roleId) => ({ roleId })) },
          },
        });
        await this.mailService.sendEmployeeInvite(employee.email, {
          firstName: employee.firstName,
          employeeNumber: employee.employeeNumber,
          temporaryPassword,
          activationUrl: activationUrl.toString(),
          expiresAt,
        });
        return employee;
      },
      { timeout: 15_000 }, // allow time for the SMTP server to respond
    );
  }

  // UPDATE
  async updateEmployee(id: string, data: Prisma.EmployeeUpdateInput) {
    await this.findEmployeesById(id); // throws 404 if the employee doesn't exist
    return await this.prisma.employee.update({ where: { id }, data });
  }

  // DELETE (soft)
  async deleteEmployee(id: string) {
    await this.findEmployeesById(id); // throws 404 if the employee doesn't exist
    const employee = await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // Log them out everywhere. (SessionGuard also rejects deleted employees on every request.)
    await this.sessionService.revokeAllForEmployee(id);
    return employee;
  }
}
