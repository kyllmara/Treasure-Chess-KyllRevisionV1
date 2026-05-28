import { useMemo } from "react";
import type { Balance } from "@/types/supabase";

export type WalletState = {
  address: string | null;
  isReady: boolean;
  isLoading: boolean;
  balance: Balance | null;
  availableTCT: number;
  lockedTCT: number;
  error: string | null;
};

export type WalletActions = {
  refreshBalance: () => Promise<void>;
  signMessage: (message: string) => Promise<string | null>;
};

export type UseWalletReturn = WalletState & WalletActions;

// Web version - Privy Expo SDK doesn't support web
// This provides a stub implementation for web platform
export function useWallet(): UseWalletReturn {
  return useMemo(
    () => ({
      address: null,
      isReady: false,
      isLoading: false,
      balance: null,
      availableTCT: 0,
      lockedTCT: 0,
      error: "Wallet not available on web. Please use the mobile app.",
      refreshBalance: async () => {},
      signMessage: async () => null,
    }),
    []
  );
}
