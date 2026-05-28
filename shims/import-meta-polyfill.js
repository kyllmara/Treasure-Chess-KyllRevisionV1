// Polyfill for import.meta.env which is not supported in Metro bundler
// This is needed for zustand v5+ devtools middleware which uses import.meta.env
if (typeof global !== 'undefined') {
  // Create a mock import.meta object if it doesn't exist
  // This won't work for the syntax error, but helps with runtime access
  global.__importMetaEnv = {
    MODE: process.env.NODE_ENV || 'development',
    DEV: process.env.NODE_ENV !== 'production',
    PROD: process.env.NODE_ENV === 'production',
  };
}
