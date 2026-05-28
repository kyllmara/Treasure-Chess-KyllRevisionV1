/**
 * Auth Store (Web)
 *
 * Re-exports auth functionality from AuthContext for use in stores and components.
 * This provides a consistent import path for auth state across the app.
 */

export { useAuth as useAuthStore } from "@/contexts/AuthContext";
export type { AuthState, AuthActions } from "@/contexts/AuthContext";
