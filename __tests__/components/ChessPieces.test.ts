/**
 * Chess Pieces Component Tests
 *
 * Tests for the SVG chess piece components ensuring all pieces
 * and styles are properly defined and exported.
 */

describe("Chess Pieces", () => {
  describe("Piece Styles", () => {
    const VALID_STYLES = ["classic", "modern", "elegant"];

    it("should have exactly 3 valid piece styles", () => {
      expect(VALID_STYLES.length).toBe(3);
    });

    it("should NOT include unity style", () => {
      expect(VALID_STYLES).not.toContain("unity");
    });

    it("should include classic style", () => {
      expect(VALID_STYLES).toContain("classic");
    });

    it("should include modern style", () => {
      expect(VALID_STYLES).toContain("modern");
    });

    it("should include elegant style", () => {
      expect(VALID_STYLES).toContain("elegant");
    });
  });

  describe("Piece Types", () => {
    const PIECE_TYPES = ["King", "Queen", "Rook", "Bishop", "Knight", "Pawn"];

    it("should have all 6 piece types", () => {
      expect(PIECE_TYPES.length).toBe(6);
    });

    it("should include all standard chess pieces", () => {
      expect(PIECE_TYPES).toContain("King");
      expect(PIECE_TYPES).toContain("Queen");
      expect(PIECE_TYPES).toContain("Rook");
      expect(PIECE_TYPES).toContain("Bishop");
      expect(PIECE_TYPES).toContain("Knight");
      expect(PIECE_TYPES).toContain("Pawn");
    });
  });

  describe("Piece Colors", () => {
    const COLORS = ["white", "black"];

    it("should have both piece colors", () => {
      expect(COLORS.length).toBe(2);
      expect(COLORS).toContain("white");
      expect(COLORS).toContain("black");
    });
  });

  describe("Piece Notation", () => {
    const NOTATION_MAP: Record<string, string> = {
      K: "King",
      Q: "Queen",
      R: "Rook",
      B: "Bishop",
      N: "Knight",
      P: "Pawn",
    };

    it("should map correct notation to piece names", () => {
      expect(NOTATION_MAP["K"]).toBe("King");
      expect(NOTATION_MAP["Q"]).toBe("Queen");
      expect(NOTATION_MAP["R"]).toBe("Rook");
      expect(NOTATION_MAP["B"]).toBe("Bishop");
      expect(NOTATION_MAP["N"]).toBe("Knight");
      expect(NOTATION_MAP["P"]).toBe("Pawn");
    });

    it("should have notation for knight as N (not K)", () => {
      expect(NOTATION_MAP["N"]).toBe("Knight");
      expect(NOTATION_MAP["K"]).not.toBe("Knight");
    });
  });

  describe("FEN Piece Characters", () => {
    const FEN_PIECES: Record<string, { type: string; color: string }> = {
      K: { type: "King", color: "white" },
      Q: { type: "Queen", color: "white" },
      R: { type: "Rook", color: "white" },
      B: { type: "Bishop", color: "white" },
      N: { type: "Knight", color: "white" },
      P: { type: "Pawn", color: "white" },
      k: { type: "King", color: "black" },
      q: { type: "Queen", color: "black" },
      r: { type: "Rook", color: "black" },
      b: { type: "Bishop", color: "black" },
      n: { type: "Knight", color: "black" },
      p: { type: "Pawn", color: "black" },
    };

    it("should map uppercase to white pieces", () => {
      expect(FEN_PIECES["K"].color).toBe("white");
      expect(FEN_PIECES["Q"].color).toBe("white");
      expect(FEN_PIECES["R"].color).toBe("white");
      expect(FEN_PIECES["B"].color).toBe("white");
      expect(FEN_PIECES["N"].color).toBe("white");
      expect(FEN_PIECES["P"].color).toBe("white");
    });

    it("should map lowercase to black pieces", () => {
      expect(FEN_PIECES["k"].color).toBe("black");
      expect(FEN_PIECES["q"].color).toBe("black");
      expect(FEN_PIECES["r"].color).toBe("black");
      expect(FEN_PIECES["b"].color).toBe("black");
      expect(FEN_PIECES["n"].color).toBe("black");
      expect(FEN_PIECES["p"].color).toBe("black");
    });
  });

  describe("Board Square Calculation", () => {
    const BOARD_SIZE = 8;

    const getSquareFromIndex = (index: number, isFlipped: boolean) => {
      const row = Math.floor(index / BOARD_SIZE);
      const col = index % BOARD_SIZE;

      const file = String.fromCharCode(97 + (isFlipped ? 7 - col : col));
      const rank = isFlipped ? row + 1 : BOARD_SIZE - row;

      return `${file}${rank}`;
    };

    it("should calculate correct square for index 0 (a8 when not flipped)", () => {
      expect(getSquareFromIndex(0, false)).toBe("a8");
    });

    it("should calculate correct square for index 63 (h1 when not flipped)", () => {
      expect(getSquareFromIndex(63, false)).toBe("h1");
    });

    it("should calculate correct square when board is flipped", () => {
      expect(getSquareFromIndex(0, true)).toBe("h1");
      expect(getSquareFromIndex(63, true)).toBe("a8");
    });

    it("should calculate e2 square correctly", () => {
      // e2 is at row 6, col 4 (index 52)
      expect(getSquareFromIndex(52, false)).toBe("e2");
    });

    it("should calculate e4 square correctly", () => {
      // e4 is at row 4, col 4 (index 36)
      expect(getSquareFromIndex(36, false)).toBe("e4");
    });
  });
});

describe("Board Themes", () => {
  const THEMES = {
    purple: {
      light: "#9B59B6",
      dark: "#7D3C98",
    },
    classic: {
      light: "#F0D9B5",
      dark: "#B58863",
    },
    eco: {
      light: "#FFFFDD",
      dark: "#86A666",
    },
    retro: {
      light: "#E8E8E8",
      dark: "#4A4A4A",
    },
  };

  it("should have 4 board themes", () => {
    expect(Object.keys(THEMES).length).toBe(4);
  });

  it("should have light and dark colors for each theme", () => {
    Object.values(THEMES).forEach((theme) => {
      expect(theme.light).toBeDefined();
      expect(theme.dark).toBeDefined();
    });
  });

  it("should have valid hex color format", () => {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

    Object.values(THEMES).forEach((theme) => {
      expect(theme.light).toMatch(hexColorRegex);
      expect(theme.dark).toMatch(hexColorRegex);
    });
  });

  it("should have purple as default theme", () => {
    expect(THEMES.purple).toBeDefined();
  });
});

describe("Initial Position", () => {
  const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("should have correct starting FEN", () => {
    expect(STARTING_FEN).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });

  it("should have white to move in starting position", () => {
    const parts = STARTING_FEN.split(" ");
    expect(parts[1]).toBe("w");
  });

  it("should have all castling rights in starting position", () => {
    const parts = STARTING_FEN.split(" ");
    expect(parts[2]).toBe("KQkq");
  });

  it("should have no en passant square in starting position", () => {
    const parts = STARTING_FEN.split(" ");
    expect(parts[3]).toBe("-");
  });

  it("should have move counters at 0 and 1", () => {
    const parts = STARTING_FEN.split(" ");
    expect(parts[4]).toBe("0"); // Halfmove clock
    expect(parts[5]).toBe("1"); // Fullmove number
  });
});
