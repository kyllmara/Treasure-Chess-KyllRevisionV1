import React from "react";
import { View, StyleSheet } from "react-native";
import { PieceSymbol, Color } from "chess.js";
import { ChessPieceComponent } from "./ChessPieces";
import type { PieceStyle } from "@/types";

interface CapturedPiece {
  type: PieceSymbol;
  color: Color;
}

interface CapturedPiecesProps {
  pieces: CapturedPiece[];
  pieceStyle: PieceStyle;
  pieceSize?: number;
  maxPieces?: number;
}

// Piece values for sorting (higher value pieces first)
const PIECE_VALUES: Record<PieceSymbol, number> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
  k: 0, // King can't be captured
};

export function CapturedPieces({
  pieces,
  pieceStyle,
  pieceSize = 20,
  maxPieces = 15,
}: CapturedPiecesProps) {
  // Sort pieces by value (highest first)
  const sortedPieces = [...pieces]
    .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type])
    .slice(0, maxPieces);

  // Calculate material advantage
  const materialValue = pieces.reduce((sum, piece) => sum + PIECE_VALUES[piece.type], 0);

  if (sortedPieces.length === 0) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.piecesRow}>
        {sortedPieces.map((piece, index) => (
          <View
            key={`${piece.type}-${index}`}
            style={[
              styles.pieceWrapper,
              index > 0 && { marginLeft: -pieceSize * 0.3 },
            ]}
          >
            <ChessPieceComponent
              type={piece.type}
              color={piece.color}
              size={pieceSize}
              style={pieceStyle}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 30,
    justifyContent: "center",
  },
  piecesRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pieceWrapper: {
    zIndex: 1,
  },
});

export default CapturedPieces;
