import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";
import type { User, BetAmount, Transaction } from "@/types";
import { translations, type TranslationKey } from "@/constants/translations";
import { rewardsService } from "@/lib/rewards";

const STORAGE_KEY = "@chess_betting_user";
const TRANSACTIONS_KEY = "@chess_betting_transactions";
const ACCEPTED_CHALLENGES_KEY = "@chess_betting_accepted_challenges";

export const [AppProvider, useApp] = createContextHook(() => {
  const [user, setUser] = useState<User>({
    id: "user_1",
    username: "ChessMaster",
    profilePicture: null,
    email: "chessmaster@example.com",
    country: "United States",
    language: "English",
    walletBalance: 100,
    eloRating: 1500,
    totalWins: 0,
    totalLosses: 0,
    totalCheckmates: 0,
    totalEarnings: 0,
    totalPoints: 0,
    countryRank: 0,
    worldRank: 0,
    currentWinStreak: 0,
    totalGamesPlayed: 0,
    gameSettings: {
      boardTheme: "retro",
      pieceStyle: "classic",
      soundEffects: true,
      vibration: true,
    },
    unlockedAvatars: [],
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [acceptedChallenges, setAcceptedChallenges] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [customChallengeMatchmaking, setCustomChallengeMatchmaking] = useState<{
    isWaiting: boolean;
    challengeId: string | null;
    challengeData: any | null;
  }>({ isWaiting: false, challengeId: null, challengeData: null });

  useEffect(() => {
    loadUser();
    loadTransactions();
    loadAcceptedChallenges();
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && stored.length > 0) {
        try {
          if (stored.trim().startsWith('{') || stored.trim().startsWith('[')) {
            const parsedUser = JSON.parse(stored);
            if (parsedUser && typeof parsedUser === 'object') {
              setUser((currentUser) => ({
                ...currentUser,
                ...parsedUser,
                gameSettings: {
                  boardTheme: "retro",
                  pieceStyle: "classic",
                  soundEffects: true,
                  vibration: true,
                  ...parsedUser.gameSettings,
                },
                unlockedAvatars: parsedUser.unlockedAvatars || [],
              }));
            } else {
              console.error("Invalid user data format, resetting storage");
              await AsyncStorage.removeItem(STORAGE_KEY);
            }
          } else {
            console.error("Stored data is not valid JSON, resetting storage");
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        } catch (parseError) {
          console.error("Failed to parse user data, resetting storage:", parseError);
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const stored = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (stored && stored.length > 0) {
        try {
          if (stored.trim().startsWith('{') || stored.trim().startsWith('[')) {
            const parsedTransactions = JSON.parse(stored);
            if (Array.isArray(parsedTransactions)) {
              setTransactions(parsedTransactions.map((t: Transaction) => ({
                ...t,
                timestamp: new Date(t.timestamp),
              })));
            } else {
              console.error("Invalid transactions data format, resetting storage");
              await AsyncStorage.removeItem(TRANSACTIONS_KEY);
            }
          } else {
            console.error("Stored transactions data is not valid JSON, resetting storage");
            await AsyncStorage.removeItem(TRANSACTIONS_KEY);
          }
        } catch (parseError) {
          console.error("Failed to parse transactions data, resetting storage:", parseError);
          await AsyncStorage.removeItem(TRANSACTIONS_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load transactions:", error);
    }
  };

  const loadAcceptedChallenges = async () => {
    try {
      const stored = await AsyncStorage.getItem(ACCEPTED_CHALLENGES_KEY);
      if (stored && stored.length > 0) {
        try {
          if (stored.trim().startsWith('{') || stored.trim().startsWith('[')) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setAcceptedChallenges(parsed);
            } else {
              console.error("Invalid accepted challenges format, resetting storage");
              await AsyncStorage.removeItem(ACCEPTED_CHALLENGES_KEY);
            }
          } else {
            console.error("Stored accepted challenges is not valid JSON, resetting storage");
            await AsyncStorage.removeItem(ACCEPTED_CHALLENGES_KEY);
          }
        } catch (parseError) {
          console.error("Failed to parse accepted challenges:", parseError);
          await AsyncStorage.removeItem(ACCEPTED_CHALLENGES_KEY);
        }
      }
    } catch (error) {
      console.error("Failed to load accepted challenges:", error);
    }
  };


  const addTransaction = useCallback(async (transaction: Omit<Transaction, "id" | "timestamp">) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setTransactions(prevTransactions => {
      const updatedTransactions = [newTransaction, ...prevTransactions];
      AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(updatedTransactions)).catch(error => {
        console.error("Failed to save transaction:", error);
      });
      return updatedTransactions;
    });
  }, []);

  const updateProfile = useCallback((updates: Partial<User>) => {
    setUser(currentUser => {
      const updatedUser = { ...currentUser, ...updates };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
  }, []);

  const addFunds = useCallback((amount: number, method: string = "Card") => {
    setUser(currentUser => {
      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance + amount,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "deposit",
      amount,
      tctAmount: amount / 0.04,
      method,
      status: "completed",
      description: `Deposit via ${method}`,
    });
  }, [addTransaction]);

  const withdrawFunds = useCallback((amount: number, method: string = "Bank Transfer") => {
    setUser(currentUser => {
      if (amount > currentUser.walletBalance) {
        throw new Error("Insufficient funds");
      }
      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance - amount,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "withdrawal",
      amount,
      tctAmount: amount / 0.04,
      method,
      status: "completed",
      description: `Withdrawal via ${method}`,
    });
  }, [addTransaction]);

  const placeBet = useCallback((amount: BetAmount) => {
    setUser(currentUser => {
      if (amount > currentUser.walletBalance) {
        throw new Error("Insufficient funds");
      }
      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance - amount,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
  }, []);

  // Trigger reward progress check (fire-and-forget, non-blocking)
  const triggerRewardCheck = useCallback((userId?: string) => {
    if (!userId) return;
    rewardsService.checkAndUnlockRewards(userId).catch((err) => {
      console.error("[AppContext] Background reward check failed:", err);
    });
  }, []);

  const winGame = useCallback((betAmount: BetAmount, isCheckmate: boolean = false, userId?: string) => {
    const totalPrizePool = betAmount * 2;
    const commission = totalPrizePool * 0.1;
    const winnings = totalPrizePool - commission;
    setUser(currentUser => {
      const newTotalWins = currentUser.totalWins + 1;

      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance + winnings,
        totalWins: newTotalWins,
        totalCheckmates: isCheckmate ? currentUser.totalCheckmates + 1 : currentUser.totalCheckmates,
        totalEarnings: currentUser.totalEarnings + (betAmount - commission / 2),
        totalPoints: currentUser.totalPoints + 7,
        currentWinStreak: currentUser.currentWinStreak + 1,
        totalGamesPlayed: currentUser.totalGamesPlayed + 1,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "stake_won",
      amount: winnings,
      tctAmount: winnings / 0.04,
      status: "completed",
      description: `Won staked game${isCheckmate ? ' (Checkmate)' : ''}`,
    });
    // Trigger reward progress check after win
    triggerRewardCheck(userId);
  }, [addTransaction, triggerRewardCheck]);

  const loseGame = useCallback((betAmount: BetAmount, userId?: string) => {
    setUser(currentUser => {
      const updatedUser = {
        ...currentUser,
        totalLosses: currentUser.totalLosses + 1,
        totalPoints: currentUser.totalPoints - 7,
        currentWinStreak: 0,
        totalGamesPlayed: currentUser.totalGamesPlayed + 1,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "stake_lost",
      amount: betAmount,
      tctAmount: betAmount / 0.04,
      status: "completed",
      description: "Lost staked game",
    });
    // Trigger reward progress check after loss (games_played milestones)
    triggerRewardCheck(userId);
  }, [addTransaction, triggerRewardCheck]);

  const resetStats = useCallback(() => {
    setUser(currentUser => {
      const updatedUser = {
        ...currentUser,
        totalWins: 0,
        totalLosses: 0,
        totalCheckmates: 0,
        totalEarnings: 0,
        totalPoints: 0,
        countryRank: 0,
        worldRank: 0,
        currentWinStreak: 0,
        totalGamesPlayed: 0,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
  }, []);

  const factoryReset = useCallback(async () => {
    const defaultUser: User = {
      id: "user_1",
      username: "ChessMaster",
      profilePicture: null,
      email: "chessmaster@example.com",
      country: "United States",
      language: "English",
      walletBalance: 100,
      eloRating: 1500,
      totalWins: 0,
      totalLosses: 0,
      totalCheckmates: 0,
      totalEarnings: 0,
      totalPoints: 0,
      countryRank: 0,
      worldRank: 0,
      currentWinStreak: 0,
      totalGamesPlayed: 0,
      gameSettings: {
        boardTheme: "retro",
        pieceStyle: "classic",
        soundEffects: true,
        vibration: true,
      },
      unlockedAvatars: [],
    };
    setUser(defaultUser);
    setTransactions([]);
    setAcceptedChallenges([]);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser));
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([]));
    await AsyncStorage.setItem(ACCEPTED_CHALLENGES_KEY, JSON.stringify([]));
  }, []);

  const deactivateAccount = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    await AsyncStorage.removeItem(ACCEPTED_CHALLENGES_KEY);
    const defaultUser: User = {
      id: "user_1",
      username: "ChessMaster",
      profilePicture: null,
      email: "chessmaster@example.com",
      country: "United States",
      language: "English",
      walletBalance: 100,
      eloRating: 1500,
      totalWins: 0,
      totalLosses: 0,
      totalCheckmates: 0,
      totalEarnings: 0,
      totalPoints: 0,
      countryRank: 0,
      worldRank: 0,
      currentWinStreak: 0,
      totalGamesPlayed: 0,
      gameSettings: {
        boardTheme: "retro",
        pieceStyle: "classic",
        soundEffects: true,
        vibration: true,
      },
      unlockedAvatars: [],
    };
    setUser(defaultUser);
    setTransactions([]);
    setAcceptedChallenges([]);
  }, []);

  const acceptChallenge = useCallback(async (challengeId: string, amount: number) => {
    setUser(currentUser => {
      if (amount > currentUser.walletBalance) {
        throw new Error("Insufficient funds");
      }
      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance - amount,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "deposit",
      amount,
      tctAmount: amount / 0.04,
      method: "Challenge Deposit",
      status: "completed",
      description: `Deposited for challenge`,
    });
    setAcceptedChallenges(currentAccepted => {
      const updatedAccepted = [...currentAccepted, challengeId];
      AsyncStorage.setItem(ACCEPTED_CHALLENGES_KEY, JSON.stringify(updatedAccepted)).catch(error => {
        console.error("Failed to save accepted challenges:", error);
      });
      return updatedAccepted;
    });
  }, [addTransaction]);

  const cancelChallenge = useCallback(async (challengeId: string, amount: number) => {
    setUser(currentUser => {
      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance + amount,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)).catch(error => {
        console.error("Failed to save user:", error);
      });
      return updatedUser;
    });
    addTransaction({
      type: "withdrawal",
      amount,
      tctAmount: amount / 0.04,
      method: "Challenge Cancelled",
      status: "completed",
      description: `Challenge deposit refunded`,
    });
    setAcceptedChallenges(currentAccepted => {
      const updatedAccepted = currentAccepted.filter(id => id !== challengeId);
      AsyncStorage.setItem(ACCEPTED_CHALLENGES_KEY, JSON.stringify(updatedAccepted)).catch(error => {
        console.error("Failed to save accepted challenges:", error);
      });
      return updatedAccepted;
    });
  }, [addTransaction]);


  const t = useCallback((key: TranslationKey): string => {
    const currentLanguage = user.language || "English";
    return translations[currentLanguage]?.[key] || translations["English"][key];
  }, [user.language]);

  const enterCustomChallengeMatchmaking = useCallback((challengeId: string, challengeData: any) => {
    setCustomChallengeMatchmaking({
      isWaiting: true,
      challengeId,
      challengeData,
    });
  }, []);

  const exitCustomChallengeMatchmaking = useCallback(() => {
    setCustomChallengeMatchmaking({
      isWaiting: false,
      challengeId: null,
      challengeData: null,
    });
  }, []);

  return {
    user,
    transactions,
    acceptedChallenges,
    isLoading,
    customChallengeMatchmaking,
    updateProfile,
    addFunds,
    withdrawFunds,
    placeBet,
    winGame,
    loseGame,
    resetStats,
    factoryReset,
    deactivateAccount,
    acceptChallenge,
    cancelChallenge,
    enterCustomChallengeMatchmaking,
    exitCustomChallengeMatchmaking,
    triggerRewardCheck,
    t,
  };
});
