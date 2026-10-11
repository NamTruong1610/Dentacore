/**
 * Emails are queued (OutboxService) with one of these routing keys and sent by EmailConsumer.
 * Payloads travel as JSON, so dates are ISO strings.
 */
export const EMAIL = {
  employeeInvite: 'email.employee-invite',
  passwordChanged: 'email.password-changed',
  employeeActivated: 'email.employee-activated',
} as const;

export type EmployeeInviteEmail = {
  to: string;
  firstName: string;
  employeeNumber: number;
  temporaryPassword: string;
  activationUrl: string;
  expiresAt: string;
};

export type PasswordChangedEmail = {
  to: string;
  firstName: string;
  changedAt: string;
  ipAddress?: string;
  userAgent?: string;
};

// To the admin who invited the employee.
export type EmployeeActivatedEmail = {
  to: string;
  recipientFirstName: string;
  employeeName: string;
  employeeNumber: number;
  activatedAt: string;
};
