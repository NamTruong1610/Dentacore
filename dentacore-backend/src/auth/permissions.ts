/**
 * Every permission the app checks. Endpoints require these with @RequirePermissions(...);
 * roles (stored in the database, editable by the business) are bundles of them.
 *
 * To add one: add it here, use it on an endpoint, and decide which built-in roles get it
 * (with a migration, like 20261011094655_roles_and_permissions). The Admin role gets it
 * automatically.
 */
export const PERMISSIONS = {
  'employee:read': 'View employees',
  'employee:invite': 'Invite new employees and resend invites',
  'employee:update': "Edit employees' details",
  'employee:delete': 'Remove employees',
  'employee:assign-roles': "Change employees' roles",
  'role:read': 'View roles and permissions',
  'role:manage': 'Create, edit and delete roles',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

type RoleWithPermissions = {
  isAdmin: boolean;
  permissions: { permission: string }[];
};

/** A role's permissions. Admin has all of them, including any added in the future. */
export function permissionsOfRole(role: RoleWithPermissions): Permission[] {
  if (role.isAdmin) {
    return ALL_PERMISSIONS;
  }
  // Ignore keys that are no longer in PERMISSIONS (removed from code but still in the database).
  return role.permissions.map((p) => p.permission).filter(isPermission);
}

/** Everything an employee may do: the combination of all their roles. */
export function permissionsOfRoles(
  roles: RoleWithPermissions[],
): Set<Permission> {
  return new Set(roles.flatMap(permissionsOfRole));
}

/** The permissions in `required` that `held` doesn't include. */
export function missingPermissions(
  held: ReadonlySet<Permission>,
  required: Iterable<Permission>,
): Permission[] {
  return [...new Set(required)].filter((permission) => !held.has(permission));
}
