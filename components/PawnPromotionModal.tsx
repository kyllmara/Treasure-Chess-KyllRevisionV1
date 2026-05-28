import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { PieceSymbol, Color } from "chess.js";
import { ChessPieceComponent } from "./ChessPieces";
import type { PieceStyle } from "@/types";

interface PawnPromotionModalProps {
  visible: boolean;
  color: Color;
  pieceStyle: PieceStyle;
  onSelect: (piece: PieceSymbol) => void;
  onCancel: () => void;
}

const PROMOTION_PIECES: PieceSymbol[] = ["q", "r", "b", "n"];
const PIECE_NAMES: Record<string, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
};

export function PawnPromotionModal({
  visible,
  color,
  pieceStyle,
  onSelect,
  onCancel,
}: PawnPromotionModalProps) {
  const pieceSize = 60;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Promote Pawn</Text>
          <Text style={styles.subtitle}>Choose a piece</Text>

          <View style={styles.piecesContainer}>
            {PROMOTION_PIECES.map((piece) => (
              <TouchableOpacity
                key={piece}
                style={styles.pieceButton}
                onPress={() => onSelect(piece)}
                activeOpacity={0.7}
              >
                <View style={styles.pieceWrapper}>
                  <ChessPieceComponent
                    type={piece}
                    color={color}
                    size={pieceSize}
                    style={pieceStyle}
                  />
                </View>
                <Text style={styles.pieceName}>{PIECE_NAMES[piece]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 24,
    width: Dimensions.get("window").width * 0.85,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 24,
  },
  piecesContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 24,
  },
  pieceButton: {
    alignItems: "center",
    padding: 8,
  },
  pieceWrapper: {
    width: 70,
    height: 70,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  pieceName: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#A0A0A0",
    fontWeight: "600",
  },
});

export default PawnPromotionModal;
