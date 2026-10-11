import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  CompleteActivationDto,
  StartActivationDto,
} from './dto/activation.dto.js';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto.js';
import { EmployeeAccountService } from './employee-account.service.js';

// POST normally returns 201 Created; these don't create anything, so they return 200.
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

  // POST /employees/2fa/disable
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(@Body() dto: DisableTwoFactorDto) {
    return this.employeeAccountService.disableTwoFactor(dto);
  }
}
