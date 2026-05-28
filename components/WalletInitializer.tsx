/**
 * WalletInitializer - Ensures wallet is initialized when user is authenticated
 *
 * This component watches the auth state and initializes the wallet store
 * and challenge store whenever a user logs in. It should be placed inside AuthProvider.
 */

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWalletStore } from "@/stores/walletStore";
import { useChallengeStore } from "@/stores/challengeStore";

export function WalletInitializer({ children }: { children: React.ReactNode }) {
  const { profile, isAuthenticated, isGuest, walletProvider } = useAuth();
  const { initializeWallet, setWalletAddress, clearWallet } = useWalletStore();
  const { initializeBiconomy, initialize: initializeChallengeStore } = useChallengeStore();

  useEffect(() => {
    if (isAuthenticated && !isGuest && profile?.id) {
      console.log("[WalletInitializer] Initializing wallet for user:", profile.id);

      // Set wallet address if available
      if (profile.embedded_wallet_address) {
        setWalletAddress(profile.embedded_wallet_address);
      }

      // Initialize wallet (fetches balance, sets up subscriptions)
      initializeWallet(profile.id);

      // Initialize challenge store for this user
      initializeChallengeStore(profile.id);

      // Initialize relay SDK with wallet provider if available
      if (walletProvider) {
        console.log("[WalletInitializer] Initializing relay SDK with wallet provider");
        initializeBiconomy(walletProvider).catch((err) => {
          console.error("[WalletInitializer] Failed to initialize relay SDK:", err);
        });
      }
    } else if (isGuest || !isAuthenticated) {
      // Clear wallet when user logs out or is in guest mode
      clearWallet();
    }
  }, [
    isAuthenticated,
    isGuest,
    profile?.id,
    profile?.embedded_wallet_address,
    walletProvider,
    initializeWallet,
    setWalletAddress,
    clearWallet,
    initializeChallengeStore,
    initializeBiconomy,
  ]);

  return <>{children}</>;
}
