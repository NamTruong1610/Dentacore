import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePendingEmployeeDto } from './dto/create-employee.dto.js';

// Employees are soft-deleted: deleteEmployee sets deletedAt instead of removing the row,
// so every read filters on deletedAt: null to hide deleted employees.
@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

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

  // CREATE
  async createPendingEmployee(createEmployeeDto: CreatePendingEmployeeDto) {
    // Send email to employee 
    
    return await this.prisma.employee.create({ data: createEmployeeDto });
  }

  // UPDATE
  async updateEmployee(id: string, data: Prisma.EmployeeUpdateInput) {
    await this.findEmployeesById(id); // throws 404 if the employee doesn't exist
    return await this.prisma.employee.update({ where: { id }, data });
  }

  // DELETE (soft)
  async deleteEmployee(id: string) {
    await this.findEmployeesById(id); // throws 404 if the employee doesn't exist
    return await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
