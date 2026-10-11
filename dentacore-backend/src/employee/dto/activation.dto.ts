import {
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Matches,
} from 'class-validator';

const SIX_DIGIT_CODE = /^\d{6}$/;

// Step 1: the activation page sends the token from the link + the temporary password from the email.
export class StartActivationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  temporaryPassword: string;
}

// Step 2: same as step 1, plus the employee's own password and a code from their authenticator app.
export class CompleteActivationDto extends StartActivationDto {
  @IsStrongPassword(
    {},
    {
      message:
        'newPassword must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a symbol',
    },
  )
  newPassword: string;

  @Matches(SIX_DIGIT_CODE, {
    message: 'code must be the 6-digit code from your authenticator app',
  })
  code: string;
}
