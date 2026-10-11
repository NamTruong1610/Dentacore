import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { EmployeeService } from './employee.service.js'
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js'
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth-context.js'

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService
  ) {}
  @Get()
  @RequirePermissions('employee:read')
  getAllEmployees() {
    return this.employeeService.findAllEmployees();
  }

  @Get(':id')
  @RequirePermissions('employee:read')
  getEmployeesById(
    @Param('id') id: string
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
}
