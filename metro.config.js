const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Fix for viem/ox package resolution issues with Metro bundler
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  "react-native",
  "browser",
  "require",
  "import",
];

// Fix for React 19 + Expo SDK 54 web compatibility
// Force Metro to use default exports for React on web
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Add node polyfill resolvers for crypto packages
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: require.resolve("stream-browserify"),
  crypto: require.resolve("react-native-quick-crypto"),
};

// Block native-only packages from being bundled on web
// These packages cause runtime errors on web due to incompatible native code
const nativeOnlyPackages = [
  "posthog-react-native",
  "@react-native-community/slider",
  "react-native-webview",
];

// Custom resolver to return empty modules for native-only packages on web
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Only apply shimming for web platform
  if (platform === "web") {
    // Check if this is a native-only package
    for (const pkg of nativeOnlyPackages) {
      if (moduleName === pkg || moduleName.startsWith(`${pkg}/`)) {
        // Return an empty module
        return {
          filePath: path.resolve(__dirname, "shims/empty-module.js"),
          type: "sourceFile",
        };
      }
    }
  }

  // Use original resolver for everything else
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
