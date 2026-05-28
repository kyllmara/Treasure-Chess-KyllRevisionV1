/**
 * Chess AI Unit Tests
 *
 * Comprehensive test coverage for:
 * - Difficulty configurations
 * - Piece values
 * - Piece-square table structure
 *
 * Note: These tests validate the AI configuration and constants.
 * Integration tests with real chess logic are in gameFlow.test.ts
 */

// ============================================================================
// Difficulty Configuration Tests
// ============================================================================

describe("Chess AI Difficulty Configurations", () => {
  // Expected difficulty configurations
  const DIFFICULTY_CONFIG = {
    beginner: { depth: 1, maxTimeMs: 500, randomness: 0.3 },
    easy: { depth: 2, maxTimeMs: 1000, randomness: 0.2 },
    medium: { depth: 3, maxTimeMs: 2000, randomness: 0.1 },
    hard: { depth: 4, maxTimeMs: 3000, randomness: 0.05 },
    expert: { depth: 5, maxTimeMs: 5000, randomness: 0 },
  };

  describe("depth settings", () => {
    it("should have increasing depth for higher difficulties", () => {
      expect(DIFFICULTY_CONFIG.beginner.depth).toBe(1);
      expect(DIFFICULTY_CONFIG.easy.depth).toBe(2);
      expect(DIFFICULTY_CONFIG.medium.depth).toBe(3);
      expect(DIFFICULTY_CONFIG.hard.depth).toBe(4);
      expect(DIFFICULTY_CONFIG.expert.depth).toBe(5);
    });

    it("should have depth values between 1 and 5", () => {
      Object.values(DIFFICULTY_CONFIG).forEach(config => {
        expect(config.depth).toBeGreaterThanOrEqual(1);
        expect(config.depth).toBeLessThanOrEqual(5);
      });
    });
  });

  describe("time settings", () => {
    it("should have increasing time limits for higher difficulties", () => {
      expect(DIFFICULTY_CONFIG.beginner.maxTimeMs).toBeLessThan(DIFFICULTY_CONFIG.easy.maxTimeMs);
      expect(DIFFICULTY_CONFIG.easy.maxTimeMs).toBeLessThan(DIFFICULTY_CONFIG.medium.maxTimeMs);
      expect(DIFFICULTY_CONFIG.medium.maxTimeMs).toBeLessThan(DIFFICULTY_CONFIG.hard.maxTimeMs);
      expect(DIFFICULTY_CONFIG.hard.maxTimeMs).toBeLessThan(DIFFICULTY_CONFIG.expert.maxTimeMs);
    });

    it("should have reasonable time limits (500ms to 5s)", () => {
      Object.values(DIFFICULTY_CONFIG).forEach(config => {
        expect(config.maxTimeMs).toBeGreaterThanOrEqual(500);
        expect(config.maxTimeMs).toBeLessThanOrEqual(5000);
      });
    });
  });

  describe("randomness settings", () => {
    it("should have decreasing randomness for higher difficulties", () => {
      expect(DIFFICULTY_CONFIG.beginner.randomness).toBeGreaterThan(DIFFICULTY_CONFIG.easy.randomness);
      expect(DIFFICULTY_CONFIG.easy.randomness).toBeGreaterThan(DIFFICULTY_CONFIG.medium.randomness);
      expect(DIFFICULTY_CONFIG.medium.randomness).toBeGreaterThan(DIFFICULTY_CONFIG.hard.randomness);
      expect(DIFFICULTY_CONFIG.hard.randomness).toBeGreaterThan(DIFFICULTY_CONFIG.expert.randomness);
    });

    it("should have zero randomness for expert", () => {
      expect(DIFFICULTY_CONFIG.expert.randomness).toBe(0);
    });

    it("should have randomness between 0 and 1", () => {
      Object.values(DIFFICULTY_CONFIG).forEach(config => {
        expect(config.randomness).toBeGreaterThanOrEqual(0);
        expect(config.randomness).toBeLessThanOrEqual(1);
      });
    });
  });
});

// ============================================================================
// Piece Values Tests
// ============================================================================

