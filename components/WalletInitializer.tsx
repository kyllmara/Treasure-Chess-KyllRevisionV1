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
  const { profile, isAuthenticated, isGuest } = useAuth();
  const { initializeWallet, setWalletAddress, clearWallet } = useWalletStore();
  const { initialize: initializeChallengeStore } = useChallengeStore();

  useEffect(() => {
    if (isAuthenticated && !isGuest && profile?.id) {
      if (profile.embedded_wallet_address) {
        setWalletAddress(profile.embedded_wallet_address);
      }
      initializeWallet(profile.id);
      initializeChallengeStore(profile.id);
    } else if (isGuest || !isAuthenticated) {
      clearWallet();
    }
  }, [
    isAuthenticated,
    isGuest,
    profile?.id,
    profile?.embedded_wallet_address,
    initializeWallet,
    setWalletAddress,
    clearWallet,
    initializeChallengeStore,
  ]);

  return <>{children}</>;
}
