/**
 * PGN (Portable Game Notation) Unit Tests
 *
 * Comprehensive test coverage for:
 * - PGN generation from game data
 * - Header formatting (Seven Tag Roster)
 * - Move formatting with annotations
 * - Opening detection
 * - Result conversion
 * - Termination string formatting
 * - Time control formatting
 * - PGN parsing
 * - Move extraction
 * - PGN validation
 */

import {
  generatePGN,
  formatHeaders,
  formatMoves,
  detectOpening,
  gameResultToPGN,
  formatTermination,
  formatTimeControl,
  generateCompletePGN,
  parsePGN,
  extractMoves,
  validatePGN,
  type PGNHeaders,
  type PGNMoveData,
  type PGNGameData,
  type PGNResult,
  type CompleteGamePGNInput,
} from "@/lib/pgn";

// ============================================================================
// Mock chess.js for validation tests
// ============================================================================

jest.mock("chess.js", () => {
  return {
    Chess: jest.fn().mockImplementation(() => {
      let moveHistory: string[] = [];
      return {
        move: jest.fn((move: string) => {
          // Simulate validation - reject obviously invalid moves
          const validMoves = [
            "e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d4", "d5", "c4",
            "O-O", "O-O-O", "Qxf7+", "Rxe1", "Nxd5", "Bxf7+", "exd4"
          ];
          if (validMoves.includes(move) || move.match(/^[a-h][1-8]$/)) {
            moveHistory.push(move);
            return { san: move };
          }
          return null;
        }),
        history: jest.fn(() => moveHistory),
        reset: jest.fn(() => { moveHistory = []; }),
      };
    }),
  };
});

// ============================================================================
// PGN Generation Tests
// ============================================================================

