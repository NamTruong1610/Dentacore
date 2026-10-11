import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth-context.js';
import {
  missingPermissions,
  type Permission,
  permissionsOfRole,
} from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';

const roleInclude = {
  permissions: true,
  _count: { select: { employees: true } },
} as const;

type RoleWithPermissions = {
  id: string;
  name: string;
  isAdmin: boolean;
  permissions: { permission: string }[];
};

/**
 * Roles and who has them. Safety rules, so roles can't be used to gain more access:
 * - Nobody can grant permissions they don't have themselves: creating or editing a role, and
 *   giving or taking a role from someone, needs every permission that role contains.
 *   (Admins have every permission, so these rules never stop them.)
 * - Only admins can give or take the Admin role, and the last active admin can't lose it.
 * - The Admin role can't be edited or deleted.
 * Deleting any other role removes it from everyone who has it.
 */
@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toRoleResponse);
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return toRoleResponse(role);
  }

  async createRole(
    actor: AuthContext,
    { name, description, permissions }: CreateRoleDto,
  ) {
    assertCanGrant(actor, permissions);
    await this.assertNameAvailable(name);

    const role = await this.prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: permissions.map((permission) => ({ permission })),
        },
      },
      include: roleInclude,
    });
    return toRoleResponse(role);
  }

  async updateRole(
    actor: AuthContext,
    id: string,
    { name, description, permissions }: UpdateRoleDto,
  ) {
    const role = await this.findEditableRole(id);
    // Can't change a role that can do more than you (e.g. strip permissions from it).
    assertCanGrant(actor, permissionsOfRole(role));
    if (permissions) {
      assertCanGrant(actor, permissions);
    }
    if (name !== undefined && name !== role.name) {
      await this.assertNameAvailable(name, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: id, permission })),
        });
      }
      return await tx.role.update({
        where: { id },
        data: { name, description },
        include: roleInclude,
      });
    });
    return toRoleResponse(updated);
  }

  /** Deletes the role and removes it from everyone who has it. */
  async deleteRole(actor: AuthContext, id: string) {
    const role = await this.findEditableRole(id);
    assertCanGrant(actor, permissionsOfRole(role));
    await this.prisma.role.delete({ where: { id } }); // EmployeeRole rows are deleted with it
  }

  async getEmployeeRoles(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId, deletedAt: null },
      include: { roles: { include: { role: { include: roleInclude } } } },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee.roles.map(({ role }) => toRoleResponse(role));
  }

  /** Replaces an employee's roles with exactly `roleIds`. */
  async setEmployeeRoles(
    actor: AuthContext,
    employeeId: string,
    roleIds: string[],
  ) {
    await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId, deletedAt: null },
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      const newRoles = await this.findRoles(roleIds, tx);
      const oldRoles = employee.roles.map(({ role }) => role);
      const newIds = new Set(newRoles.map((role) => role.id));
      const oldIds = new Set(oldRoles.map((role) => role.id));
      const added = newRoles.filter((role) => !oldIds.has(role.id));
      const removed = oldRoles.filter((role) => !newIds.has(role.id));

      for (const role of [...added, ...removed]) {
        assertCanAssign(actor, role);
      }

      if (removed.some((role) => role.isAdmin)) {
        // Lock the Admin role row so two admins removing each other at the same moment are
        // handled one after the other, and the second one sees the first change.
        await tx.$queryRaw`SELECT id FROM "Role" WHERE "isAdmin" FOR UPDATE`;
        const otherActiveAdmins = await tx.employeeRole.count({
          where: {
            role: { isAdmin: true },
            employeeId: { not: employeeId },
            employee: { status: 'ACTIVE', deletedAt: null },
          },
        });
        if (otherActiveAdmins === 0) {
          throw new ConflictException(
            'This is the last active admin. Give someone else the Admin role first.',
          );
        }
      }

      await tx.employeeRole.deleteMany({
        where: { employeeId, roleId: { in: removed.map((role) => role.id) } },
      });
      await tx.employeeRole.createMany({
        data: added.map((role) => ({ employeeId, roleId: role.id })),
      });
    });
    return await this.getEmployeeRoles(employeeId);
  }

  /**
   * For inviting an employee with roles: checks the roles exist and that the inviter is
   * allowed to give them. Throws otherwise.
   */
  async assertCanAssignRoles(actor: AuthContext, roleIds: string[]) {
    for (const role of await this.findRoles(roleIds)) {
      assertCanAssign(actor, role);
    }
  }

  private async findRoles(
    roleIds: string[],
    db: Pick<PrismaService, 'role'> = this.prisma,
  ) {
    const uniqueIds = [...new Set(roleIds)];
    const roles = await db.role.findMany({
      where: { id: { in: uniqueIds } },
      include: { permissions: true },
    });
    if (roles.length !== uniqueIds.length) {
      const found = new Set(roles.map((role) => role.id));
      throw new BadRequestException(
        `Unknown role: ${uniqueIds.filter((id) => !found.has(id)).join(', ')}`,
      );
    }
    return roles;
  }

  private async findEditableRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role.isAdmin) {
      throw new ForbiddenException(
        'The Admin role cannot be edited or deleted',
      );
    }
    return role;
  }

  // Names are compared ignoring case, so "Dentist" and "dentist" can't both exist.
  private async assertNameAvailable(name: string, exceptId?: string) {
    const existing = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        id: exceptId ? { not: exceptId } : undefined,
      },
    });
    if (existing) {
      throw new ConflictException(
        `A role named "${existing.name}" already exists`,
      );
    }
  }
}

function assertCanGrant(actor: AuthContext, permissions: Iterable<Permission>) {
  if (actor.isAdmin) {
    return;
  }
  const missing = missingPermissions(actor.permissions, permissions);
  if (missing.length > 0) {
    throw new ForbiddenException(
      `You can't grant permissions you don't have: ${missing.join(', ')}`,
    );
  }
}

function assertCanAssign(actor: AuthContext, role: RoleWithPermissions) {
  if (role.isAdmin && !actor.isAdmin) {
    throw new ForbiddenException('Only admins can give or take the Admin role');
  }
  assertCanGrant(actor, permissionsOfRole(role));
}

function toRoleResponse(
  role: RoleWithPermissions & {
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { employees: number };
  },
) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isAdmin: role.isAdmin,
    permissions: permissionsOfRole(role),
    employeeCount: role._count.employees,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}
