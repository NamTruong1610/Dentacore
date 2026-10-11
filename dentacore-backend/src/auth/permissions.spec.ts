import {
  ALL_PERMISSIONS,
  missingPermissions,
  permissionsOfRole,
  permissionsOfRoles,
} from './permissions.js';

const role = (permissions: string[], isAdmin = false) => ({
  isAdmin,
  permissions: permissions.map((permission) => ({ permission })),
});

describe('permissions', () => {
  it('gives the Admin role every permission, whatever is stored', () => {
    expect(permissionsOfRole(role([], true))).toEqual(ALL_PERMISSIONS);
  });

  it('ignores permission keys that no longer exist in code', () => {
    expect(
      permissionsOfRole(role(['employee:read', 'patient:old-thing'])),
    ).toEqual(['employee:read']);
  });

  it('combines the permissions of several roles', () => {
    const held = permissionsOfRoles([
      role(['employee:read']),
      role(['role:read', 'employee:read']),
    ]);
    expect([...held].sort()).toEqual(['employee:read', 'role:read']);
  });

  it('lists the permissions that are missing', () => {
    const held = new Set(['employee:read'] as const);
    expect(
      missingPermissions(held, ['employee:read', 'role:manage', 'role:manage']),
    ).toEqual(['role:manage']);
  });
});
