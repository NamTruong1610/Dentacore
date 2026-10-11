import { IsEmail, IsOptional, IsString, IsStrongPassword } from 'class-validator';

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

  @IsString()
  password: string;
}