import { Chess, Move, PieceSymbol, Color } from "chess.js";
import { InteractionManager } from "react-native";

export type Difficulty = "beginner" | "easy" | "medium" | "hard" | "expert";

interface DifficultyConfig {
  depth: number;
  maxTimeMs: number;
  randomness: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  beginner: { depth: 1, maxTimeMs: 500, randomness: 0.3 },
  easy: { depth: 2, maxTimeMs: 1000, randomness: 0.2 },
  medium: { depth: 3, maxTimeMs: 2000, randomness: 0.1 },
  hard: { depth: 4, maxTimeMs: 3000, randomness: 0.05 },
  expert: { depth: 5, maxTimeMs: 5000, randomness: 0 },
};

// Piece values (centipawns) - from Unity BotAI.cs
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-Square Tables (from white's perspective, flip for black)
// Values are in centipawns, positive = good square for that piece

const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_MIDDLEGAME_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const KING_ENDGAME_PST = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

const PST: Record<PieceSymbol, number[][]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_MIDDLEGAME_PST,
};

// Yield control back to the UI thread
const yieldToUI = (): Promise<void> => {
  return new Promise((resolve) => {
    // Use setImmediate if available (React Native), otherwise setTimeout
    if (typeof setImmediate !== "undefined") {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
};

// Wait for any pending interactions to complete
const waitForInteractions = (): Promise<void> => {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
};

export class ChessAI {
  private nodesSearched: number = 0;
  private searchStartTime: number = 0;
  private maxSearchTime: number = 0;
  private shouldAbort: boolean = false;

  private isEndgame(game: Chess): boolean {
    const board = game.board();
    let queens = 0;
    let minorPieces = 0;

    for (const row of board) {
      for (const square of row) {
        if (square) {
          if (square.type === "q") queens++;
          if (square.type === "n" || square.type === "b") minorPieces++;
        }
      }
    }

    return queens === 0 || (queens <= 2 && minorPieces <= 2);
  }

  private isTimeUp(): boolean {
    return Date.now() - this.searchStartTime > this.maxSearchTime;
  }

  private getPieceSquareValue(
    piece: PieceSymbol,
    color: Color,
    row: number,
    col: number,
    isEndgame: boolean
  ): number {
    let table = PST[piece];
    if (piece === "k" && isEndgame) {
      table = KING_ENDGAME_PST;
    }

    // Flip row for black pieces
    const actualRow = color === "w" ? row : 7 - row;
    return table[actualRow][col];
  }

  evaluateMaterial(game: Chess): number {
    const board = game.board();
    let score = 0;

    for (const row of board) {
      for (const square of row) {
        if (square) {
          const value = PIECE_VALUES[square.type];
          score += square.color === "w" ? value : -value;
        }
      }
    }

    return score;
  }

  evaluatePosition(game: Chess): number {
    const board = game.board();
    const endgame = this.isEndgame(game);
    let score = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece) {
          const pstValue = this.getPieceSquareValue(
            piece.type,
            piece.color,
            row,
            col,
            endgame
          );
          score += piece.color === "w" ? pstValue : -pstValue;
        }
      }
    }

    return score;
  }

  evaluateBoard(game: Chess): number {
    // Check for game-ending positions
    if (game.isCheckmate()) {
      return game.turn() === "w" ? -100000 : 100000;
    }
    if (game.isDraw()) {
      return 0;
    }

    const material = this.evaluateMaterial(game);
    const positional = this.evaluatePosition(game);

    // Mobility bonus (simplified - expensive to calculate)
    const mobility = game.moves().length * 5;
    const mobilityBonus = game.turn() === "w" ? mobility : -mobility;

    return material + positional + mobilityBonus;
  }

  private orderMoves(game: Chess, moves: Move[]): Move[] {
    return moves.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Captures are prioritized by MVV-LVA
      if (a.captured) {
        scoreA += PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece] / 10;
      }
      if (b.captured) {
        scoreB += PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece] / 10;
      }

      // Promotions
      if (a.promotion) scoreA += PIECE_VALUES[a.promotion];
      if (b.promotion) scoreB += PIECE_VALUES[b.promotion];

      return scoreB - scoreA;
    });
  }

  private quiescence(
    game: Chess,
    alpha: number,
    beta: number,
    maximizing: boolean,
    depth: number = 0
  ): number {
    this.nodesSearched++;

    // Limit quiescence depth to prevent explosion
    if (depth > 4 || this.shouldAbort) {
      return this.evaluateBoard(game);
    }

    const standPat = this.evaluateBoard(game);

    if (maximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;
    }

    // Only consider captures
    const moves = game.moves({ verbose: true }).filter((m) => m.captured);
    if (moves.length === 0) return standPat;

    const orderedMoves = this.orderMoves(game, moves);

    for (const move of orderedMoves) {
      game.move(move);
      const score = this.quiescence(game, alpha, beta, !maximizing, depth + 1);
      game.undo();

      if (maximizing) {
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      } else {
        if (score < beta) beta = score;
        if (beta <= alpha) break;
      }
    }

    return maximizing ? alpha : beta;
  }

  private minimax(
    game: Chess,
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean
  ): number {
    this.nodesSearched++;

    if (this.shouldAbort) {
      return this.evaluateBoard(game);
    }

    if (depth === 0) {
      return this.quiescence(game, alpha, beta, maximizing);
    }

    if (game.isGameOver()) {
      return this.evaluateBoard(game);
    }

    const moves = game.moves({ verbose: true });
    const orderedMoves = this.orderMoves(game, moves);

    if (maximizing) {
      let maxEval = -Infinity;
      for (const move of orderedMoves) {
        game.move(move);
        const evaluation = this.minimax(game, depth - 1, alpha, beta, false);
        game.undo();
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const move of orderedMoves) {
        game.move(move);
        const evaluation = this.minimax(game, depth - 1, alpha, beta, true);
        game.undo();
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return minEval;
    }
  }

  /**
   * Search a single root move with yielding
   * Returns the score for this move
   */
  private async searchMoveAsync(
    game: Chess,
    move: Move,
    depth: number,
    isMaximizing: boolean
  ): Promise<number> {
    game.move(move);
    const score = this.minimax(game, depth - 1, -Infinity, Infinity, !isMaximizing);
    game.undo();
    return score;
  }

  /**
   * Iterative deepening search with yielding to keep UI responsive
   * - Searches depth 1, then 2, then 3... up to maxDepth
   * - Yields control after each root move evaluation
   * - Can abort early if time runs out (returns best found so far)
   */
  async getBestMove(
    fen: string,
    difficulty: Difficulty = "medium"
  ): Promise<Move | null> {
    const config = DIFFICULTY_CONFIG[difficulty];
    const game = new Chess(fen);

    if (game.isGameOver()) {
      return null;
    }

    // Wait for any pending animations/interactions
    await waitForInteractions();

    this.searchStartTime = Date.now();
    this.maxSearchTime = config.maxTimeMs;
    this.nodesSearched = 0;
    this.shouldAbort = false;

    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0]; // Only one legal move

    const isMaximizing = game.turn() === "w";
    let bestMove: Move | null = moves[0]; // Default to first move
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let completedDepth = 0;

    // Order moves initially (will be reordered based on previous iteration)
    let orderedMoves = this.orderMoves(game, [...moves]);
    let moveScores: Map<string, number> = new Map();

    // Iterative deepening: search depth 1, then 2, then 3...
    for (let depth = 1; depth <= config.depth; depth++) {
      if (this.isTimeUp()) {
        console.log(`AI: Time up at depth ${depth - 1}`);
        break;
      }

      let currentBestMove: Move | null = null;
      let currentBestScore = isMaximizing ? -Infinity : Infinity;
      const currentMoveScores: Map<string, number> = new Map();

      // Evaluate each move at this depth
      for (let i = 0; i < orderedMoves.length; i++) {
        const move = orderedMoves[i];

        // Check time limit periodically
        if (i > 0 && i % 5 === 0 && this.isTimeUp()) {
          this.shouldAbort = true;
          break;
        }

        // Search this move
        const score = await this.searchMoveAsync(game, move, depth, isMaximizing);
        const moveKey = `${move.from}${move.to}${move.promotion || ""}`;
        currentMoveScores.set(moveKey, score);

        // Update best move for this depth
        if (isMaximizing) {
          if (score > currentBestScore) {
            currentBestScore = score;
            currentBestMove = move;
          }
        } else {
          if (score < currentBestScore) {
            currentBestScore = score;
            currentBestMove = move;
          }
        }

        // Yield to UI after each root move to keep responsive
        // Only yield every few moves at shallow depths to avoid overhead
        if (depth >= 3 || i % 3 === 0) {
          await yieldToUI();
        }
      }

      // If we completed this depth, update the best move
      if (!this.shouldAbort && currentBestMove) {
        bestMove = currentBestMove;
        bestScore = currentBestScore;
        moveScores = currentMoveScores;
        completedDepth = depth;

        // Reorder moves for next iteration (best moves first = better pruning)
        orderedMoves.sort((a, b) => {
          const keyA = `${a.from}${a.to}${a.promotion || ""}`;
          const keyB = `${b.from}${b.to}${b.promotion || ""}`;
          const scoreA = moveScores.get(keyA) ?? 0;
          const scoreB = moveScores.get(keyB) ?? 0;
          return isMaximizing ? scoreB - scoreA : scoreA - scoreB;
        });
      }

      // Found checkmate, no need to search deeper
      if (Math.abs(bestScore) > 90000) {
        break;
      }
    }

    // Add randomness for variety at lower difficulties
    if (config.randomness > 0 && moveScores.size > 1) {
      const scoredMoves = orderedMoves
        .map((move) => ({
          move,
          score: moveScores.get(`${move.from}${move.to}${move.promotion || ""}`) ?? 0,
        }))
        .sort((a, b) => (isMaximizing ? b.score - a.score : a.score - b.score));

      // Consider top moves within a threshold
      const threshold = Math.abs(bestScore) * config.randomness + 50;
      const topMoves = scoredMoves.filter(
        (ms) => Math.abs(ms.score - bestScore) <= threshold
      );

      if (topMoves.length > 1 && Math.random() < config.randomness * 2) {
        const randomIndex = Math.floor(Math.random() * Math.min(topMoves.length, 3));
        bestMove = topMoves[randomIndex].move;
      }
    }

    const elapsed = Date.now() - this.searchStartTime;
    console.log(
      `AI (${difficulty}): depth=${completedDepth}, nodes=${this.nodesSearched}, ` +
        `score=${bestScore}, time=${elapsed}ms`
    );

    return bestMove;
  }

  // Get a hint for the player (uses medium difficulty for speed)
  async getHint(fen: string): Promise<Move | null> {
    return this.getBestMove(fen, "medium");
  }

  // Cancel ongoing search (call from UI when needed)
  cancelSearch(): void {
    this.shouldAbort = true;
  }
}

// Singleton instance
export const chessAI = new ChessAI();
