import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type {
  EmployeeActivatedEmail,
  EmployeeInviteEmail,
  PasswordChangedEmail,
} from './email-messages.js';

/**
 * Sends email over SMTP. In development that's Mailpit (inbox at http://localhost:8025);
 * switching to a real provider later only means changing the SMTP_* settings.
 * Called by EmailConsumer: the rest of the app queues emails instead of sending them directly.
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

  async sendEmployeeInvite({ to, ...invite }: EmployeeInviteEmail) {
    const expires = new Date(invite.expiresAt).toUTCString();
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

  // Sent after a password change, so the employee notices if it wasn't them.
  async sendPasswordChanged({ to, ...change }: PasswordChangedEmail) {
    const when = new Date(change.changedAt).toUTCString();
    const device = [
      change.userAgent,
      change.ipAddress && `IP ${change.ipAddress}`,
    ]
      .filter(Boolean)
      .join(', ');
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Your Dentacore password was changed',
      text: [
        `Hi ${change.firstName},`,
        '',
        `Your Dentacore password was changed on ${when}${device ? ` (${device})` : ''}.`,
        'Any other devices you were logged in on have been logged out.',
        '',
        "If this wasn't you, contact your administrator immediately.",
      ].join('\n'),
      html: `
        <p>Hi ${escapeHtml(change.firstName)},</p>
        <p>Your Dentacore password was changed on ${when}${device ? ` (${escapeHtml(device)})` : ''}.</p>
        <p>Any other devices you were logged in on have been logged out.</p>
        <p><strong>If this wasn't you, contact your administrator immediately.</strong></p>`,
    });
  }

  // Sent to the admin who invited the employee.
  async sendEmployeeActivated({ to, ...activation }: EmployeeActivatedEmail) {
    const when = new Date(activation.activatedAt).toUTCString();
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `${activation.employeeName} activated their Dentacore account`,
      text: [
        `Hi ${activation.recipientFirstName},`,
        '',
        `${activation.employeeName} (employee ID ${activation.employeeNumber}) activated their account on ${when}.`,
      ].join('\n'),
      html: `
        <p>Hi ${escapeHtml(activation.recipientFirstName)},</p>
        <p>${escapeHtml(activation.employeeName)} (employee ID ${activation.employeeNumber})
        activated their account on ${when}.</p>`,
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
