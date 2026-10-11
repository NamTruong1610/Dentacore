import { IsInt, IsNotEmpty, IsString, Matches } from 'class-validator';

// Until login exists, the employee identifies themselves here. Turning 2FA off
// requires both their password and a current code, so a password alone isn't enough.
export class DisableTwoFactorDto {
  @IsInt()
  employeeNumber: number;

  @IsString()
  @IsNotEmpty()
  password: string;

  @Matches(/^\d{6}$/, {
    message: 'code must be the 6-digit code from your authenticator app',
  })
  code: string;
}
