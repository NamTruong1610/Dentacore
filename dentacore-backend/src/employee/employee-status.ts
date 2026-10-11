import type { EmployeeStatus, Prisma } from '../generated/prisma/client.js';

/**
 * The status the API reports. On top of the stored PENDING/ACTIVE, an invite that wasn't
 * activated within 48 hours shows as EXPIRED, so admins can see it and send a new invite.
 * Worked out from activationExpiresAt rather than stored: it's exact the moment the invite
 * expires, with no background job to keep in sync.
 */
export const EMPLOYEE_STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED'] as const;
export type EffectiveStatus = (typeof EMPLOYEE_STATUSES)[number];

type WithStatus = { status: EmployeeStatus; activationExpiresAt: Date | null };

export function effectiveStatus(
  employee: WithStatus,
  now = new Date(),
): EffectiveStatus {
  const expired =
    employee.status === 'PENDING' &&
    employee.activationExpiresAt !== null &&
    employee.activationExpiresAt <= now;
  return expired ? 'EXPIRED' : employee.status;
}

/** The employee as returned by the API, with the reported status. */
export function withEffectiveStatus<T extends WithStatus>(employee: T) {
  return { ...employee, status: effectiveStatus(employee) };
}

/** Database filter for ?status=..., matching effectiveStatus(). */
export function statusFilter(
  status: EffectiveStatus,
  now = new Date(),
): Prisma.EmployeeWhereInput {
  switch (status) {
    case 'ACTIVE':
      return { status: 'ACTIVE' };
    case 'PENDING':
      return { status: 'PENDING', activationExpiresAt: { gt: now } };
    case 'EXPIRED':
      return { status: 'PENDING', activationExpiresAt: { lte: now } };
  }
}