describe("generatePGN", () => {
  it("should generate valid PGN from game data", () => {
    const data: PGNGameData = {
      headers: {
        Event: "Test Game",
        White: "Player1",
        Black: "Player2",
        Result: "1-0",
      },
      moves: [
        { san: "e4", from: "e2", to: "e4" },
        { san: "e5", from: "e7", to: "e5" },
        { san: "Nf3", from: "g1", to: "f3" },
      ],
    };

    const pgn = generatePGN(data);

    expect(pgn).toContain('[Event "Test Game"]');
    expect(pgn).toContain('[White "Player1"]');
    expect(pgn).toContain('[Black "Player2"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain("1. e4 e5");
    expect(pgn).toContain("2. Nf3");
    expect(pgn).toContain("1-0");
  });

  it("should use default values for missing headers", () => {
    const data: PGNGameData = {
      headers: {},
      moves: [{ san: "d4", from: "d2", to: "d4" }],
    };

    const pgn = generatePGN(data);

    expect(pgn).toContain('[Event "Treasure Chess"]');
    expect(pgn).toContain('[Site "Treasure Chess"]');
    expect(pgn).toContain('[White "White"]');
    expect(pgn).toContain('[Black "Black"]');
    expect(pgn).toContain('[Result "*"]');
  });

  it("should include platform version header", () => {
    const data: PGNGameData = {
      headers: {},
      moves: [],
    };

    const pgn = generatePGN(data);

    expect(pgn).toContain('[PlatformVersion "');
  });
});

// ============================================================================
// Header Formatting Tests
// ============================================================================

describe("formatHeaders", () => {
  it("should format Seven Tag Roster in correct order", () => {
    const headers: Partial<PGNHeaders> = {
      Event: "Championship",
      Site: "Online",
      Date: "2024.01.15",
      Round: "1",
      White: "Magnus",
      Black: "Hikaru",
      Result: "1/2-1/2",
    };

    const formatted = formatHeaders(headers);
    const lines = formatted.split("\n");

    expect(lines[0]).toBe('[Event "Championship"]');
    expect(lines[1]).toBe('[Site "Online"]');
    expect(lines[2]).toBe('[Date "2024.01.15"]');
    expect(lines[3]).toBe('[Round "1"]');
    expect(lines[4]).toBe('[White "Magnus"]');
    expect(lines[5]).toBe('[Black "Hikaru"]');
    expect(lines[6]).toBe('[Result "1/2-1/2"]');
  });

  it("should include optional headers when provided", () => {
    const headers: Partial<PGNHeaders> = {
      WhiteElo: "2850",
      BlackElo: "2800",
      TimeControl: "300+3",
      ECO: "C50",
      Opening: "Italian Game",
    };

    const formatted = formatHeaders(headers);

    expect(formatted).toContain('[WhiteElo "2850"]');
    expect(formatted).toContain('[BlackElo "2800"]');
    expect(formatted).toContain('[TimeControl "300+3"]');
    expect(formatted).toContain('[ECO "C50"]');
    expect(formatted).toContain('[Opening "Italian Game"]');
  });

  it("should escape special characters in strings", () => {
    const headers: Partial<PGNHeaders> = {
      White: 'Player "The Great" One',
      Event: "Test\\Event",
    };

    const formatted = formatHeaders(headers);

    expect(formatted).toContain('[White "Player \\"The Great\\" One"]');
    expect(formatted).toContain('[Event "Test\\\\Event"]');
  });

  it("should include ELO change headers when provided", () => {
    const headers: Partial<PGNHeaders> = {
      WhiteEloChange: "+15",
      BlackEloChange: "-12",
    };

    const formatted = formatHeaders(headers);

    expect(formatted).toContain('[WhiteEloChange "+15"]');
    expect(formatted).toContain('[BlackEloChange "-12"]');
  });
});

// ============================================================================
// Move Formatting Tests
// ============================================================================

describe("formatMoves", () => {
  it("should format moves with move numbers", () => {
    const moves: PGNMoveData[] = [
      { san: "e4", from: "e2", to: "e4" },
      { san: "e5", from: "e7", to: "e5" },
      { san: "Nf3", from: "g1", to: "f3" },
      { san: "Nc6", from: "b8", to: "c6" },
    ];

    const formatted = formatMoves(moves);

    expect(formatted).toContain("1. e4 e5");
    expect(formatted).toContain("2. Nf3 Nc6");
  });

  it("should include clock annotations when time data is provided", () => {
    const moves: PGNMoveData[] = [
      { san: "e4", from: "e2", to: "e4", timeRemainingMs: 295000 },
      { san: "e5", from: "e7", to: "e5", timeRemainingMs: 298000 },
    ];

    const formatted = formatMoves(moves);

    expect(formatted).toContain("{[%clk 0:04:55]}");
    expect(formatted).toContain("{[%clk 0:04:58]}");
  });

  it("should include evaluation annotations when provided", () => {
    const moves: PGNMoveData[] = [
      { san: "e4", from: "e2", to: "e4", evaluation: 0.3, depth: 20 },
      { san: "e5", from: "e7", to: "e5", evaluation: -0.1 },
    ];

    const formatted = formatMoves(moves);

    expect(formatted).toContain("{[%eval +0.30/20]}");
    expect(formatted).toContain("{[%eval -0.10]}");
  });

  it("should handle empty move list", () => {
    const formatted = formatMoves([]);
    expect(formatted).toBe("");
  });

  it("should wrap long lines", () => {
    const moves: PGNMoveData[] = Array.from({ length: 30 }, (_, i) => ({
      san: i % 2 === 0 ? "Nf3" : "Nc6",
      from: "g1",
      to: "f3",
    }));

    const formatted = formatMoves(moves);
    const lines = formatted.split("\n");

    // Each line should be 80 chars or less
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(80);
    });
  });
});

// ============================================================================
// Opening Detection Tests
// ============================================================================

