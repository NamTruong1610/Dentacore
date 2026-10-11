/**
 * Things that happen to employees, published (via the outbox) for other parts of the app to
 * react to. The employee code doesn't need to know who listens: see the consumers bound to
 * these routing keys in src/messaging/topology.ts.
 */
export const EMPLOYEE_EVENTS = {
  activated: 'employee.activated',
} as const;

export type EmployeeActivatedEvent = {
  employeeId: string;
  activatedAt: string;
};
