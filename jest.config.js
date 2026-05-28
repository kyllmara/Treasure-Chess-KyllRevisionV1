/**
 * Jest Configuration for Treasure Chess App
 *
 * Comprehensive test setup for:
 * - Unit tests for lib/ functions
 * - Store tests for Zustand stores
 * - Component tests for React Native components
 * - Integration tests for feature flows
 */

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],

  // Module resolution
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Redirect nativewind jsx-runtime to react's jsx-runtime to avoid ESM issues
    "^nativewind/jsx-runtime$": "react/jsx-runtime",
    "^nativewind/jsx-dev-runtime$": "react/jsx-dev-runtime",
    // Mock css-interop to avoid ESM issues
    "^react-native-css-interop(.*)$": "<rootDir>/__tests__/__mocks__/react-native-css-interop.js",
  },

  // Transform configuration
  transform: {
    "^.+\\.[tj]sx?$": ["ts-jest", {
      tsconfig: "tsconfig.json",
      isolatedModules: true, // Skip type checking for faster tests
      babelConfig: true, // Use babel.config.js for JSX transformation
    }],
  },

  // Transform ignore patterns - allow transformation of React Native and Expo packages
  transformIgnorePatterns: [
    "node_modules/(?!(" +
      "react-native|" +
      "react-native-.*|" +
      "@react-native|" +
      "expo|" +
      "expo-.*|" +
      "@expo|" +
      "@unimodules|" +
      "unimodules|" +
      "lucide-react-native|" +
      "zustand|" +
      "@testing-library|" +
      "nativewind" +
    ")/)",
  ],

  // Test patterns
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.tsx",
    "**/__tests__/**/*.spec.ts",
    "**/__tests__/**/*.spec.tsx",
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/setup.ts",
    "/__tests__/__mocks__/",
  ],

  // Coverage configuration
  collectCoverageFrom: [
    "lib/**/*.{ts,tsx}",
    "stores/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],

  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Module file extensions
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Reset mocks - disabled because it breaks module mocks defined in setup.ts
  resetMocks: false,

  // Restore mocks - disabled to preserve module mocks
  restoreMocks: false,

  // Test timeout
  testTimeout: 10000,

  // Globals
  globals: {
    __DEV__: true,
  },
};
