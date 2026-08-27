import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";
import { AppState, type AppStateStatus } from "react-native";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Transaction as SupabaseTransaction, PendingDeposit as SupabasePendingDeposit, Withdrawal as SupabaseWithdrawal, Balance as SupabaseBalance } from "@/types/supabase";
import {
  fetchBalance as fetchBalanceFromService,
  getOrCreateBalance,
  subscribeToBalanceChanges,
  subscribeToTransactions,
  cleanupAllSubscriptions,
  type WalletBalanceSummary,
} from "@/lib/wallet";

// ============================================================================
// On-Chain USDC Balance Constants
// ============================================================================

// Use environment variables for network configuration
const USDC_CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_USDC_CONTRACT || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const USDC_DECIMALS = 6;
const USDC_TO_TCT_RATE = 25; // 1 USDC = 25 TCT
const RPC_URL = process.env.EXPO_PUBLIC_RPC_URL || "https://mainnet.base.org";
const BALANCE_OF_SELECTOR = "0x70a08231";

// ============================================================================
// On-Chain Balance Fetcher
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
      console.error("[WalletStore] RPC error fetching USDC balance:", data.error);
      return 0;
    }

    // Parse the balance from hex
    const balanceWei = BigInt(data.result || "0x0");
    const balanceUsdc = Number(balanceWei) / Math.pow(10, USDC_DECIMALS);

    return balanceUsdc;
  } catch (error) {
    console.error("[WalletStore] Error fetching on-chain USDC balance from:", RPC_URL, error);
    return 0;
  }
}

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "wager_placed"
  | "wager_won"
  | "wager_lost"
  | "reward"
  | "wager_lock"
  | "wager_unlock"
  | "win_payout"
  | "loss_deduct"
  | "commission"
  | "refund";

export type TransactionStatus = "pending" | "confirmed" | "failed";

export type TransactionFilter = "all" | "deposits" | "withdrawals" | "wagers" | "rewards";

// Offline operation queue item
export interface OfflineOperation {
  id: string;
  type: "withdrawal" | "deposit";
  data: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  status: "pending" | "processing" | "failed";
  error?: string;
}

// Optimistic update snapshot for rollback
export interface OptimisticSnapshot {
  id: string;
  previousBalance: number;
  previousLockedBalance: number;
  operationType: "withdrawal" | "deposit" | "wager";
  amount: number;
  timestamp: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number; // in USD
  tctAmount: number; // in TCT
  method?: string;
  txHash?: string;
  status: TransactionStatus;
  description: string;
  createdAt: string;
  gameId?: string | null;
  balanceBeforeTct?: number;
  balanceAfterTct?: number;
}

// Pending crypto deposit interface
export interface PendingCryptoDeposit {
  id: string;
  txHash: string;
  amountUsdc: number;
  amountTct: number;
  confirmations: number;
  requiredConfirmations: number;
  status: "pending" | "confirming" | "confirmed" | "failed";
  createdAt: string;
}

// Pending withdrawal interface
export interface PendingWithdrawal {
  id: string;
  type: "crypto" | "bank";
  amountTct: number;
  feeTct: number;
  netAmountTct: number;
  netAmountUsdc?: number;
  netAmountUsd?: number;
  destinationAddress?: string;
  txHash?: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt?: string;
}

export interface WalletState {
  // Privy wallet
  walletAddress: string | null;
  isWalletConnected: boolean;

  // Balances (synced from Supabase)
  tctBalance: number; // On-platform balance (available)
  lockedTctBalance: number; // Locked in active games
  usdcBalance: number; // On-chain USDC (from Privy wallet)
  totalDepositedTct: number;
  totalWithdrawnTct: number;
  totalWonTct: number;
  totalLostTct: number;
  totalCommissionPaidTct: number;

  // Transactions
  transactions: Transaction[];
  pendingDeposits: Transaction[];
  pendingWithdrawals: Transaction[];

  // Pending crypto deposits
  pendingCryptoDeposits: PendingCryptoDeposit[];
  isLoadingPendingDeposits: boolean;

  // Pending withdrawals
  pendingCryptoWithdrawals: PendingWithdrawal[];
  isLoadingWithdrawals: boolean;

  // Loading states
  isLoadingTransactions: boolean;
  isLoadingBalance: boolean;
  isRefreshing: boolean;
  transactionError: string | null;
  balanceError: string | null;

  // Pagination
  hasMoreTransactions: boolean;
  transactionPage: number;

  // Exchange rate
  tctToUsdRate: number; // 1 TCT = 0.04 USD

  // Sync state
  lastBalanceSyncAt: string | null;
  lastTransactionSyncAt: string | null;
  isSubscribed: boolean;

  // Offline queue
  offlineQueue: OfflineOperation[];
  isOnline: boolean;
  isProcessingQueue: boolean;

