// examples/ecommerce-saas/src/services/users.ts

export interface User {
  id:        string;
  email:     string;
  name:      string;
  role:      'customer' | 'admin' | 'agent';
  createdAt: Date;
}

// ── Safe reads ─────────────────────────────────────────────────────────────────

/** Find a user by their email address. */
export async function getUserByEmail(email: string): Promise<User | null> {
  return null;
}

/** Get a user by ID. */
export async function getUserById(userId: string): Promise<User | null> {
  return null;
}

/** List all users with optional role filter. */
export async function listUsers(role?: User['role']): Promise<User[]> {
  return [];
}

/** Search users by name or email fragment. */
export async function searchUsers(query: string): Promise<User[]> {
  return [];
}

// ── Mutations (REQUIRES_CONFIRMATION) ─────────────────────────────────────────

/**
 * Registers a new user account.
 * @param email    - User's email address
 * @param name     - Full name
 * @param password - Hashed password
 */
export async function registerUser(
  email:    string,
  name:     string,
  password: string
): Promise<User> {
  throw new Error('Not implemented');
}

/**
 * Authenticates a user and returns a session token.
 * @param email    - User email
 * @param password - User password
 */
export async function authenticateUser(
  email:    string,
  password: string
): Promise<{ token: string; user: User }> {
  throw new Error('Not implemented');
}

/**
 * Updates a user's role (admin action).
 * @param userId  - Target user
 * @param newRole - New role to assign
 */
export async function updateUserRole(userId: string, newRole: User['role']): Promise<void> {}

/**
 * Suspends a user account.
 * @param userId - Target user
 * @param reason - Reason for suspension
 */
export async function suspendUser(userId: string, reason: string): Promise<void> {}

/**
 * Sends a password reset email.
 */
export async function initiatePasswordReset(email: string): Promise<void> {}

/**
 * Invites a new team member by email.
 */
export async function inviteTeamMember(email: string, role: User['role']): Promise<void> {}
