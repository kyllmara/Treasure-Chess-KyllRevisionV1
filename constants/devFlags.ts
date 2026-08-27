// =============================================================================
// ⚠️  DEVELOPMENT FLAGS — TESTING ONLY
// =============================================================================
// Controlled via .env so the toggle doesn't require a source-code change:
//   EXPO_PUBLIC_SKIP_AUTH=true   → all auth gates bypassed, stub session active
//   EXPO_PUBLIC_SKIP_AUTH=false  → production auth flow restored
//
// BEFORE ANY REAL LAUNCH:
//   1. Set EXPO_PUBLIC_SKIP_AUTH=false in .env  ← one line, everything restores
//
// Affected locations (search DEV_BYPASS_AUTH to find every bypass point):
//   • contexts/AuthContext.tsx  — stubs isAuthenticated=true, injects TEST_PROFILE
//   • components/AuthGate.tsx   — renders children unconditionally
//   • components/ProtectedRoute.tsx — skips redirect logic
//   • app/(tabs)/index.tsx      — skips isGuest → /login redirect
//   • app/login.tsx             — skips OTP verification, auto-redirects home
// =============================================================================

// TEMPORARY TEST BYPASS — remove before production, gated by EXPO_PUBLIC_SKIP_AUTH
export const DEV_BYPASS_AUTH = process.env.EXPO_PUBLIC_SKIP_AUTH === "true";

// Stable stub ID used by the test profile so all screens render consistently
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
