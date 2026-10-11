import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  type AuthContext,
  CurrentAuth,
  RequirePermissions,
} from '../auth/auth-context.js';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  CreateRoleDto,
  SetEmployeeRolesDto,
  UpdateRoleDto,
} from './dto/role.dto.js';
import { RoleService } from './role.service.js';

@Controller()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  // GET /permissions — everything a role can include, for the role editor
  @Get('permissions')
  @RequirePermissions('role:read')
  listPermissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({
      key,
      description,
    }));
  }

  // GET /roles
  @Get('roles')
  @RequirePermissions('role:read')
  listRoles() {
    return this.roleService.listRoles();
  }

  // GET /roles/:id
  @Get('roles/:id')
  @RequirePermissions('role:read')
  getRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.getRole(id);
  }

  // POST /roles
  @Post('roles')
  @RequirePermissions('role:manage')
  createRole(@CurrentAuth() auth: AuthContext, @Body() dto: CreateRoleDto) {
    return this.roleService.createRole(auth, dto);
  }

  // PATCH /roles/:id
  @Patch('roles/:id')
  @RequirePermissions('role:manage')
  updateRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roleService.updateRole(auth, id, dto);
  }

  // DELETE /roles/:id — also removes the role from everyone who has it
  @Delete('roles/:id')
  @RequirePermissions('role:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.roleService.deleteRole(auth, id);
  }

  // GET /employees/:employeeId/roles
  @Get('employees/:employeeId/roles')
  @RequirePermissions('employee:read')
  getEmployeeRoles(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.roleService.getEmployeeRoles(employeeId);
  }

  // PUT /employees/:employeeId/roles — replaces the employee's roles
  @Put('employees/:employeeId/roles')
  @RequirePermissions('employee:assign-roles')
  setEmployeeRoles(
    @CurrentAuth() auth: AuthContext,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() { roleIds }: SetEmployeeRolesDto,
  ) {
    return this.roleService.setEmployeeRoles(auth, employeeId, roleIds);
  }
}
