/**
 * Admin Email Allowlist
 *
 * Users whose email matches an entry in this list are granted admin access.
 * Emails are compared case-insensitively.
 */

export const ADMIN_EMAILS: string[] = [
  "byronoc123@gmail.com",
  "byronoc123@protonmail.com",
];

export const SUPER_ADMIN_EMAILS: string[] = [
  "byronoc123@gmail.com",
  "byronoc123@protonmail.com",
];

/**
 * Check if an email is in the admin allowlist
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase());
}

/**
 * Check if an email is in the super admin allowlist
 */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase());
}
