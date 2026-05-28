/**
 * MagicWrapper - Authentication Provider using Magic Link
 *
 * Configures Magic Link SDK with:
 * - Email OTP authentication with embedded wallet
 * - Automatic wallet creation on signup
 * - Polygon chain support (Amoy testnet for dev, Mainnet for prod)
 *
 * Magic Link provides invisible wallet management - users sign in with
 * email and get a wallet automatically without seeing any blockchain UX.
 *
 * Note: OAuth extensions are not supported in React Native environment.
 * Use email OTP for authentication in the mobile app.
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { Magic } from "@magic-sdk/react-native-expo";

// ============================================================================
// Configuration
// ============================================================================

const MAGIC_API_KEY = process.env.EXPO_PUBLIC_MAGIC_API_KEY || "";

// Chain configurations
const POLYGON_MAINNET_CONFIG = {
  rpcUrl: "https://polygon-rpc.com",
  chainId: 137,
};

const POLYGON_AMOY_CONFIG = {
  rpcUrl: "https://rpc-amoy.polygon.technology",
  chainId: 80002,
};

const BASE_CHAIN_CONFIG = {
  rpcUrl: "https://mainnet.base.org",
  chainId: 8453,
};

const BASE_SEPOLIA_CONFIG = {
  rpcUrl: "https://sepolia.base.org",
  chainId: 84532,
};

// Use Polygon Amoy testnet in development, Polygon mainnet in production
const IS_DEV = process.env.EXPO_PUBLIC_DEBUG_MODE === "true";
const CHAIN_CONFIG = IS_DEV ? POLYGON_AMOY_CONFIG : POLYGON_MAINNET_CONFIG;

// ============================================================================
// Magic Instance
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let magicInstance: any = null;

/**
 * Get or create Magic instance (singleton)
 * Returns the Magic instance configured for email OTP authentication
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMagicInstance(): any {
  if (!MAGIC_API_KEY) {
    if (__DEV__) {
      console.warn(
        "[MagicWrapper] EXPO_PUBLIC_MAGIC_API_KEY not configured.\n" +
        "Authentication will be disabled. Get your API key from magic.link dashboard."
      );
    }
    return null;
  }

  if (!magicInstance) {
    try {
      magicInstance = new Magic(MAGIC_API_KEY, {
        network: {
          rpcUrl: CHAIN_CONFIG.rpcUrl,
          chainId: CHAIN_CONFIG.chainId,
        },
        // Note: No extensions needed for email OTP authentication
        // OAuth extensions are not supported in React Native
      });
      console.log("[MagicWrapper] Magic instance created with chain:", CHAIN_CONFIG.chainId);
    } catch (e) {
      console.error("[MagicWrapper] Failed to initialize Magic:", e);
      return null;
    }
  }

  return magicInstance;
}

// ============================================================================
// Context
// ============================================================================

interface MagicContextType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  magic: any;
  isReady: boolean;
}

const MagicContext = createContext<MagicContextType>({
  magic: null,
  isReady: false,
});

/**
 * Hook to access Magic instance
 */
export function useMagic() {
  return useContext(MagicContext);
}

// ============================================================================
// Provider Component
// ============================================================================

interface MagicWrapperProps {
  children: React.ReactNode;
}

/**
 * Wraps the app with Magic Link authentication provider.
 *
 * Features:
 * - Email OTP login with automatic wallet creation
 * - Invisible blockchain UX - users just see email login
 * - Polygon chain support (Amoy testnet for dev, Mainnet for prod)
 *
 * If EXPO_PUBLIC_MAGIC_API_KEY is not set, renders children without Magic
 * (guest mode will still work, but authentication will be disabled).
 */
export function MagicWrapper({ children }: MagicWrapperProps) {
  const [isReady, setIsReady] = useState(false);
  const magic = useMemo(() => getMagicInstance(), []);

  useEffect(() => {
    async function initMagic() {
      if (!magic) {
        setIsReady(true);
        return;
      }

      try {
        // Check if user is already logged in
        const isLoggedIn = await magic.user.isLoggedIn();
        console.log("[MagicWrapper] Magic initialized, user logged in:", isLoggedIn);
        setIsReady(true);
      } catch (e) {
        console.error("[MagicWrapper] Failed to check login status:", e);
        setIsReady(true);
      }
    }

    initMagic();
  }, [magic]);

  const value = useMemo(
    () => ({
      magic,
      isReady,
    }),
    [magic, isReady]
  );

  return (
    <MagicContext.Provider value={value}>
      {/* Magic's Relayer component handles the authentication UI */}
      {magic?.Relayer && <magic.Relayer />}
      {children}
    </MagicContext.Provider>
  );
}

export default MagicWrapper;
