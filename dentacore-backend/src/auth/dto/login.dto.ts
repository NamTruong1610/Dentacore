import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const SIX_DIGIT_CODE = /^\d{6}$/;
const CODE_MESSAGE =
  'code must be the 6-digit code from your authenticator app';

// Step 1: employee ID + password.
export class LoginDto {
  @IsInt()
  employeeNumber: number;

  @IsString()
  @IsNotEmpty()
  password: string;

  /** Stay logged in on this device for days instead of only while active. */
  @IsOptional()
  @IsBoolean()
  rememberMe: boolean = false;
}

// Step 2: the 2FA code. The login challenge comes from the cookie set in step 1.
export class LoginTwoFactorDto {
  @Matches(SIX_DIGIT_CODE, { message: CODE_MESSAGE })
  code: string;
}

// Turning 2FA off needs the password and a current code, on top of being logged in.
export class DisableTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  password: string;

  @Matches(SIX_DIGIT_CODE, { message: CODE_MESSAGE })
  code: string;
}
