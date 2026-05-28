/**
 * useAuth Hook - Re-export from AuthContext
 *
 * This file re-exports the useAuth hook from AuthContext for backwards compatibility.
 * All authentication logic is now centralized in contexts/AuthContext.tsx.
 *
 * Usage:
 * ```tsx
 * import { useAuth } from "@/hooks/useAuth";
 * // or
 * import { useAuth } from "@/contexts/AuthContext";
 *
 * function MyComponent() {
 *   const { isAuthenticated, isGuest, sendOTP, verifyOTP } = useAuth();
 *   // ...
 * }
 * ```
 */

// Re-export everything from AuthContext
export {
  useAuth,
  AuthProvider,
  GUEST_PROFILE,
  type AuthContextType,
  type AuthState,
  type AuthActions,
  type AuthError,
} from "@/contexts/AuthContext";

// Re-export route protection constants from types
export { PROTECTED_ROUTES, GUEST_ROUTES } from "@/types/auth";
export type { ProtectedRoute, GuestRoute } from "@/types/auth";
