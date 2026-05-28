/**
 * useBiconomyWallet Hook (MIGRATED TO RELAY SDK)
 *
 * This hook has been migrated from Biconomy to our custom gasless relay.
 * It maintains the same interface for backward compatibility.
 *
 * Now uses ERC-2771 meta-transactions with our custom forwarder.
 * Users keep their own USDC - platform pays gas.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletStore } from "@/stores/walletStore";
import {
  getRelaySDK,
  resetRelaySDK,
  tctToUsdc,
  usdcToTct,
  TCT_TO_USDC_RATE,
  type RelayResponse,
} from "@/lib/relay";
import { ethers, Contract, parseUnits, formatUnits } from "ethers";

// Re-export for backward compatibility
export { tctToUsdc, usdcToTct, TCT_TO_USDC_RATE };

// Game status enum for compatibility
export enum GameStatus {
  WaitingForOpponent = 0,
  Active = 1,
  Completed = 2,
  Cancelled = 3,
  Disputed = 4,
}

export interface OnChainGame {
  gameId: string;
  player1: string;
  player2: string;
  wagerAmount: string;
  totalPot: string;
  status: GameStatus;
  result: number;
  createdAt: number;
  lastMoveAt: number;
  timeoutSeconds: number;
  moveNonce: number;
}

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gameIdBytes?: string;
}

interface UseBiconomyWalletReturn {
  // State
  isInitialized: boolean;
  isInitializing: boolean;
  smartAccountAddress: string | null;
  eoaAddress: string | null;
  usdcBalance: string;
  tctBalance: number;
  isApproved: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  approveUsdc: () => Promise<TransactionResult>;

  // TCT-based actions
  createGameWithTct: (
    gameId: string,
    wagerTct: number,
    timeoutSeconds?: number
  ) => Promise<TransactionResult & { gameIdBytes?: string }>;
  joinGame: (gameIdBytes: string) => Promise<TransactionResult>;
  cancelGame: (gameIdBytes: string) => Promise<TransactionResult>;
  claimTimeoutWin: (gameIdBytes: string) => Promise<TransactionResult>;
  withdrawTct: (toAddress: string, amountTct: number) => Promise<TransactionResult>;
  payEntryFeeToVault: (amountTct: number, challengeId: string, attemptId?: string) => Promise<TransactionResult>;
  getGame: (gameIdBytes: string) => Promise<OnChainGame | null>;

  // Helpers
  hasEnoughTctBalance: (amountTct: number) => boolean;
  tctToUsdc: (tct: number) => number;
  usdcToTct: (usdc: number) => number;
}

// USDC ABI for transfers
const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const ESCROW_ABI = [
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
];

const USDC_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_USDC_CONTRACT || "";
const ESCROW_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";

export function useBiconomyWallet(): UseBiconomyWalletReturn {
  const { user, walletProvider } = useAuth();
  const { setWalletAddress, setUsdcBalance } = useWalletStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const [eoaAddress, setEoaAddress] = useState<string | null>(null);
  const [usdcBalance, setLocalUsdcBalance] = useState("0");
  const [tctBalance, setLocalTctBalance] = useState(0);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize relay SDK with wallet
   * Note: SDK may already be pre-initialized in AuthContext on login
   */
  const initialize = useCallback(async () => {
    if (!walletProvider) {
      setError("No wallet provider available");
      return;
    }

    if (isInitializing || isInitialized) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      const sdk = getRelaySDK();

      // Check if SDK is already initialized (from AuthContext pre-initialization)
      let address: string;
      if (sdk.isInitialized()) {
        address = sdk.getAddress();
        console.log("[useBiconomyWallet] SDK already initialized, syncing state");
      } else {
        address = await sdk.initialize(walletProvider);
      }

      // With relay, EOA and "smart account" are the same (user's Magic wallet)
      setEoaAddress(address);
      setSmartAccountAddress(address);
      setWalletAddress(address);

      // Fetch initial balance
      const balance = await sdk.getUsdcBalance();
      setLocalUsdcBalance(balance);
      setLocalTctBalance(Math.floor(usdcToTct(parseFloat(balance))));
      setUsdcBalance(parseFloat(balance));

      // Check approval status
      const allowance = await sdk.checkAllowance();
      setIsApproved(parseFloat(allowance) > 1000000);

      setIsInitialized(true);
      console.log("[useBiconomyWallet] Initialized with relay:", {
        address,
        balance,
        approved: parseFloat(allowance) > 1000000,
      });
    } catch (err: any) {
      console.error("[useBiconomyWallet] Initialization failed:", err);
      setError(err.message || "Failed to initialize wallet");
    } finally {
      setIsInitializing(false);
    }
  }, [walletProvider, isInitializing, isInitialized, setWalletAddress, setUsdcBalance]);

  /**
   * Refresh USDC balance
   */
  const refreshBalance = useCallback(async () => {
    if (!isInitialized) return;

    try {
      const sdk = getRelaySDK();
      const balance = await sdk.getUsdcBalance();
      setLocalUsdcBalance(balance);
      setLocalTctBalance(Math.floor(usdcToTct(parseFloat(balance))));
      setUsdcBalance(parseFloat(balance));

      const allowance = await sdk.checkAllowance();
      setIsApproved(parseFloat(allowance) > 1000000);
    } catch (err: any) {
      console.error("[useBiconomyWallet] Failed to refresh balance:", err);
    }
  }, [isInitialized, setUsdcBalance]);

  /**
   * Approve USDC spending (gasless via relay)
   */
  const approveUsdc = useCallback(async (): Promise<TransactionResult> => {
    if (!isInitialized) {
      return { success: false, error: "Wallet not initialized" };
    }

    try {
      const sdk = getRelaySDK();
      const result = await sdk.approveUsdc();
      if (result.success) {
        setIsApproved(true);
      }
      return {
        success: result.success,
        txHash: result.txHash,
        error: result.error,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [isInitialized]);

  /**
   * Create a new game with TCT wager (gasless via relay)
   */
  const createGameWithTct = useCallback(
    async (
      gameId: string,
      wagerTct: number,
      timeoutSeconds: number = 0
    ): Promise<TransactionResult & { gameIdBytes?: string }> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      if (tctBalance < wagerTct) {
        return { success: false, error: `Insufficient balance. Need ${wagerTct} TCT` };
      }

      try {
        const sdk = getRelaySDK();
        const wagerUsdc = tctToUsdc(wagerTct).toFixed(6);

        // Use approveAndCreateGame if not approved
        let result: RelayResponse & { gameIdBytes?: string };
        if (isApproved) {
          result = await sdk.createGame(gameId, wagerUsdc, timeoutSeconds);
        } else {
          result = await sdk.approveAndCreateGame(gameId, wagerUsdc, timeoutSeconds);
        }

        if (result.success) {
          await refreshBalance();
          if (!isApproved) {
            setIsApproved(true);
          }
        }

        return {
          success: result.success,
          txHash: result.txHash,
          error: result.error,
          gameIdBytes: result.gameIdBytes,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [isInitialized, isApproved, tctBalance, refreshBalance]
  );

  /**
   * Join an existing game (gasless via relay)
   */
  const joinGame = useCallback(
    async (gameIdBytes: string): Promise<TransactionResult> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      try {
        const sdk = getRelaySDK();

        // Get game details to check wager
        const game = await sdk.getOnChainGame(gameIdBytes);
        if (!game) {
          return { success: false, error: "Game not found on-chain" };
        }

        if (game.status !== 0) {
          return { success: false, error: "Game is not available to join" };
        }

        const wagerTct = usdcToTct(parseFloat(game.wagerAmount));
        if (tctBalance < wagerTct) {
          return {
            success: false,
            error: `Insufficient balance. Need ${wagerTct} TCT`,
          };
        }

        // Approve if needed, then join
        if (!isApproved) {
          const approveResult = await sdk.approveUsdc();
          if (!approveResult.success) {
            return { success: false, error: approveResult.error || "Approval failed" };
          }
          setIsApproved(true);
          // Wait for approval to be indexed
          await new Promise((r) => setTimeout(r, 2000));
        }

        const result = await sdk.joinGame(gameIdBytes);

        if (result.success) {
          await refreshBalance();
        }

        return {
          success: result.success,
          txHash: result.txHash,
          error: result.error,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [isInitialized, isApproved, tctBalance, refreshBalance]
  );

  /**
   * Cancel a game (gasless via relay)
   */
  const cancelGame = useCallback(
    async (gameIdBytes: string): Promise<TransactionResult> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      try {
        const sdk = getRelaySDK();
        const result = await sdk.cancelGame(gameIdBytes);
        if (result.success) {
          await refreshBalance();
        }
        return {
          success: result.success,
          txHash: result.txHash,
          error: result.error,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [isInitialized, refreshBalance]
  );

  /**
   * Claim timeout win (gasless via relay)
   */
  const claimTimeoutWin = useCallback(
    async (gameIdBytes: string): Promise<TransactionResult> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      try {
        const sdk = getRelaySDK();
        const result = await sdk.claimTimeoutWin(gameIdBytes);
        if (result.success) {
          await refreshBalance();
        }
        return {
          success: result.success,
          txHash: result.txHash,
          error: result.error,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [isInitialized, refreshBalance]
  );

  /**
   * Withdraw TCT to external wallet as USDC
   * NOTE: This requires user to pay gas since it's a direct transfer
   * Consider using relay for this if needed in the future
   */
  const withdrawTct = useCallback(
    async (toAddress: string, amountTct: number): Promise<TransactionResult> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 42) {
        return { success: false, error: "Invalid wallet address" };
      }

      if (tctBalance < amountTct) {
        return {
          success: false,
          error: `Insufficient balance. Have ${tctBalance} TCT, need ${amountTct} TCT`,
        };
      }

      try {
        // For withdrawals, we need to send a direct USDC transfer
        // This currently requires the user to pay gas
        // TODO: Add relay support for USDC transfers if needed
        const sdk = getRelaySDK();
        const provider = new ethers.BrowserProvider(walletProvider);
        const signer = await provider.getSigner();

        const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, signer);
        const amountUsdc = parseUnits(tctToUsdc(amountTct).toFixed(6), 6);

        const tx = await usdc.transfer(toAddress, amountUsdc);
        const receipt = await tx.wait();

        await refreshBalance();

        return {
          success: true,
          txHash: receipt.hash,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [isInitialized, tctBalance, walletProvider, refreshBalance]
  );

  /**
   * Pay entry fee to vault (GASLESS via relay)
   * Used for house challenge entry fees
   * Platform pays gas - user just signs permit
   */
  const payEntryFeeToVault = useCallback(
    async (amountTct: number, challengeId: string, attemptId?: string): Promise<TransactionResult> => {
      if (!isInitialized) {
        return { success: false, error: "Wallet not initialized" };
      }

      if (tctBalance < amountTct) {
        return {
          success: false,
          error: `Insufficient balance. Have ${tctBalance} TCT, need ${amountTct} TCT`,
        };
      }

      try {
        const sdk = getRelaySDK();
        const result = await sdk.payEntryFeeToVault(amountTct, challengeId, attemptId);

        if (result.success) {
          await refreshBalance();
        }

        return {
          success: result.success,
          txHash: result.txHash,
          error: result.error,
        };
      } catch (err: any) {
        console.error("[useBiconomyWallet] Entry fee payment failed:", err);
        return { success: false, error: err.message };
      }
    },
    [isInitialized, tctBalance, refreshBalance]
  );

  /**
   * Get game details from chain
   */
  const getGame = useCallback(
    async (gameIdBytes: string): Promise<OnChainGame | null> => {
      if (!isInitialized) return null;

      try {
        const sdk = getRelaySDK();
        const game = await sdk.getOnChainGame(gameIdBytes);

        if (!game) return null;

        return {
          gameId: gameIdBytes,
          player1: game.player1,
          player2: game.player2,
          wagerAmount: game.wagerAmount,
          totalPot: game.totalPot,
          status: game.status as GameStatus,
          result: game.result,
          createdAt: 0,
          lastMoveAt: 0,
          timeoutSeconds: 0,
          moveNonce: 0,
        };
      } catch (err: any) {
        console.error("[useBiconomyWallet] Failed to get game:", err);
        return null;
      }
    },
    [isInitialized]
  );

  /**
   * Check if user has enough TCT balance
   */
  const hasEnoughTctBalance = useCallback(
    (amountTct: number): boolean => {
      return tctBalance >= amountTct;
    },
    [tctBalance]
  );

  // Auto-initialize when wallet provider is available
  useEffect(() => {
    if (walletProvider && user && !isInitialized && !isInitializing) {
      initialize();
    }
  }, [walletProvider, user, isInitialized, isInitializing, initialize]);

  // Cleanup on unmount or logout
  useEffect(() => {
    return () => {
      if (!user) {
        resetRelaySDK();
        setIsInitialized(false);
        setSmartAccountAddress(null);
        setEoaAddress(null);
        setLocalUsdcBalance("0");
        setLocalTctBalance(0);
        setIsApproved(false);
      }
    };
  }, [user]);

  return {
    // State
    isInitialized,
    isInitializing,
    smartAccountAddress,
    eoaAddress,
    usdcBalance,
    tctBalance,
    isApproved,
    error,

    // Actions
    initialize,
    refreshBalance,
    approveUsdc,
    createGameWithTct,
    joinGame,
    cancelGame,
    claimTimeoutWin,
    withdrawTct,
    payEntryFeeToVault,
    getGame,

    // Helpers
    hasEnoughTctBalance,
    tctToUsdc,
    usdcToTct,
  };
}
