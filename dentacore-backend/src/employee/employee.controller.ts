import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { EmployeeService } from './employee.service.js'
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js'

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService
  ) {}
  @Get()
  getAllEmployees() {
    return this.employeeService.findAllEmployees();
  }

  @Get(':id')
  getEmployeesById(
    @Param('id') id: string
  ) {
    return this.employeeService.findEmployeesById(id);
  }

  @Post()
  createPendingEmployee(
    @Body() createEmployeeDto: CreatePendingEmployeeDto
  ) {
    return this.employeeService.createPendingEmployee(createEmployeeDto);
  }
}
