/**
 * Push Notifications Service
 *
 * This file serves as the TypeScript entry point for the notifications module.
 * At runtime, Metro will resolve to the platform-specific implementation:
 * - notifications.native.ts for iOS/Android
 * - notifications.web.ts for web
 *
 * This file re-exports from the web stub to satisfy TypeScript's module resolution,
 * but the actual implementation used at runtime depends on the platform.
 */

// Re-export everything from the web stub for TypeScript compatibility
// Metro bundler will override this with the correct platform-specific file
export * from "./notifications.web";
export { default } from "./notifications.web";
