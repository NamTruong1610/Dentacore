import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { EMPLOYEE_STATUSES, type EffectiveStatus } from '../employee-status.js';

// Only these details can be edited here. Roles have their own endpoint
// (PUT /employees/:id/roles); employee number, status and password can't be set directly.
// Send only the fields to change.
export class UpdateEmployeeDto {
  // Skipped when absent, but null is rejected: these fields are required.
  @ValidateIf((_dto, value) => value !== undefined)
  @IsEmail()
  email?: string;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ValidateIf((_dto, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  /** null removes the middle name. */
  @IsOptional()
  @IsString()
  middleName?: string | null;
}

// GET /employees?status=EXPIRED
export class ListEmployeesQueryDto {
  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: EffectiveStatus;
}
