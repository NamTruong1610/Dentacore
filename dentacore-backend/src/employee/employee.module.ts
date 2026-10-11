import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { EmployeeAccountController } from './employee-account.controller.js';
import { EmployeeAccountService } from './employee-account.service.js';
import { EmployeeController } from './employee.controller.js';
import { EmployeeService } from './employee.service.js';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [EmployeeController, EmployeeAccountController],
  providers: [EmployeeService, EmployeeAccountService],
})
export class EmployeeModule {}
