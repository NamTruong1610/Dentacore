import { IsEmail, IsOptional, IsString } from 'class-validator';

// No password here: the server generates a temporary one and emails it to the employee.
export class CreatePendingEmployeeDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  middleName?: string;
}
