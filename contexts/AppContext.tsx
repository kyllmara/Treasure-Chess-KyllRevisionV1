import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useCallback } from "react";
import type { User, BetAmount, Transaction } from "@/types";
import { translations, type TranslationKey } from "@/constants/translations";
import { rewardsService } from "@/lib/rewards";

const STORAGE_KEY = "@chess_betting_user";
const TRANSACTIONS_KEY = "@chess_betting_transactions";
const ACCEPTED_CHALLENGES_KEY = "@chess_betting_accepted_challenges";
const GENERATED_DRAGON_KEY = "@chess_betting_generated_dragon";
const GENERATED_TEENAGE_DRAGON_KEY = "@chess_betting_generated_teenage_dragon";

const DRAGON_EGG_IMAGE = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pmiuevjqnf7r9sjx1y6xw";

const TEENAGE_DRAGON_AVATARS = [
  "https://r2-pub.rork.com/generated-images/0d77351e-5ae4-4fd4-85c9-d40337247e61.png",
  "https://r2-pub.rork.com/generated-images/2c7178ac-3096-416e-be22-cf009c5c489d.png",
  "https://r2-pub.rork.com/generated-images/69b5e875-14b0-4b40-bf22-96c695d6b2be.png",
  "https://r2-pub.rork.com/generated-images/47fcabb7-7000-4456-83c2-e6859069b70d.png",
  "https://r2-pub.rork.com/generated-images/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png",
  "https://r2-pub.rork.com/generated-images/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png",
  "https://r2-pub.rork.com/generated-images/af03441f-c644-46ce-8ab1-44a2a267ba28.png",
  "https://r2-pub.rork.com/generated-images/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png",
  "https://r2-pub.rork.com/generated-images/4891fc39-750e-4ebd-b2fa-73600f8549a0.png",
];

const NON_FIERCE_ADULT_AVATARS = [
  "https://r2-pub.rork.com/generated-images/d5421ced-b222-469e-86e9-bf57414cd738.png",
  "https://r2-pub.rork.com/generated-images/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png",
  "https://r2-pub.rork.com/generated-images/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png",
  "https://r2-pub.rork.com/generated-images/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png",
  "https://r2-pub.rork.com/generated-images/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png",
  "https://r2-pub.rork.com/generated-images/6086acd7-2054-4db0-a38b-ddb62d8173a7.png",
  "https://r2-pub.rork.com/generated-images/d4928689-63db-46a9-a7c4-806463141952.png",
  "https://r2-pub.rork.com/generated-images/637923f8-0483-4397-8775-a745526d7f32.png",
  "https://r2-pub.rork.com/generated-images/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png",
];

const FIERCE_ADULT_AVATARS = [
  "https://r2-pub.rork.com/generated-images/4090decb-e03e-4e1e-836d-6a97455932cf.png",
  "https://r2-pub.rork.com/generated-images/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png",
  "https://r2-pub.rork.com/generated-images/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png",
  "https://r2-pub.rork.com/generated-images/3f3a6e15-3411-4972-8348-766fa05572db.png",
  "https://r2-pub.rork.com/generated-images/6233121d-9638-41cd-9cc0-831af74194eb.png",
  "https://r2-pub.rork.com/generated-images/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png",
  "https://r2-pub.rork.com/generated-images/c7776511-a385-4bf9-a051-7cce392c1409.png",
  "https://r2-pub.rork.com/generated-images/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png",
  "https://r2-pub.rork.com/generated-images/30e626dc-e0de-411a-859d-edd24d7608fc.png",
];

