export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedUserProfile {
  user_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: string;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  has_password?: boolean | null;
}

export type AuthenticatedAdminUser = AuthenticatedUserProfile & {
  role: 'ADMIN';
};

export type AdminGuardState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'forbidden'; email: string; role: UserRole }
  | { status: 'authorized'; user: AuthenticatedAdminUser };

export function isUserRole(value: unknown): value is UserRole {
  return value === 'USER' || value === 'ADMIN';
}

export function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (isUserRole(normalized)) {
      return normalized;
    }
  }
  return 'USER';
}

export function resolveAdminGuardState(
  user: AuthenticatedUserProfile | null,
): Exclude<AdminGuardState, { status: 'loading' }> {
  if (!user) {
    return { status: 'unauthenticated' };
  }
  if (user.role !== 'ADMIN') {
    return { status: 'forbidden', email: user.email, role: user.role };
  }
  return {
    status: 'authorized',
    user: {
      ...user,
      role: 'ADMIN',
    },
  };
}