  // Optimistic updates
  optimisticSnapshots: OptimisticSnapshot[];

  // Selected transaction for detail view
  selectedTransaction: Transaction | null;

  // Internal state (not persisted)
  _balanceUnsubscribe: (() => void) | null;
  _transactionUnsubscribe: (() => void) | null;
  _appStateSubscription: { remove: () => void } | null;
  _currentUserId: string | null;

  // Actions
  setWalletAddress: (address: string | null) => void;
  setWalletConnected: (connected: boolean) => void;

  setTctBalance: (balance: number) => void;
  setLockedTctBalance: (balance: number) => void;
  setUsdcBalance: (balance: number) => void;

  addTransaction: (transaction: Omit<Transaction, "id" | "createdAt">) => void;
  updateTransactionStatus: (id: string, status: TransactionStatus, txHash?: string) => void;

  // Supabase balance sync
  fetchBalance: (userId: string) => Promise<void>;
  refreshBalance: (userId: string) => Promise<void>;

  // Supabase transaction sync
  fetchTransactions: (userId: string, filter?: TransactionFilter, page?: number) => Promise<void>;
  refreshTransactions: (userId: string) => Promise<void>;
  loadMoreTransactions: (userId: string, filter?: TransactionFilter) => Promise<void>;

  // Pending crypto deposits
  fetchPendingCryptoDeposits: (userId: string) => Promise<void>;
  refreshPendingCryptoDeposits: (userId: string) => Promise<void>;

  // Pending withdrawals
  fetchPendingWithdrawals: (userId: string) => Promise<void>;
  refreshPendingWithdrawals: (userId: string) => Promise<void>;

  // Real-time subscriptions
  subscribeToChanges: (userId: string) => void;
  unsubscribeFromChanges: () => void;

  // App foreground sync
  setupAppStateListener: (userId: string) => void;
  cleanupAppStateListener: () => void;

  // Initialize wallet for user (combines balance fetch + subscriptions)
  initializeWallet: (userId: string) => Promise<void>;

  // Conversions
  usdToTct: (usd: number) => number;
  tctToUsd: (tct: number) => number;

  // Optimistic updates
  applyOptimisticWithdrawal: (amount: number) => string;
  rollbackOptimisticUpdate: (snapshotId: string) => void;
  confirmOptimisticUpdate: (snapshotId: string) => void;

  // Offline queue
  addToOfflineQueue: (operation: Omit<OfflineOperation, "id" | "createdAt" | "retryCount" | "status">) => void;
  processOfflineQueue: (userId: string) => Promise<void>;
  setOnlineStatus: (isOnline: boolean) => void;
  clearFailedOperations: () => void;

  // Transaction detail
  setSelectedTransaction: (transaction: Transaction | null) => void;

  // Get combined transactions (including pending withdrawals)
  getCombinedTransactions: () => Transaction[];

  // Reset
  clearWallet: () => void;
}

const TCT_TO_USD_RATE = 0.04; // 1 TCT = $0.04 (25 TCT = $1)
const TRANSACTIONS_PER_PAGE = 20;

// Map Supabase transaction type to local type
function mapSupabaseTransactionType(type: SupabaseTransaction["type"]): TransactionType {
  const typeMap: Record<SupabaseTransaction["type"], TransactionType> = {
    deposit: "deposit",
    withdraw: "withdrawal",
    wager_lock: "wager_lock",
    wager_unlock: "wager_unlock",
    win_payout: "win_payout",
    loss_deduct: "loss_deduct",
    commission: "commission",
    refund: "refund",
  };
  return typeMap[type] || "deposit";
}

// Convert Supabase transaction to local Transaction format
function mapSupabaseTransaction(tx: SupabaseTransaction): Transaction {
  return {
    id: tx.id,
    type: mapSupabaseTransactionType(tx.type),
    amount: tx.amount_tct * TCT_TO_USD_RATE, // Convert TCT to USD
    tctAmount: tx.amount_tct,
    txHash: tx.tx_hash ?? undefined,
    status: "confirmed", // Supabase transactions are already confirmed
    description: tx.description ?? getDefaultDescription(tx.type, tx.amount_tct),
    createdAt: tx.created_at,
    gameId: tx.game_id,
    balanceBeforeTct: tx.balance_before_tct,
    balanceAfterTct: tx.balance_after_tct,
  };
}

function getDefaultDescription(type: SupabaseTransaction["type"], amount: number): string {
  const descriptions: Record<SupabaseTransaction["type"], string> = {
    deposit: `Deposited ${amount} TCT`,
    withdraw: `Withdrew ${amount} TCT`,
    wager_lock: `Locked ${amount} TCT for game`,
    wager_unlock: `Unlocked ${amount} TCT from game`,
    win_payout: `Won ${amount} TCT`,
    loss_deduct: `Lost ${amount} TCT`,
    commission: `Commission: ${amount} TCT`,
    refund: `Refunded ${amount} TCT`,
  };
  return descriptions[type] || `Transaction: ${amount} TCT`;
}