export const [AppProvider, useApp] = createContextHook(() => {
  const [user, setUser] = useState<User>({
    id: "user_1",
    username: "ChessMaster",
    profilePicture: DRAGON_EGG_IMAGE,
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
  const [generatedDragon, setGeneratedDragon] = useState<string | null>(null);
  const [generatedTeenageDragon, setGeneratedTeenageDragon] = useState<string | null>(null);
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
    loadGeneratedDragon();
    loadGeneratedTeenageDragon();
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

  const loadGeneratedDragon = async () => {
    try {
      const stored = await AsyncStorage.getItem(GENERATED_DRAGON_KEY);
      if (stored && stored.length > 0) {
        setGeneratedDragon(stored);
      }
    } catch (error) {
      console.error("Failed to load generated dragon:", error);
    }
  };

  const loadGeneratedTeenageDragon = async () => {
    try {
      const stored = await AsyncStorage.getItem(GENERATED_TEENAGE_DRAGON_KEY);
      if (stored && stored.length > 0) {
        setGeneratedTeenageDragon(stored);
      }
    } catch (error) {
      console.error("Failed to load generated teenage dragon:", error);
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
      let newUnlockedAvatars = [...currentUser.unlockedAvatars];

      if (newTotalWins === 10) {
        newUnlockedAvatars = [...new Set([...newUnlockedAvatars, ...TEENAGE_DRAGON_AVATARS])];
      }

      if (newTotalWins === 75) {
        newUnlockedAvatars = [...new Set([...newUnlockedAvatars, ...NON_FIERCE_ADULT_AVATARS])];
      }

      if (newTotalWins === 200) {
        newUnlockedAvatars = [...new Set([...newUnlockedAvatars, ...FIERCE_ADULT_AVATARS])];
      }

      const updatedUser = {
        ...currentUser,
        walletBalance: currentUser.walletBalance + winnings,
        totalWins: newTotalWins,
        totalCheckmates: isCheckmate ? currentUser.totalCheckmates + 1 : currentUser.totalCheckmates,
        totalEarnings: currentUser.totalEarnings + (betAmount - commission / 2),
        totalPoints: currentUser.totalPoints + 7,
        currentWinStreak: currentUser.currentWinStreak + 1,
        totalGamesPlayed: currentUser.totalGamesPlayed + 1,
        unlockedAvatars: newUnlockedAvatars,
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
      profilePicture: DRAGON_EGG_IMAGE,
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
    setGeneratedDragon(null);
    setGeneratedTeenageDragon(null);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUser));
    await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([]));
    await AsyncStorage.setItem(ACCEPTED_CHALLENGES_KEY, JSON.stringify([]));
    await AsyncStorage.removeItem(GENERATED_DRAGON_KEY);
    await AsyncStorage.removeItem(GENERATED_TEENAGE_DRAGON_KEY);
  }, []);

  const deactivateAccount = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    await AsyncStorage.removeItem(ACCEPTED_CHALLENGES_KEY);
    await AsyncStorage.removeItem(GENERATED_DRAGON_KEY);
    await AsyncStorage.removeItem(GENERATED_TEENAGE_DRAGON_KEY);
    const defaultUser: User = {
      id: "user_1",
      username: "ChessMaster",
      profilePicture: DRAGON_EGG_IMAGE,
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
    setGeneratedDragon(null);
    setGeneratedTeenageDragon(null);
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

  const saveGeneratedDragon = useCallback(async (dragonUrl: string) => {
    setGeneratedDragon(dragonUrl);
    await AsyncStorage.setItem(GENERATED_DRAGON_KEY, dragonUrl);
  }, []);

  const clearGeneratedDragon = useCallback(async () => {
    setGeneratedDragon(null);
    await AsyncStorage.removeItem(GENERATED_DRAGON_KEY);
  }, []);

  const saveGeneratedTeenageDragon = useCallback(async (dragonUrl: string) => {
    setGeneratedTeenageDragon(dragonUrl);
    await AsyncStorage.setItem(GENERATED_TEENAGE_DRAGON_KEY, dragonUrl);
  }, []);

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
    generatedDragon,
    generatedTeenageDragon,
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
    saveGeneratedDragon,
    clearGeneratedDragon,
    saveGeneratedTeenageDragon,
    enterCustomChallengeMatchmaking,
    exitCustomChallengeMatchmaking,
    triggerRewardCheck,
    t,
  };
});