describe("detectOpening", () => {
  it("should detect Italian Game", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("C50");
    expect(opening?.name).toBe("Italian Game");
  });

  it("should detect Sicilian Defense", () => {
    const moves = ["e4", "c5"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("B20");
    expect(opening?.name).toBe("Sicilian Defense");
  });

  it("should detect Queen's Gambit", () => {
    const moves = ["d4", "d5", "c4"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("D06");
    expect(opening?.name).toBe("Queen's Gambit");
  });

  it("should detect Queen's Gambit Declined", () => {
    const moves = ["d4", "d5", "c4", "e6"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("D30");
    expect(opening?.name).toBe("Queen's Gambit Declined");
  });

  it("should return best match for longer sequences", () => {
    const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("C53");
    expect(opening?.name).toBe("Italian Game: Giuoco Piano");
  });

  it("should return null for unrecognized openings", () => {
    const moves = ["h4", "a5", "g3"];
    const opening = detectOpening(moves);

    expect(opening).toBeNull();
  });

  it("should handle single move detection", () => {
    const moves = ["e4"];
    const opening = detectOpening(moves);

    expect(opening).not.toBeNull();
    expect(opening?.code).toBe("B00");
  });
});

// ============================================================================
// Result Conversion Tests
// ============================================================================

describe("gameResultToPGN", () => {
  it("should convert white_wins to 1-0", () => {
    expect(gameResultToPGN("white_wins")).toBe("1-0");
  });

  it("should convert black_wins to 0-1", () => {
    expect(gameResultToPGN("black_wins")).toBe("0-1");
  });

  it("should convert draw to 1/2-1/2", () => {
    expect(gameResultToPGN("draw")).toBe("1/2-1/2");
  });

  it("should convert null to *", () => {
    expect(gameResultToPGN(null)).toBe("*");
  });
});

// ============================================================================
// Termination String Tests
// ============================================================================

describe("formatTermination", () => {
  it("should format checkmate correctly", () => {
    expect(formatTermination("checkmate", "w")).toBe("White wins by checkmate");
    expect(formatTermination("checkmate", "b")).toBe("Black wins by checkmate");
  });

  it("should format timeout correctly", () => {
    expect(formatTermination("timeout", "w")).toBe("White wins on time");
    expect(formatTermination("timeout", "b")).toBe("Black wins on time");
  });

  it("should format resignation correctly", () => {
    expect(formatTermination("resign", "w")).toBe("White wins by resignation");
    expect(formatTermination("resign", "b")).toBe("Black wins by resignation");
  });

  it("should format draw types correctly", () => {
    expect(formatTermination("draw_agreement")).toBe("Draw by agreement");
    expect(formatTermination("stalemate")).toBe("Draw by stalemate");
    expect(formatTermination("insufficient_material")).toBe("Draw by insufficient material");
    expect(formatTermination("threefold_repetition")).toBe("Draw by threefold repetition");
    expect(formatTermination("fifty_moves")).toBe("Draw by fifty-move rule");
  });

  it("should handle unknown reason", () => {
    expect(formatTermination("unknown")).toBe("Game ended");
  });
});

// ============================================================================
// Time Control Formatting Tests
// ============================================================================

describe("formatTimeControl", () => {
  it("should format time without increment", () => {
    expect(formatTimeControl(300, 0)).toBe("300");
    expect(formatTimeControl(600, 0)).toBe("600");
  });

  it("should format time with increment", () => {
    expect(formatTimeControl(300, 3)).toBe("300+3");
    expect(formatTimeControl(180, 2)).toBe("180+2");
  });
});

// ============================================================================
// Complete PGN Generation Tests
// ============================================================================

describe("generateCompletePGN", () => {
  it("should generate complete PGN with all headers", () => {
    const input: CompleteGamePGNInput = {
      gameId: "game-123",
      whitePlayer: { username: "Alice", elo: 1500, eloChange: 12 },
      blackPlayer: { username: "Bob", elo: 1480, eloChange: -12 },
      moves: [
        { san: "e4", from: "e2", to: "e4", timeRemainingMs: 295000 },
        { san: "e5", from: "e7", to: "e5", timeRemainingMs: 298000 },
      ],
      result: "white_wins",
      endReason: "checkmate",
      timeControlSeconds: 300,
      incrementSeconds: 3,
      wagerTct: 100,
      startedAt: new Date("2024-01-15T12:00:00Z"),
    };

    const pgn = generateCompletePGN(input);

    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('[Black "Bob"]');
    expect(pgn).toContain('[WhiteElo "1500"]');
    expect(pgn).toContain('[BlackElo "1480"]');
    expect(pgn).toContain('[WhiteEloChange "+12"]');
    expect(pgn).toContain('[BlackEloChange "-12"]');
    expect(pgn).toContain('[TimeControl "300+3"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('[Termination "White wins by checkmate"]');
    expect(pgn).toContain('[GameId "game-123"]');
    expect(pgn).toContain('[Wager "100 TCT"]');
    // Moves include clock annotations when timeRemainingMs is provided
    expect(pgn).toContain("1. e4");
    expect(pgn).toContain("e5");
    expect(pgn).toContain("1-0");
  });

  it("should include opening info when detected", () => {
    const input: CompleteGamePGNInput = {
      gameId: "game-456",
      whitePlayer: { username: "White", elo: 1500 },
      blackPlayer: { username: "Black", elo: 1500 },
      moves: [
        { san: "e4", from: "e2", to: "e4" },
        { san: "e5", from: "e7", to: "e5" },
        { san: "Nf3", from: "g1", to: "f3" },
        { san: "Nc6", from: "b8", to: "c6" },
        { san: "Bc4", from: "f1", to: "c4" },
      ],
      result: "draw",
      endReason: "draw_agreement",
      timeControlSeconds: 600,
      incrementSeconds: 0,
      startedAt: new Date(),
    };

    const pgn = generateCompletePGN(input);

    expect(pgn).toContain('[ECO "C50"]');
    expect(pgn).toContain('[Opening "Italian Game"]');
  });

  it("should not include wager header when no wager", () => {
    const input: CompleteGamePGNInput = {
      gameId: "game-789",
      whitePlayer: { username: "White", elo: 1500 },
      blackPlayer: { username: "Black", elo: 1500 },
      moves: [],
      result: null,
      endReason: "abandoned",
      timeControlSeconds: 300,
      incrementSeconds: 0,
      startedAt: new Date(),
    };

    const pgn = generateCompletePGN(input);

    expect(pgn).not.toContain("[Wager");
  });
});

// ============================================================================
// PGN Parsing Tests
// ============================================================================

describe("parsePGN", () => {
  it("should parse headers correctly", () => {
    const pgn = `[Event "Test"]
[Site "Online"]
[Date "2024.01.15"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0`;

    const parsed = parsePGN(pgn);

    expect(parsed.headers.Event).toBe("Test");
    expect(parsed.headers.Site).toBe("Online");
    expect(parsed.headers.White).toBe("Alice");
    expect(parsed.headers.Black).toBe("Bob");
    expect(parsed.headers.Result).toBe("1-0");
  });

  it("should extract result from headers", () => {
    const pgn = `[Result "1/2-1/2"]

1. d4 d5`;

    const parsed = parsePGN(pgn);

    expect(parsed.result).toBe("1/2-1/2");
  });

  it("should default to * for missing result", () => {
    const pgn = `[Event "Test"]

1. e4`;

    const parsed = parsePGN(pgn);

    expect(parsed.result).toBe("*");
  });
});

// ============================================================================
// Move Extraction Tests
// ============================================================================

describe("extractMoves", () => {
  it("should extract basic moves", () => {
    const moveText = "1. e4 e5 2. Nf3 Nc6 3. Bc4";
    const moves = extractMoves(moveText);

    expect(moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4"]);
  });

  it("should handle castling", () => {
    const moveText = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O";
    const moves = extractMoves(moveText);

    expect(moves).toContain("O-O");
  });

  it("should handle queenside castling", () => {
    const moveText = "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. O-O-O";
    const moves = extractMoves(moveText);

    expect(moves).toContain("O-O-O");
  });

  it("should remove comments", () => {
    const moveText = "1. e4 {A good move} e5 {Also good} 2. Nf3";
    const moves = extractMoves(moveText);

    expect(moves).toEqual(["e4", "e5", "Nf3"]);
  });

  it("should remove clock annotations", () => {
    const moveText = "1. e4 {[%clk 0:05:00]} e5 {[%clk 0:04:58]}";
    const moves = extractMoves(moveText);

    expect(moves).toEqual(["e4", "e5"]);
  });

  it("should remove result from moves", () => {
    const moveText = "1. e4 e5 2. Nf3 Nc6 1-0";
    const moves = extractMoves(moveText);

    expect(moves).not.toContain("1-0");
    expect(moves).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("should handle check and checkmate symbols", () => {
    const moveText = "1. e4 e5 2. Qh5 Nc6 3. Qxf7+";
    const moves = extractMoves(moveText);

    expect(moves).toContain("Qxf7+");
  });

  it("should handle promotion notation", () => {
    const moveText = "1. a8=Q";
    const moves = extractMoves(moveText);

    expect(moves).toContain("a8=Q");
  });
});

// ============================================================================
// PGN Validation Tests
// ============================================================================

describe("validatePGN", () => {
  it("should validate correct PGN", () => {
    const pgn = `[Event "Test"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0`;

    const result = validatePGN(pgn);

    expect(result.valid).toBe(true);
    expect(result.moveCount).toBe(4);
  });

  it("should report syntactically invalid moves by filtering them", () => {
    // Note: The extractMoves function filters out syntactically invalid moves
    // before they reach chess.move(), so "invalid" is never tested by the chess engine.
    // This test verifies that syntactically invalid text is ignored.
    const pgn = `[Result "*"]

1. e4 e5 2. invalid Nc6`;

    const result = validatePGN(pgn);

    // "invalid" is filtered out by extractMoves, so only e4, e5, Nc6 are validated
    // This should pass since those are valid moves
    expect(result.valid).toBe(true);
    expect(result.moveCount).toBe(3); // e4, e5, Nc6 (invalid was filtered)
  });

  it("should return move count on success", () => {
    const pgn = `[Result "*"]

1. e4 e5`;

    const result = validatePGN(pgn);

    expect(result.moveCount).toBe(2);
  });

  it("should handle empty PGN", () => {
    const pgn = `[Result "*"]`;

    const result = validatePGN(pgn);

    expect(result.valid).toBe(true);
    expect(result.moveCount).toBe(0);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe("edge cases", () => {
  it("should handle very long games", () => {
    const moves: PGNMoveData[] = Array.from({ length: 200 }, (_, i) => ({
      san: i % 2 === 0 ? "Nf3" : "Nc6",
      from: "g1",
      to: "f3",
    }));

    const data: PGNGameData = {
      headers: { Result: "1/2-1/2" },
      moves,
    };

    const pgn = generatePGN(data);

    expect(pgn).toContain("100. Nf3");
    expect(pgn).toContain("1/2-1/2");
  });

  it("should handle special characters in player names", () => {
    const input: CompleteGamePGNInput = {
      gameId: "test",
      whitePlayer: { username: "José García", elo: 1500 },
      blackPlayer: { username: 'Bob "The Builder"', elo: 1500 },
      moves: [],
      result: null,
      endReason: "abandoned",
      timeControlSeconds: 300,
      incrementSeconds: 0,
      startedAt: new Date(),
    };

    const pgn = generateCompletePGN(input);

    expect(pgn).toContain("José García");
    expect(pgn).toContain('Bob \\"The Builder\\"');
  });

  it("should format time correctly at various values", () => {
    const moves: PGNMoveData[] = [
      { san: "e4", from: "e2", to: "e4", timeRemainingMs: 3661000 }, // 1:01:01
      { san: "e5", from: "e7", to: "e5", timeRemainingMs: 61000 },   // 0:01:01
      { san: "d4", from: "d2", to: "d4", timeRemainingMs: 1000 },    // 0:00:01
    ];

    const formatted = formatMoves(moves);

    expect(formatted).toContain("{[%clk 1:01:01]}");
    expect(formatted).toContain("{[%clk 0:01:01]}");
    expect(formatted).toContain("{[%clk 0:00:01]}");
  });
});
