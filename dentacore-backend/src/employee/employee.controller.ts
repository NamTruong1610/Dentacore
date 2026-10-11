import { Controller, Get, Query, Param, Post, Body, Patch, Delete, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { EmployeeService } from './employee.service.js'
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js'
import { ListEmployeesQueryDto, UpdateEmployeeDto } from './dto/update-employee.dto.js'
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth-context.js'

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService
  ) {}
  // GET /employees?status=PENDING|ACTIVE|EXPIRED (status is optional)
  @Get()
  @RequirePermissions('employee:read')
  getAllEmployees(
    @Query() query: ListEmployeesQueryDto
  ) {
    return this.employeeService.findAllEmployees(query.status);
  }

  @Get(':id')
  @RequirePermissions('employee:read')
  getEmployeesById(
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.employeeService.findEmployeesById(id);
  }

  @Post()
  @RequirePermissions('employee:invite')
  createPendingEmployee(
    @CurrentAuth() auth: AuthContext,
    @Body() createEmployeeDto: CreatePendingEmployeeDto
  ) {
    return this.employeeService.createPendingEmployee(auth, createEmployeeDto);
  }

  // POST /employees/:id/resend-invite — new temporary password + link for an expired/pending invite
  @Post(':id/resend-invite')
  @RequirePermissions('employee:invite')
  resendInvite(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    return this.employeeService.resendInvite(auth, id);
  }

  @Patch(':id')
  @RequirePermissions('employee:update')
  updateEmployee(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    return this.employeeService.updateEmployee(auth, id, updateEmployeeDto);
  }

  @Delete(':id')
  @RequirePermissions('employee:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmployee(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    await this.employeeService.deleteEmployee(auth, id);
  }
}
