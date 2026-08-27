/**
 * Draw Offer Modal Component
 *
 * Displays incoming draw offers with accept/decline options.
 * Also shows pending draw offer state when user has sent an offer.
 */

import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";

export interface DrawOfferModalProps {
  visible: boolean;
  isIncoming: boolean;
  opponentName?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
}

export const DrawOfferModal = memo(function DrawOfferModal({
  visible,
  isIncoming,
  opponentName = "Opponent",
  onAccept,
  onDecline,
  onCancel,
}: DrawOfferModalProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View style={styles.container}>
          {isIncoming ? (
            <>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>🤝</Text>
              </View>
              <Text style={styles.title}>Draw Offer</Text>
              <Text style={styles.message}>
                {opponentName} is offering a draw
              </Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.declineButton]}
                  onPress={onDecline}
                  activeOpacity={0.8}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.acceptButton]}
                  onPress={onAccept}
                  activeOpacity={0.8}
                >
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.iconContainer}>
                <Text style={styles.icon}>⏳</Text>
              </View>
              <Text style={styles.title}>Draw Offered</Text>
              <Text style={styles.message}>
                Waiting for {opponentName} to respond...
              </Text>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel Offer</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  declineButton: {
    backgroundColor: "rgba(255, 59, 48, 0.2)",
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  declineButtonText: {
    color: "#FF3B30",
    fontSize: 16,
    fontWeight: "600",
  },
  acceptButton: {
    backgroundColor: "#4CAF82",
  },
  acceptButtonText: {
    color: "#0F0F1E",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    width: "100%",
  },
  cancelButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default DrawOfferModal;
