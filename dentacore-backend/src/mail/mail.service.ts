import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type EmployeeInvite = {
  firstName: string;
  employeeNumber: number;
  temporaryPassword: string;
  activationUrl: string;
  expiresAt: Date;
};

/**
 * Sends email over SMTP. In development that's Mailpit (inbox at http://localhost:8025);
 * switching to a real provider later only means changing the SMTP_* settings.
 */
@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const port = Number(config.getOrThrow<string>('SMTP_PORT'));
    const user = config.get<string>('SMTP_USER');
    this.transporter = createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465, // 465 = TLS from the start; other ports upgrade with STARTTLS if offered
      auth: user
        ? { user, pass: config.get<string>('SMTP_PASSWORD') }
        : undefined,
    });
    this.from = config.getOrThrow<string>('MAIL_FROM');
  }

  async sendEmployeeInvite(to: string, invite: EmployeeInvite) {
    const expires = invite.expiresAt.toUTCString();
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Activate your Dentacore account',
      text: [
        `Hi ${invite.firstName},`,
        '',
        'An administrator has created a Dentacore account for you.',
        '',
        `Employee ID: ${invite.employeeNumber}`,
        `Temporary password: ${invite.temporaryPassword}`,
        '',
        `Activate your account here: ${invite.activationUrl}`,
        '',
        "You'll set your own password and set up two-factor authentication with an authenticator app.",
        `This link expires on ${expires}.`,
      ].join('\n'),
      html: `
        <p>Hi ${escapeHtml(invite.firstName)},</p>
        <p>An administrator has created a Dentacore account for you.</p>
        <p>
          <strong>Employee ID:</strong> ${invite.employeeNumber}<br>
          <strong>Temporary password:</strong> <code>${escapeHtml(invite.temporaryPassword)}</code>
        </p>
        <p><a href="${escapeHtml(invite.activationUrl)}">Activate your account</a></p>
        <p>You'll set your own password and set up two-factor authentication with an authenticator app.</p>
        <p>This link expires on ${expires}.</p>`,
    });
  }
}

// Names come from user input; escape them so they can't inject HTML into the email.
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