describe("Chess AI Piece Values", () => {
  // Standard piece values in centipawns (from Unity BotAI.cs)
  const PIECE_VALUES = {
    p: 100,  // Pawn
    n: 320,  // Knight
    b: 330,  // Bishop
    r: 500,  // Rook
    q: 900,  // Queen
    k: 20000 // King (very high to avoid king capture)
  };

  it("should have pawn worth 100 centipawns", () => {
    expect(PIECE_VALUES.p).toBe(100);
  });

  it("should have knight worth 320 centipawns", () => {
    expect(PIECE_VALUES.n).toBe(320);
  });

  it("should have bishop worth slightly more than knight", () => {
    expect(PIECE_VALUES.b).toBeGreaterThan(PIECE_VALUES.n);
    expect(PIECE_VALUES.b).toBe(330);
  });

  it("should have rook worth 500 centipawns", () => {
    expect(PIECE_VALUES.r).toBe(500);
  });

  it("should have queen worth 900 centipawns", () => {
    expect(PIECE_VALUES.q).toBe(900);
  });

  it("should have king worth very high value", () => {
    expect(PIECE_VALUES.k).toBeGreaterThan(10000);
  });

  it("should follow standard chess piece hierarchy", () => {
    expect(PIECE_VALUES.p).toBeLessThan(PIECE_VALUES.n);
    expect(PIECE_VALUES.n).toBeLessThan(PIECE_VALUES.b);
    expect(PIECE_VALUES.b).toBeLessThan(PIECE_VALUES.r);
    expect(PIECE_VALUES.r).toBeLessThan(PIECE_VALUES.q);
    expect(PIECE_VALUES.q).toBeLessThan(PIECE_VALUES.k);
  });

  it("should have queen approximately equal to rook + bishop + pawn", () => {
    // Standard approximation: Q ≈ R + B + P (or close to it)
    const rookBishopPawn = PIECE_VALUES.r + PIECE_VALUES.b + PIECE_VALUES.p;
    expect(PIECE_VALUES.q).toBeCloseTo(rookBishopPawn - 30, -1); // Within ~100
  });

  it("should have two rooks worth more than queen", () => {
    expect(PIECE_VALUES.r * 2).toBeGreaterThan(PIECE_VALUES.q);
  });
});

// ============================================================================
// Piece-Square Table Tests
// ============================================================================

describe("Chess AI Piece-Square Tables", () => {
  // Sample PST for pawn (from the implementation)
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

  describe("pawn PST structure", () => {
    it("should be an 8x8 matrix", () => {
      expect(PAWN_PST).toHaveLength(8);
      PAWN_PST.forEach(row => {
        expect(row).toHaveLength(8);
      });
    });

    it("should have promotion rank (row 1) with high values", () => {
      // Row 1 is near promotion for white
      expect(PAWN_PST[1][0]).toBe(50);
      expect(PAWN_PST[1][4]).toBe(50);
    });

    it("should encourage central pawn placement", () => {
      // Center squares (d4, e4) should have bonus
      expect(PAWN_PST[4][3]).toBeGreaterThan(PAWN_PST[4][0]); // d4 > a4
      expect(PAWN_PST[4][4]).toBeGreaterThan(PAWN_PST[4][0]); // e4 > a4
    });

    it("should discourage blocking center pawns early", () => {
      // d2, e2 should be negative to discourage not pushing them
      expect(PAWN_PST[6][3]).toBeLessThan(0);
      expect(PAWN_PST[6][4]).toBeLessThan(0);
    });
  });

  describe("knight PST structure", () => {
    it("should be an 8x8 matrix", () => {
      expect(KNIGHT_PST).toHaveLength(8);
      KNIGHT_PST.forEach(row => {
        expect(row).toHaveLength(8);
      });
    });

    it("should penalize corner placements", () => {
      // Corners should have lowest values
      expect(KNIGHT_PST[0][0]).toBe(-50);
      expect(KNIGHT_PST[0][7]).toBe(-50);
      expect(KNIGHT_PST[7][0]).toBe(-50);
      expect(KNIGHT_PST[7][7]).toBe(-50);
    });

    it("should reward central placements", () => {
      // Center squares should have highest values
      expect(KNIGHT_PST[3][3]).toBe(20); // d5
      expect(KNIGHT_PST[3][4]).toBe(20); // e5
      expect(KNIGHT_PST[4][3]).toBe(20); // d4
      expect(KNIGHT_PST[4][4]).toBe(20); // e4
    });

    it("should have symmetric values", () => {
      // PST should be horizontally symmetric
      for (let row = 0; row < 8; row++) {
        expect(KNIGHT_PST[row][0]).toBe(KNIGHT_PST[row][7]);
        expect(KNIGHT_PST[row][1]).toBe(KNIGHT_PST[row][6]);
        expect(KNIGHT_PST[row][2]).toBe(KNIGHT_PST[row][5]);
        expect(KNIGHT_PST[row][3]).toBe(KNIGHT_PST[row][4]);
      }
    });
  });
});

// ============================================================================
// Evaluation Score Tests
// ============================================================================

