/**
 * useWallet - Wallet Management Hook
 *
 * Provides access to the user's embedded wallet and balance information.
 *
 * Features:
 * - Embedded wallet address from Magic Link
 * - On-chain USDC balance from Base network
 * - TCT balance calculated from USDC (1 USDC = 25 TCT)
 * - Message signing for transactions
 *
 * Usage:
 * ```tsx
 * const {
 *   address,
 *   isReady,
 *   availableTCT,
 *   availableUSDC,
 *   refreshBalance,
 *   signMessage,
 * } = useWallet();
 * ```
 */

import { useCallback, useState, useEffect, useMemo } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Balance } from "@/types/supabase";

// ============================================================================
// Constants for On-Chain Balance
// ============================================================================

// Use environment variables for network configuration
const USDC_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_USDC_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const USDC_DECIMALS = 6;
const USDC_TO_TCT_RATE = 25; // 1 USDC = 25 TCT
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://mainnet.base.org";

// ERC20 balanceOf function selector
const BALANCE_OF_SELECTOR = "0x70a08231";

// ============================================================================
// Helper: Fetch On-Chain USDC Balance
// ============================================================================

async function fetchOnChainUsdcBalance(walletAddress: string): Promise<number> {
  try {
    // Pad address to 32 bytes for the call data
    const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, "0");
    const callData = BALANCE_OF_SELECTOR + paddedAddress;

    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          {
            to: USDC_CONTRACT_ADDRESS,
            data: callData,
          },
          "latest",
        ],
        id: 1,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[useWallet] RPC error fetching USDC balance:", data.error);
      return 0;
    }

    // Parse the balance from hex
    const balanceWei = BigInt(data.result || "0x0");
    const balanceUsdc = Number(balanceWei) / Math.pow(10, USDC_DECIMALS);

    return balanceUsdc;
  } catch (error) {
    console.error("[useWallet] Error fetching on-chain USDC balance:", error);
    return 0;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface WalletState {
  /** User's wallet address */
  address: string | null;
  /** Whether wallet is ready to use */
  isReady: boolean;
  /** Whether balance is loading */
  isLoading: boolean;
  /** User's balance from Supabase (for locked funds tracking) */
  balance: Balance | null;
  /** Available TCT balance (from on-chain USDC) */
  availableTCT: number;
  /** Available USDC balance (on-chain) */
  availableUSDC: number;
  /** Locked TCT balance (in active games/challenges - from Supabase) */
  lockedTCT: number;
  /** Error message */
  error: string | null;
}

export interface WalletActions {
  /** Refresh balance from Supabase */
  refreshBalance: () => Promise<void>;
  /** Sign a message with the wallet */
  signMessage: (message: string) => Promise<string | null>;
}

export type UseWalletReturn = WalletState & WalletActions;

// ============================================================================
// Hook
// ============================================================================

export function useWallet(): UseWalletReturn {
  const { profile, isAuthenticated, isGuest, user, magicUser } = useAuth();

  const [balance, setBalance] = useState<Balance | null>(null);
  const [onChainUsdcBalance, setOnChainUsdcBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine wallet address from multiple sources
  const address = useMemo(() => {
    // First check Magic user's public address
    if (magicUser?.publicAddress) {
      return magicUser.publicAddress;
    }
    // Then check profile
    if (profile?.embedded_wallet_address) {
      return profile.embedded_wallet_address;
    }
    // Finally check user object
    if (user?.walletAddress) {
      return user.walletAddress;
    }
    return null;
  }, [magicUser?.publicAddress, profile?.embedded_wallet_address, user?.walletAddress]);

  // Wallet ready status
  const isReady = useMemo(() => {
    if (!isAuthenticated || isGuest) return false;
    return Boolean(address);
  }, [isAuthenticated, isGuest, address]);

  // -------------------------------------------------------------------------
  // Fetch Balance (On-Chain USDC + Supabase for locked funds)
  // -------------------------------------------------------------------------

  const fetchBalance = useCallback(async () => {
    if (!isAuthenticated || isGuest) {
      return;
    }

    setIsLoadingBalance(true);
    setError(null);

    try {
      // Fetch on-chain USDC balance if we have a wallet address
      if (address) {
        const usdcBalance = await fetchOnChainUsdcBalance(address);
        setOnChainUsdcBalance(usdcBalance);
        console.log("[useWallet] On-chain USDC balance:", usdcBalance, "for address:", address);
      }

      // Fetch locked balance from Supabase (for active games/challenges)
      if (profile?.id && isSupabaseConfigured) {
        const { data, error: fetchError } = await supabase
          .from("balances")
          .select("*")
          .eq("user_id", profile.id)
          .single();

        if (fetchError) {
          // PGRST116 means no rows returned - not an error for new users
          if (fetchError.code !== "PGRST116") {
            console.error("[useWallet] Error fetching Supabase balance:", fetchError);
            setError(fetchError.message);
          } else {
            // New user - no balance record yet
            setBalance(null);
          }
        } else {
          setBalance(data);
        }
      }
    } catch (e) {
      console.error("[useWallet] Exception fetching balance:", e);
      setError(e instanceof Error ? e.message : "Failed to fetch balance");
    } finally {
      setIsLoadingBalance(false);
    }
  }, [profile?.id, isGuest, isAuthenticated, address]);

  // Fetch balance on mount and when profile/address changes
  useEffect(() => {
    if (isAuthenticated && !isGuest && address) {
      fetchBalance();
    } else {
      setBalance(null);
      setOnChainUsdcBalance(0);
    }
  }, [profile?.id, isGuest, isAuthenticated, address, fetchBalance]);

  // -------------------------------------------------------------------------
  // Sign Message
  // -------------------------------------------------------------------------

  const signMessage = useCallback(
    async (_message: string): Promise<string | null> => {
      // Message signing requires an external wallet (Reown AppKit) — not yet implemented
      setError("Message signing requires a connected wallet");
      return null;
    },
    []
  );

  // -------------------------------------------------------------------------
  // Refresh Balance
  // -------------------------------------------------------------------------

  const refreshBalance = useCallback(async () => {
    await fetchBalance();
  }, [fetchBalance]);

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------

  // Available TCT is based on on-chain USDC balance (1 USDC = 25 TCT)
  const availableTCT = useMemo(() => {
    return Math.floor(onChainUsdcBalance * USDC_TO_TCT_RATE);
  }, [onChainUsdcBalance]);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return useMemo(
    () => ({
      address,
      isReady,
      isLoading: isLoadingBalance,
      balance,
      availableTCT,
      availableUSDC: onChainUsdcBalance,
      lockedTCT: balance?.locked_tct ?? 0,
      error,
      refreshBalance,
      signMessage,
    }),
    [address, isReady, isLoadingBalance, balance, availableTCT, onChainUsdcBalance, error, refreshBalance, signMessage]
  );
}

export default useWallet;
