import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthContext } from '../auth/auth-context.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { EMAIL, type EmployeeInviteEmail } from '../mail/email-messages.js';
import { OutboxService } from '../messaging/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleService } from '../role/role.service.js';
import { createToken } from '../auth/tokens.js';
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import {
  type EffectiveStatus,
  statusFilter,
  withEffectiveStatus,
} from './employee-status.js';

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
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  // READ all (optionally only PENDING, ACTIVE or EXPIRED)
  async findAllEmployees(status?: EffectiveStatus) {
    const employees = await this.prisma.employee.findMany({
      where: { deletedAt: null, ...(status && statusFilter(status)) },
    });
    return employees.map(withEffectiveStatus);
  }

  // READ one
  async findEmployeesById(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }
    return withEffectiveStatus(employee);
  }

  // CREATE (pending): an admin invites an employee, who then activates the account from the email
  // Requires the employee:invite permission (see EmployeeController)
  async createPendingEmployee(
    actor: AuthContext,
    { roleIds = [], ...createEmployeeDto }: CreatePendingEmployeeDto,
  ) {
    // Inviting someone with a role follows the same rules as giving it to them later.
    await this.roleService.assertCanAssignRoles(actor, roleIds);

    const invite = await this.newInvite();

    // The employee and their invite email are saved together; the email is sent from the
    // queue right after (and retried if the mail server is down).
    return await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          ...createEmployeeDto,
          ...invite.fields,
          invitedById: actor.employee.id,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });
      await this.queueInviteEmail(tx, employee, invite);
      return withEffectiveStatus(employee);
    });
  }

  // RESEND INVITE: new temporary password and link, valid for another 48 hours.
  // The old link and temporary password stop working. Only for employees who haven't activated.
  async resendInvite(actor: AuthContext, id: string) {
    await this.roleService.assertCanManageEmployee(actor, id); // also 404 if missing
    const existing = await this.findEmployeesById(id);
    if (existing.status === 'ACTIVE') {
      throw new ConflictException(
        'This employee has already activated their account',
      );
    }

    const invite = await this.newInvite();
    return await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          ...invite.fields,
          // Whoever re-sent it is told when the employee activates.
          invitedById: actor.employee.id,
          // Start activation from scratch: any half-finished 2FA setup is discarded.
          twoFactorSecret: null,
          lastTotpStep: null,
        },
      });
      await this.queueInviteEmail(tx, employee, invite);
      return withEffectiveStatus(employee);
    });
  }

  // UPDATE: only name and email (see UpdateEmployeeDto)
  async updateEmployee(actor: AuthContext, id: string, dto: UpdateEmployeeDto) {
    await this.roleService.assertCanManageEmployee(actor, id); // also 404 if missing
    const employee = await this.prisma.employee.update({
      where: { id },
      data: dto,
    });
    return withEffectiveStatus(employee);
  }

  // DELETE (soft)
  async deleteEmployee(actor: AuthContext, id: string) {
    await this.roleService.assertCanManageEmployee(actor, id); // also 404 if missing
    await this.prisma.$transaction(async (tx) => {
      // Never remove the last person who can administer the system.
      await this.roleService.assertNotLastActiveAdmin(id, tx);
      await tx.employee.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    // Log them out everywhere. (SessionGuard also rejects deleted employees on every request.)
    await this.sessionService.revokeAllForEmployee(id);
  }

  // A fresh temporary password + activation link, and the fields that store them.
  private async newInvite() {
    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const { token, tokenHash } = createToken();
    const expiresAt = new Date(Date.now() + INVITE_VALID_FOR_MS);

    const activationUrl = new URL(
      this.config.getOrThrow<string>('ACTIVATION_URL'),
    );
    activationUrl.searchParams.set('token', token);

    return {
      temporaryPassword,
      activationUrl: activationUrl.toString(),
      expiresAt,
      fields: {
        password: await this.passwordService.hash(temporaryPassword),
        activationTokenHash: tokenHash,
        activationExpiresAt: expiresAt,
      },
    };
  }

  private async queueInviteEmail(
    tx: Parameters<OutboxService['add']>[0],
    employee: { email: string; firstName: string; employeeNumber: number },
    invite: Awaited<ReturnType<EmployeeService['newInvite']>>,
  ) {
    const email: EmployeeInviteEmail = {
      to: employee.email,
      firstName: employee.firstName,
      employeeNumber: employee.employeeNumber,
      temporaryPassword: invite.temporaryPassword,
      activationUrl: invite.activationUrl,
      expiresAt: invite.expiresAt.toISOString(),
    };
    await this.outbox.add(tx, EMAIL.employeeInvite, email);
  }
}
