export type BetAmount = 5 | 10 | 25 | 50 | 500 | 750 | 1000 | 2500 | 5000 | 10000;

export type BoardTheme = "purple" | "classic" | "eco" | "retro";
export type PieceStyle = "classic" | "unity";

export interface GameSettings {
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  soundEffects: boolean;
  vibration: boolean;
  autoQueen: boolean;
  showLegalMoves: boolean;
  confirmMoves: boolean;
}

export interface User {
  id: string;
  username: string;
  profilePicture: string;
  email: string;
  country: string;
  language: string;
  walletBalance: number;
  eloRating: number;
  totalWins: number;
  totalLosses: number;
  totalCheckmates: number;
  totalEarnings: number;
  totalPoints: number;
  countryRank: number;
  worldRank: number;
  currentWinStreak: number;
  totalGamesPlayed: number;
  gameSettings: GameSettings;
  unlockedAvatars: string[];
}

export interface Challenge {
  id: string;
  challenger: {
    id: string;
    username: string;
    rating: number;
  };
  betAmount: BetAmount;
  createdAt: Date;
  scheduledTime: Date;
  gameClock: number;
  accepted?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  wins: number;
  losses: number;
  earnings: number;
  rating: number;
  points: number;
  country: string;
}

export interface GameState {
  betAmount: BetAmount | null;
  opponentName: string;
  timeRemaining: number;
  isActive: boolean;
}

export interface HouseChallenge {
  id: string;
  name: string;
  description: string;
  tctAmount: number;
  gameClock: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  objective: {
    type: "checkmate_in_moves" | "checkmate_with_piece" | "sacrifice_queen";
    value: string | number;
  };
}

export type TransactionType = "deposit" | "withdrawal" | "stake_won" | "stake_lost";

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  tctAmount: number;
  timestamp: Date;
  method?: string;
  status: "completed" | "pending" | "failed";
  description?: string;
}

// Re-export livestream types
export * from "./livestream";

// Re-export house challenge types
export * from "./houseChallenge";
