import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/auth-context.js';
import {
  CompleteActivationDto,
  StartActivationDto,
} from './dto/activation.dto.js';
import { EmployeeAccountService } from './employee-account.service.js';

// POST normally returns 201 Created; these don't create anything, so they return 200.
// Public: the employee isn't logged in yet; the activation token + temporary password prove who they are.
@Public()
@Controller('employees')
export class EmployeeAccountController {
  constructor(
    private readonly employeeAccountService: EmployeeAccountService,
  ) {}

  // POST /employees/activation/start — returns the 2FA QR code to scan
  @Post('activation/start')
  @HttpCode(HttpStatus.OK)
  startActivation(@Body() dto: StartActivationDto) {
    return this.employeeAccountService.startActivation(dto);
  }

  // POST /employees/activation/complete — confirms 2FA, sets the new password, activates the account
  @Post('activation/complete')
  @HttpCode(HttpStatus.OK)
  completeActivation(@Body() dto: CompleteActivationDto) {
    return this.employeeAccountService.completeActivation(dto);
  }
}