// Get filter conditions for Supabase query
function getFilterTypes(filter: TransactionFilter): SupabaseTransaction["type"][] | null {
  switch (filter) {
    case "deposits":
      return ["deposit"];
    case "withdrawals":
      return ["withdraw"];
    case "wagers":
      return ["wager_lock", "wager_unlock", "win_payout", "loss_deduct"];
    case "rewards":
      return ["refund"];
    case "all":
    default:
      return null;
  }
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      walletAddress: null,
      isWalletConnected: false,

      tctBalance: 0,
      lockedTctBalance: 0,
      usdcBalance: 0,
      totalDepositedTct: 0,
      totalWithdrawnTct: 0,
      totalWonTct: 0,
      totalLostTct: 0,
      totalCommissionPaidTct: 0,

      transactions: [],
      pendingDeposits: [],
      pendingWithdrawals: [],

      pendingCryptoDeposits: [],
      isLoadingPendingDeposits: false,

      pendingCryptoWithdrawals: [],
      isLoadingWithdrawals: false,

      isLoadingTransactions: false,
      isLoadingBalance: false,
      isRefreshing: false,
      transactionError: null,
      balanceError: null,

      hasMoreTransactions: true,
      transactionPage: 0,

      tctToUsdRate: TCT_TO_USD_RATE,

      lastBalanceSyncAt: null,
      lastTransactionSyncAt: null,
      isSubscribed: false,

      offlineQueue: [],
      isOnline: true,
      isProcessingQueue: false,

      optimisticSnapshots: [],

      selectedTransaction: null,

      _balanceUnsubscribe: null,
      _transactionUnsubscribe: null,
      _appStateSubscription: null,
      _currentUserId: null,

      setWalletAddress: (address) =>
        set({ walletAddress: address, isWalletConnected: !!address }),

      setWalletConnected: (connected) => set({ isWalletConnected: connected }),

      setTctBalance: (balance) => set({ tctBalance: balance }),
      setLockedTctBalance: (balance) => set({ lockedTctBalance: balance }),
      setUsdcBalance: (balance) => set({ usdcBalance: balance }),

      addTransaction: (transaction) => {
        const newTransaction: Transaction = {
          ...transaction,
          id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
        };

        set((state) => {
          const transactions = [newTransaction, ...state.transactions];

          // Track pending transactions
          let pendingDeposits = [...state.pendingDeposits];
          let pendingWithdrawals = [...state.pendingWithdrawals];

          if (transaction.status === "pending") {
            if (transaction.type === "deposit") {
              pendingDeposits = [newTransaction, ...pendingDeposits];
            } else if (transaction.type === "withdrawal") {
              pendingWithdrawals = [newTransaction, ...pendingWithdrawals];
            }
          }

          return { transactions, pendingDeposits, pendingWithdrawals };
        });
      },

      updateTransactionStatus: (id, status, txHash) => {
        set((state) => {
          const transactions = state.transactions.map((tx) =>
            tx.id === id ? { ...tx, status, txHash: txHash || tx.txHash } : tx
          );

          // Remove from pending if confirmed/failed
          const pendingDeposits =
            status !== "pending"
              ? state.pendingDeposits.filter((tx) => tx.id !== id)
              : state.pendingDeposits;

          const pendingWithdrawals =
            status !== "pending"
              ? state.pendingWithdrawals.filter((tx) => tx.id !== id)
              : state.pendingWithdrawals;

          return { transactions, pendingDeposits, pendingWithdrawals };
        });
      },

      fetchTransactions: async (userId: string, filter: TransactionFilter = "all", page: number = 0) => {
        if (DEV_BYPASS_AUTH || !isSupabaseConfigured) {
          return;
        }

        set({ isLoadingTransactions: true, transactionError: null });

        try {
          const filterTypes = getFilterTypes(filter);
          const offset = page * TRANSACTIONS_PER_PAGE;

          let query = supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .range(offset, offset + TRANSACTIONS_PER_PAGE - 1);

          if (filterTypes) {
            query = query.in("type", filterTypes);
          }

          const { data, error } = await query;

          if (error) {
            throw error;
          }

          const mappedTransactions = (data as SupabaseTransaction[]).map(mapSupabaseTransaction);
          const hasMore = data.length === TRANSACTIONS_PER_PAGE;

          set((state) => ({
            transactions: page === 0 ? mappedTransactions : [...state.transactions, ...mappedTransactions],
            hasMoreTransactions: hasMore,
            transactionPage: page,
            isLoadingTransactions: false,
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to fetch transactions";
          console.error("Failed to fetch transactions:", error);
          set({ transactionError: errorMessage, isLoadingTransactions: false });
        }
      },

      refreshTransactions: async (userId: string) => {
        if (!isSupabaseConfigured) {
          return;
        }

        set({ isRefreshing: true, transactionError: null });

        try {
          const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(TRANSACTIONS_PER_PAGE);

          if (error) {
            throw error;
          }

          const mappedTransactions = (data as SupabaseTransaction[]).map(mapSupabaseTransaction);

          set({
            transactions: mappedTransactions,
            hasMoreTransactions: data.length === TRANSACTIONS_PER_PAGE,
            transactionPage: 0,
            isRefreshing: false,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to refresh transactions";
          console.error("Failed to refresh transactions:", error);
          set({ transactionError: errorMessage, isRefreshing: false });
        }
      },

      loadMoreTransactions: async (userId: string, filter: TransactionFilter = "all") => {
        const { hasMoreTransactions, transactionPage, isLoadingTransactions } = get();

        if (!hasMoreTransactions || isLoadingTransactions) {
          return;
        }

        await get().fetchTransactions(userId, filter, transactionPage + 1);
      },

      fetchPendingCryptoDeposits: async (userId: string) => {
        if (!isSupabaseConfigured) {
          return;
        }

        set({ isLoadingPendingDeposits: true });

        try {
          // Query pending_deposits table directly for non-confirmed deposits
          const { data, error } = await supabase
            .from("pending_deposits")
            .select("id, tx_hash, amount_usdc, amount_tct, confirmations, required_confirmations, status, created_at")
            .eq("user_id", userId)
            .in("status", ["pending", "confirming"])
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            throw error;
          }

          const deposits = (data || []) as SupabasePendingDeposit[];
          const pendingDeposits: PendingCryptoDeposit[] = deposits.map((deposit) => ({
            id: deposit.id,
            txHash: deposit.tx_hash,
            amountUsdc: Number(deposit.amount_usdc),
            amountTct: deposit.amount_tct,
            confirmations: deposit.confirmations,
            requiredConfirmations: deposit.required_confirmations,
            status: deposit.status as PendingCryptoDeposit["status"],
            createdAt: deposit.created_at,
          }));

          set({
            pendingCryptoDeposits: pendingDeposits,
            isLoadingPendingDeposits: false,
          });
        } catch (error) {
          console.error("Failed to fetch pending crypto deposits:", error);
          set({ isLoadingPendingDeposits: false });
        }
      },

      refreshPendingCryptoDeposits: async (userId: string) => {
        if (!isSupabaseConfigured) {
          return;
        }

        try {
          const { data, error } = await supabase
            .from("pending_deposits")
            .select("id, tx_hash, amount_usdc, amount_tct, confirmations, required_confirmations, status, created_at")
            .eq("user_id", userId)
            .in("status", ["pending", "confirming"])
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            throw error;
          }

          const deposits = (data || []) as SupabasePendingDeposit[];
          const pendingDeposits: PendingCryptoDeposit[] = deposits.map((deposit) => ({
            id: deposit.id,
            txHash: deposit.tx_hash,
            amountUsdc: Number(deposit.amount_usdc),
            amountTct: deposit.amount_tct,
            confirmations: deposit.confirmations,
            requiredConfirmations: deposit.required_confirmations,
            status: deposit.status as PendingCryptoDeposit["status"],
            createdAt: deposit.created_at,
          }));

          set({ pendingCryptoDeposits: pendingDeposits });
        } catch (error) {
          console.error("Failed to refresh pending crypto deposits:", error);
        }
      },

      fetchPendingWithdrawals: async (userId: string) => {
        if (!isSupabaseConfigured) {
          return;
        }

        set({ isLoadingWithdrawals: true });

        try {
          const { data, error } = await supabase
            .from("withdrawals")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["pending", "processing"])
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            throw error;
          }

          const withdrawals = (data || []) as SupabaseWithdrawal[];
          const pendingWithdrawals: PendingWithdrawal[] = withdrawals.map((w) => ({
            id: w.id,
            type: w.type,
            amountTct: w.amount_tct,
            feeTct: w.fee_tct,
            netAmountTct: w.net_amount_tct,
            netAmountUsdc: w.net_amount_usdc ?? undefined,
            netAmountUsd: w.net_amount_usd ?? undefined,
            destinationAddress: w.destination_address ?? undefined,
            txHash: w.tx_hash ?? undefined,
            status: w.status,
            createdAt: w.created_at,
            completedAt: w.completed_at ?? undefined,
          }));

          set({
            pendingCryptoWithdrawals: pendingWithdrawals,
            isLoadingWithdrawals: false,
          });
        } catch (error) {
          console.error("Failed to fetch pending withdrawals:", error);
          set({ isLoadingWithdrawals: false });
        }
      },

      refreshPendingWithdrawals: async (userId: string) => {
        if (!isSupabaseConfigured) {
          return;
        }

        try {
          const { data, error } = await supabase
            .from("withdrawals")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["pending", "processing"])
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            throw error;
          }

          const withdrawals = (data || []) as SupabaseWithdrawal[];
          const pendingWithdrawals: PendingWithdrawal[] = withdrawals.map((w) => ({
            id: w.id,
            type: w.type,
            amountTct: w.amount_tct,
            feeTct: w.fee_tct,
            netAmountTct: w.net_amount_tct,
            netAmountUsdc: w.net_amount_usdc ?? undefined,
            netAmountUsd: w.net_amount_usd ?? undefined,
            destinationAddress: w.destination_address ?? undefined,
            txHash: w.tx_hash ?? undefined,
            status: w.status,
            createdAt: w.created_at,
            completedAt: w.completed_at ?? undefined,
          }));

          set({ pendingCryptoWithdrawals: pendingWithdrawals });
        } catch (error) {
          console.error("Failed to refresh pending withdrawals:", error);
        }
      },

      usdToTct: (usd) => usd / TCT_TO_USD_RATE,
      tctToUsd: (tct) => tct * TCT_TO_USD_RATE,

      // ========================================================================
      // Balance Sync - On-Chain USDC + Supabase for locked funds
      // ========================================================================

      fetchBalance: async (userId: string) => {
        const { walletAddress } = get();

        set({ isLoadingBalance: true, balanceError: null });

        try {
          // Fetch on-chain USDC balance if we have a wallet address
          if (walletAddress) {
            const usdcBalance = await fetchOnChainUsdcBalance(walletAddress);
            const tctFromUsdc = Math.floor(usdcBalance * USDC_TO_TCT_RATE);

            if (__DEV__) console.log("[WalletStore] On-chain USDC balance:", usdcBalance, "= TCT:", tctFromUsdc);

            set({
              usdcBalance: usdcBalance,
              tctBalance: tctFromUsdc,
            });
          }

          // Fetch balance from Supabase DB (source of truth for TCT)
          if (isSupabaseConfigured && userId) {
            const result = await getOrCreateBalance(userId);

            if (result.success && result.data) {
              const balance = result.data;
              set({
                tctBalance: balance.availableTct,
                lockedTctBalance: balance.lockedTct,
                totalDepositedTct: balance.totalDepositedTct,
                totalWithdrawnTct: balance.totalWithdrawnTct,
                totalWonTct: balance.totalWonTct,
                totalLostTct: balance.totalLostTct,
                totalCommissionPaidTct: balance.totalCommissionPaidTct,
              });
            }
          }

          set({
            isLoadingBalance: false,
            lastBalanceSyncAt: new Date().toISOString(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to fetch balance";
          console.error("Failed to fetch balance:", error);
          set({ balanceError: errorMessage, isLoadingBalance: false });
        }
      },

      refreshBalance: async (userId: string) => {
        if (DEV_BYPASS_AUTH) return;
        const { walletAddress } = get();

        try {
          // Fetch on-chain USDC balance
          if (walletAddress) {
            const usdcBalance = await fetchOnChainUsdcBalance(walletAddress);
            const tctFromUsdc = Math.floor(usdcBalance * USDC_TO_TCT_RATE);

            if (__DEV__) console.log("[WalletStore] Refreshed on-chain USDC:", usdcBalance, "= TCT:", tctFromUsdc);

            set({
              usdcBalance: usdcBalance,
              tctBalance: tctFromUsdc,
            });
          }

          // Refresh balance from Supabase DB (source of truth for TCT)
          if (isSupabaseConfigured && userId) {
            const result = await fetchBalanceFromService(userId);

            if (result.success && result.data) {
              const balance = result.data;
              set({
                tctBalance: balance.availableTct,
                lockedTctBalance: balance.lockedTct,
                totalDepositedTct: balance.totalDepositedTct,
                totalWithdrawnTct: balance.totalWithdrawnTct,
                totalWonTct: balance.totalWonTct,
                totalLostTct: balance.totalLostTct,
                totalCommissionPaidTct: balance.totalCommissionPaidTct,
              });
            }
          }

          set({
            lastBalanceSyncAt: new Date().toISOString(),
            balanceError: null,
          });
        } catch (error) {
          console.error("Failed to refresh balance:", error);
        }
      },

      // ========================================================================
      // Real-time Subscriptions
      // ========================================================================

      subscribeToChanges: (userId: string) => {
        const { _balanceUnsubscribe, _transactionUnsubscribe, isSubscribed } = get();

        // Already subscribed
        if (isSubscribed) {
          return;
        }

        // Clean up any existing subscriptions
        if (_balanceUnsubscribe) {
          _balanceUnsubscribe();
        }
        if (_transactionUnsubscribe) {
          _transactionUnsubscribe();
        }

        // Subscribe to balance changes
        const balanceUnsub = subscribeToBalanceChanges(userId, (balance: WalletBalanceSummary) => {
          console.log("[WalletStore] Balance updated via real-time subscription");
          set({
            tctBalance: balance.availableTct,
            lockedTctBalance: balance.lockedTct,
            totalDepositedTct: balance.totalDepositedTct,
            totalWithdrawnTct: balance.totalWithdrawnTct,
            totalWonTct: balance.totalWonTct,
            totalLostTct: balance.totalLostTct,
            totalCommissionPaidTct: balance.totalCommissionPaidTct,
            lastBalanceSyncAt: new Date().toISOString(),
          });
        });

        // Subscribe to new transactions
        const transactionUnsub = subscribeToTransactions(userId, async (transaction) => {
          console.log("[WalletStore] New transaction via real-time subscription:", transaction.type);

          // Convert to local Transaction format
          const localTx: Transaction = {
            id: transaction.id,
            type: mapSupabaseTransactionType(transaction.type),
            amount: transaction.amountUsd,
            tctAmount: transaction.amountTct,
            txHash: transaction.txHash ?? undefined,
            status: "confirmed",
            description: transaction.description ?? transaction.displayType,
            createdAt: transaction.createdAt.toISOString(),
            gameId: transaction.gameId,
            balanceBeforeTct: transaction.balanceBeforeTct,
            balanceAfterTct: transaction.balanceAfterTct,
          };

          set((state) => ({
            transactions: [localTx, ...state.transactions.filter(t => t.id !== transaction.id)],
            lastTransactionSyncAt: new Date().toISOString(),
          }));

          // Trigger push notification for deposits
          if (transaction.type === "deposit") {
            try {
              const { NotificationService } = await import("@/lib/notifications");
              await NotificationService.notifyDepositConfirmed(transaction.amountUsd, transaction.txHash ?? undefined);
              console.log("[WalletStore] Deposit notification sent");
            } catch (error) {
              console.warn("[WalletStore] Failed to send deposit notification:", error);
            }
          }

          // Trigger push notification for completed withdrawals
          if (transaction.type === "withdraw") {
            try {
              const { NotificationService } = await import("@/lib/notifications");
              await NotificationService.notifyWithdrawalComplete(transaction.amountUsd, transaction.txHash ?? undefined);
              console.log("[WalletStore] Withdrawal notification sent");
            } catch (error) {
              console.warn("[WalletStore] Failed to send withdrawal notification:", error);
            }
          }
        });

        set({
          _balanceUnsubscribe: balanceUnsub,
          _transactionUnsubscribe: transactionUnsub,
          _currentUserId: userId,
          isSubscribed: true,
        });

        console.log("[WalletStore] Real-time subscriptions established for user:", userId);
      },

      unsubscribeFromChanges: () => {
        const { _balanceUnsubscribe, _transactionUnsubscribe } = get();

        if (_balanceUnsubscribe) {
          _balanceUnsubscribe();
        }
        if (_transactionUnsubscribe) {
          _transactionUnsubscribe();
        }

        // Also cleanup from lib/wallet.ts
        cleanupAllSubscriptions();

        set({
          _balanceUnsubscribe: null,
          _transactionUnsubscribe: null,
          _currentUserId: null,
          isSubscribed: false,
        });

        console.log("[WalletStore] Real-time subscriptions cleaned up");
      },

      // ========================================================================
      // App Foreground Sync
      // ========================================================================

      setupAppStateListener: (userId: string) => {
        const { _appStateSubscription } = get();

        // Clean up existing listener
        if (_appStateSubscription) {
          _appStateSubscription.remove();
        }

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
          if (nextAppState === "active") {
            console.log("[WalletStore] App came to foreground, refreshing wallet data");
            const { refreshBalance, refreshTransactions, refreshPendingCryptoDeposits, refreshPendingWithdrawals } = get();

            // Refresh all wallet data
            refreshBalance(userId);
            refreshTransactions(userId);
            refreshPendingCryptoDeposits(userId);
            refreshPendingWithdrawals(userId);
          }
        };

        const subscription = AppState.addEventListener("change", handleAppStateChange);

        set({
          _appStateSubscription: subscription,
          _currentUserId: userId,
        });

        console.log("[WalletStore] App state listener established");
      },

      cleanupAppStateListener: () => {
        const { _appStateSubscription } = get();

        if (_appStateSubscription) {
          _appStateSubscription.remove();
        }

        set({ _appStateSubscription: null });

        console.log("[WalletStore] App state listener cleaned up");
      },

      // ========================================================================
      // Initialize Wallet (combines all setup)
      // ========================================================================

      initializeWallet: async (userId: string) => {
        // In bypass mode the stub UUID has no rows in any Supabase table.
        // Skip all network calls; the store stays at its zero-balance initial state.
        if (DEV_BYPASS_AUTH) {
          console.log("[WalletStore] DEV bypass — skipping Supabase wallet init");
          return;
        }

        console.log("[WalletStore] Initializing wallet for user:", userId);

        const {
          fetchBalance,
          fetchTransactions,
          fetchPendingCryptoDeposits,
          fetchPendingWithdrawals,
          subscribeToChanges,
          setupAppStateListener,
        } = get();

        // Fetch initial data in parallel
        await Promise.all([
          fetchBalance(userId),
          fetchTransactions(userId),
          fetchPendingCryptoDeposits(userId),
          fetchPendingWithdrawals(userId),
        ]);

        // Setup real-time subscriptions
        subscribeToChanges(userId);

        // Setup app foreground sync
        setupAppStateListener(userId);

        console.log("[WalletStore] Wallet initialization complete");
      },

      // ========================================================================
      // Optimistic Updates
      // ========================================================================

      applyOptimisticWithdrawal: (amount: number) => {
        const { tctBalance, lockedTctBalance, optimisticSnapshots } = get();
        const snapshotId = `optimistic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Save snapshot for potential rollback
        const snapshot: OptimisticSnapshot = {
          id: snapshotId,
          previousBalance: tctBalance,
          previousLockedBalance: lockedTctBalance,
          operationType: "withdrawal",
          amount,
          timestamp: new Date().toISOString(),
        };

        // Apply optimistic update - reduce balance immediately
        set({
          tctBalance: Math.max(0, tctBalance - amount),
          optimisticSnapshots: [...optimisticSnapshots, snapshot],
        });

        console.log("[WalletStore] Applied optimistic withdrawal:", { snapshotId, amount, newBalance: tctBalance - amount });
        return snapshotId;
      },

      rollbackOptimisticUpdate: (snapshotId: string) => {
        const { optimisticSnapshots } = get();
        const snapshot = optimisticSnapshots.find(s => s.id === snapshotId);

        if (snapshot) {
          // Restore previous balance
          set({
            tctBalance: snapshot.previousBalance,
            lockedTctBalance: snapshot.previousLockedBalance,
            optimisticSnapshots: optimisticSnapshots.filter(s => s.id !== snapshotId),
          });
          console.log("[WalletStore] Rolled back optimistic update:", snapshotId);
        }
      },

      confirmOptimisticUpdate: (snapshotId: string) => {
        const { optimisticSnapshots } = get();
        // Just remove the snapshot - the balance is already correct
        set({
          optimisticSnapshots: optimisticSnapshots.filter(s => s.id !== snapshotId),
        });
        console.log("[WalletStore] Confirmed optimistic update:", snapshotId);
      },

      // ========================================================================
      // Offline Queue
      // ========================================================================

      addToOfflineQueue: (operation) => {
        const { offlineQueue } = get();
        const newOperation: OfflineOperation = {
          ...operation,
          id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
          retryCount: 0,
          status: "pending",
        };

        set({ offlineQueue: [...offlineQueue, newOperation] });
        console.log("[WalletStore] Added operation to offline queue:", newOperation.id);
      },

      processOfflineQueue: async (userId: string) => {
        const { offlineQueue, isOnline, isProcessingQueue } = get();

        if (!isOnline || isProcessingQueue || offlineQueue.length === 0) {
          return;
        }

        set({ isProcessingQueue: true });
        console.log("[WalletStore] Processing offline queue:", offlineQueue.length, "operations");

        const pendingOperations = offlineQueue.filter(op => op.status === "pending");

        for (const operation of pendingOperations) {
          try {
            // Mark as processing
            set({
              offlineQueue: get().offlineQueue.map(op =>
                op.id === operation.id ? { ...op, status: "processing" as const } : op
              ),
            });

            // Process based on type
            if (operation.type === "withdrawal") {
              const { requestWithdrawal } = await import("@/lib/wallet");
              const result = await requestWithdrawal(operation.data as any);

              if (result.success) {
                // Remove from queue on success
                set({
                  offlineQueue: get().offlineQueue.filter(op => op.id !== operation.id),
                });
                console.log("[WalletStore] Offline operation completed:", operation.id);
              } else {
                throw new Error(result.error?.message || "Operation failed");
              }
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            const updatedOperation = {
              ...operation,
              retryCount: operation.retryCount + 1,
              status: operation.retryCount + 1 >= operation.maxRetries ? "failed" as const : "pending" as const,
              error: errorMessage,
            };

            set({
              offlineQueue: get().offlineQueue.map(op =>
                op.id === operation.id ? updatedOperation : op
              ),
            });
            console.error("[WalletStore] Offline operation failed:", operation.id, errorMessage);
          }
        }

        set({ isProcessingQueue: false });
      },

      setOnlineStatus: (isOnline: boolean) => {
        const previousStatus = get().isOnline;
        set({ isOnline });

        // If coming back online, process queue
        if (!previousStatus && isOnline) {
          const userId = get()._currentUserId;
          if (userId) {
            console.log("[WalletStore] Back online, processing queue");
            get().processOfflineQueue(userId);
          }
        }
      },

      clearFailedOperations: () => {
        const { offlineQueue } = get();
        set({
          offlineQueue: offlineQueue.filter(op => op.status !== "failed"),
        });
      },

      // ========================================================================
      // Transaction Detail
      // ========================================================================

      setSelectedTransaction: (transaction: Transaction | null) => {
        set({ selectedTransaction: transaction });
      },

      // ========================================================================
      // Combined Transactions (including pending withdrawals as transactions)
      // ========================================================================

      getCombinedTransactions: () => {
        const { transactions, pendingCryptoWithdrawals, tctToUsdRate } = get();

        // Convert pending withdrawals to transaction format
        const pendingWithdrawalTransactions: Transaction[] = pendingCryptoWithdrawals.map(w => ({
          id: `pending_withdrawal_${w.id}`,
          type: "withdrawal" as TransactionType,
          amount: w.netAmountTct * tctToUsdRate,
          tctAmount: w.netAmountTct,
          status: w.status === "completed" ? "confirmed" as const :
                  w.status === "failed" ? "failed" as const : "pending" as const,
          description: `${w.type === "crypto" ? "Crypto" : "Bank"} Withdrawal${w.status === "pending" ? " (Processing)" : ""}`,
          createdAt: w.createdAt,
          txHash: w.txHash,
        }));

        // Merge and sort by date (newest first)
        const combined = [...transactions, ...pendingWithdrawalTransactions]
          .filter((tx, index, self) =>
            // Remove duplicates by ID
            index === self.findIndex(t => t.id === tx.id || t.id === `pending_withdrawal_${tx.id}`)
          )
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return combined;
      },

      // ========================================================================
      // Clear Wallet (enhanced to cleanup subscriptions)
      // ========================================================================

      clearWallet: () => {
        const { unsubscribeFromChanges, cleanupAppStateListener } = get();

        // Clean up subscriptions first
        unsubscribeFromChanges();
        cleanupAppStateListener();

        set({
          walletAddress: null,
          isWalletConnected: false,
          tctBalance: 0,
          lockedTctBalance: 0,
          usdcBalance: 0,
          totalDepositedTct: 0,
          totalWithdrawnTct: 0,
          totalWonTct: 0,
          totalLostTct: 0,
          totalCommissionPaidTct: 0,
          transactions: [],
          pendingDeposits: [],
          pendingWithdrawals: [],
          pendingCryptoDeposits: [],
          isLoadingPendingDeposits: false,
          pendingCryptoWithdrawals: [],
          isLoadingWithdrawals: false,
          isLoadingTransactions: false,
          isLoadingBalance: false,
          isRefreshing: false,
          transactionError: null,
          balanceError: null,
          hasMoreTransactions: true,
          transactionPage: 0,
          lastBalanceSyncAt: null,
          lastTransactionSyncAt: null,
          isSubscribed: false,
          offlineQueue: [],
          isProcessingQueue: false,
          optimisticSnapshots: [],
          selectedTransaction: null,
          _balanceUnsubscribe: null,
          _transactionUnsubscribe: null,
          _appStateSubscription: null,
          _currentUserId: null,
        });
      },
    }),
    {
      name: "treasure-chess-wallet",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Persist wallet address
        walletAddress: state.walletAddress,
        // Persist balance for offline viewing
        tctBalance: state.tctBalance,
        lockedTctBalance: state.lockedTctBalance,
        totalDepositedTct: state.totalDepositedTct,
        totalWithdrawnTct: state.totalWithdrawnTct,
        totalWonTct: state.totalWonTct,
        totalLostTct: state.totalLostTct,
        totalCommissionPaidTct: state.totalCommissionPaidTct,
        lastBalanceSyncAt: state.lastBalanceSyncAt,
        // Keep last 100 transactions for offline viewing
        transactions: state.transactions.slice(0, 100),
        lastTransactionSyncAt: state.lastTransactionSyncAt,
        // Persist offline queue for replay when online
        offlineQueue: state.offlineQueue,
        // Persist pending withdrawals for display
        pendingCryptoWithdrawals: state.pendingCryptoWithdrawals,
      }),
    }
  )
);
