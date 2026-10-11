import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreatePendingUserDto {
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