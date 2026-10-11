import { Module } from '@nestjs/common';
import { EmployeeController } from './employee.controller.js';
import { EmployeeService } from './employee.service.js';

@Module({
  controllers: [EmployeeController],
  providers: [EmployeeService]
})
export class EmployeeModule {}