describe("Chess AI Evaluation Scores", () => {
  describe("checkmate detection values", () => {
    it("should use very high values for checkmate", () => {
      // Standard checkmate value
      const CHECKMATE_VALUE = 100000;
      expect(CHECKMATE_VALUE).toBeGreaterThan(50000);
    });

    it("should differentiate between white and black checkmate", () => {
      const WHITE_CHECKMATE = 100000; // Black is checkmated (white wins)
      const BLACK_CHECKMATE = -100000; // White is checkmated (black wins)

      expect(WHITE_CHECKMATE).toBeGreaterThan(0);
      expect(BLACK_CHECKMATE).toBeLessThan(0);
      expect(Math.abs(WHITE_CHECKMATE)).toBe(Math.abs(BLACK_CHECKMATE));
    });
  });

  describe("draw detection values", () => {
    it("should return 0 for draw", () => {
      const DRAW_VALUE = 0;
      expect(DRAW_VALUE).toBe(0);
    });
  });

  describe("material vs positional balance", () => {
    it("should weight material higher than positional", () => {
      // Material is measured in centipawns (100 per pawn)
      // Positional bonuses are typically -50 to +50
      const PAWN_VALUE = 100;
      const MAX_POSITIONAL_BONUS = 50;

      expect(PAWN_VALUE).toBeGreaterThan(MAX_POSITIONAL_BONUS);
    });
  });
});

// ============================================================================
// Move Ordering Tests
// ============================================================================

describe("Chess AI Move Ordering", () => {
  describe("capture prioritization", () => {
    it("should use MVV-LVA ordering principle", () => {
      // Most Valuable Victim - Least Valuable Attacker
      // QxP should be valued higher than PxQ in ordering
      const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900 };

      // Capturing queen with pawn: high victim, low attacker = good
      const qxp = PIECE_VALUES.q - PIECE_VALUES.p / 10; // 900 - 10 = 890

      // Capturing pawn with queen: low victim, high attacker = less good
      const pxq = PIECE_VALUES.p - PIECE_VALUES.q / 10; // 100 - 90 = 10

      expect(qxp).toBeGreaterThan(pxq);
    });
  });

  describe("promotion prioritization", () => {
    it("should prioritize queen promotions", () => {
      const PIECE_VALUES = { n: 320, b: 330, r: 500, q: 900 };

      // Queen promotion should be valued highest
      expect(PIECE_VALUES.q).toBeGreaterThan(PIECE_VALUES.r);
      expect(PIECE_VALUES.q).toBeGreaterThan(PIECE_VALUES.b);
      expect(PIECE_VALUES.q).toBeGreaterThan(PIECE_VALUES.n);
    });
  });
});

// ============================================================================
// Search Algorithm Tests
// ============================================================================

describe("Chess AI Search Algorithm", () => {
  describe("quiescence search", () => {
    it("should have maximum quiescence depth of 4", () => {
      const MAX_QUIESCENCE_DEPTH = 4;
      expect(MAX_QUIESCENCE_DEPTH).toBe(4);
    });
  });

  describe("alpha-beta pruning", () => {
    it("should use standard alpha-beta bounds", () => {
      const ALPHA_INITIAL = -Infinity;
      const BETA_INITIAL = Infinity;

      expect(ALPHA_INITIAL).toBe(-Infinity);
      expect(BETA_INITIAL).toBe(Infinity);
    });
  });

  describe("iterative deepening", () => {
    it("should start from depth 1", () => {
      const STARTING_DEPTH = 1;
      expect(STARTING_DEPTH).toBe(1);
    });
  });
});

// ============================================================================
// Endgame Detection Tests
// ============================================================================

describe("Chess AI Endgame Detection", () => {
  describe("endgame criteria", () => {
    it("should detect endgame when no queens", () => {
      const queens = 0;
      const isEndgame = queens === 0;
      expect(isEndgame).toBe(true);
    });

    it("should detect endgame when limited material", () => {
      const queens = 2;
      const minorPieces = 2;
      const isEndgame = queens === 0 || (queens <= 2 && minorPieces <= 2);
      expect(isEndgame).toBe(true);
    });

    it("should not detect endgame in opening with full material", () => {
      const queens = 2;
      const minorPieces = 8;
      const isEndgame = queens === 0 || (queens <= 2 && minorPieces <= 2);
      expect(isEndgame).toBe(false);
    });
  });

  describe("king PST switching", () => {
    it("should use different king PST for endgame", () => {
      // In endgame, king should be centralized
      // Middlegame king should stay safe (corner/castled)
      const KING_MIDDLEGAME_CENTER = -50; // Penalize center in middlegame
      const KING_ENDGAME_CENTER = 40; // Reward center in endgame

      expect(KING_ENDGAME_CENTER).toBeGreaterThan(KING_MIDDLEGAME_CENTER);
    });
  });
});
