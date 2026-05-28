/**
 * Auth Store
 *
 * Re-exports auth functionality for use in stores and components.
 * This provides a consistent import path for auth state across the app.
 *
 * Currently using stub auth hook while Privy is disabled for demo mode.
 */

export { useAuth as useAuthStore } from "@/hooks/useAuth";
export type { AuthState, AuthActions } from "@/hooks/useAuth";
