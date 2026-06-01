/**
 * Admin Email Allowlist
 *
 * Users whose email matches an entry in this list are granted admin access.
 * Emails are compared case-insensitively.
 *
 * SECURITY NOTE: The previous developer's accounts (byronoc123@gmail.com,
 * byronoc123@protonmail.com) were removed from both lists.
 * Add your own admin email(s) here and run migration 061_sync_admin_emails.sql
 * (updated) to sync the database flags accordingly.
 */

export const ADMIN_EMAILS: string[] = [
  // TODO: add legitimate admin email(s) here, e.g. "admin@yourdomain.com"
];

export const SUPER_ADMIN_EMAILS: string[] = [
  // TODO: add legitimate super-admin email(s) here, e.g. "admin@yourdomain.com"
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
