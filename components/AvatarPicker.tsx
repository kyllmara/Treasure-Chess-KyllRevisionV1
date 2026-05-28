import React from "react";
import {
  View,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
  Modal,
  Text,
  ImageSourcePropType,
} from "react-native";
import { X, Check } from "lucide-react-native";

// Pre-load all avatar images
const AVATAR_IMAGES: Record<number, ImageSourcePropType> = {
  1: require("@/assets/images/avatars/1.png"),
  2: require("@/assets/images/avatars/2.png"),
  3: require("@/assets/images/avatars/3.png"),
  4: require("@/assets/images/avatars/4.png"),
  5: require("@/assets/images/avatars/5.png"),
  6: require("@/assets/images/avatars/6.png"),
  7: require("@/assets/images/avatars/7.png"),
  8: require("@/assets/images/avatars/8.png"),
  9: require("@/assets/images/avatars/9.png"),
  10: require("@/assets/images/avatars/10.png"),
  11: require("@/assets/images/avatars/11.png"),
  12: require("@/assets/images/avatars/12.png"),
  13: require("@/assets/images/avatars/13.png"),
  14: require("@/assets/images/avatars/14.png"),
  15: require("@/assets/images/avatars/15.png"),
  16: require("@/assets/images/avatars/16.png"),
  17: require("@/assets/images/avatars/17.png"),
  18: require("@/assets/images/avatars/18.png"),
  19: require("@/assets/images/avatars/19.png"),
  20: require("@/assets/images/avatars/20.png"),
  21: require("@/assets/images/avatars/21.png"),
  22: require("@/assets/images/avatars/22.png"),
  23: require("@/assets/images/avatars/23.png"),
  24: require("@/assets/images/avatars/24.png"),
  25: require("@/assets/images/avatars/25.png"),
  26: require("@/assets/images/avatars/26.png"),
  27: require("@/assets/images/avatars/27.png"),
  28: require("@/assets/images/avatars/28.png"),
  29: require("@/assets/images/avatars/29.png"),
  30: require("@/assets/images/avatars/30.png"),
  0: require("@/assets/images/avatars/robot.png"), // AI/Robot avatar at index 0
};

// Avatar count (1-30 plus robot at 0)
const AVATAR_INDICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

export function getAvatarSource(index: number): ImageSourcePropType {
  return AVATAR_IMAGES[index] || AVATAR_IMAGES[1];
}

type AvatarPickerProps = {
  selectedIndex: number;
  onSelect: (index: number) => void;
  size?: "small" | "medium" | "large";
};

export function AvatarPicker({ selectedIndex, onSelect, size = "medium" }: AvatarPickerProps) {
  const avatarSize = size === "small" ? 48 : size === "medium" ? 64 : 80;

  return (
    <View style={styles.grid}>
      {AVATAR_INDICES.map((index) => (
        <TouchableOpacity
          key={index}
          style={[
            styles.avatarOption,
            { width: avatarSize + 8, height: avatarSize + 8 },
            selectedIndex === index && styles.avatarSelected,
          ]}
          onPress={() => onSelect(index)}
        >
          <Image
            source={AVATAR_IMAGES[index]}
            style={[styles.avatarImage, { width: avatarSize, height: avatarSize }]}
          />
          {selectedIndex === index && (
            <View style={styles.checkmark}>
              <Check size={16} color="#1a1a2e" />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

type AvatarPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function AvatarPickerModal({ visible, onClose, selectedIndex, onSelect }: AvatarPickerModalProps) {
  const handleSelect = (index: number) => {
    onSelect(index);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choose Your Avatar</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
            <View style={styles.modalGrid}>
              {AVATAR_INDICES.map((index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.modalAvatarOption,
                    selectedIndex === index && styles.avatarSelected,
                  ]}
                  onPress={() => handleSelect(index)}
                >
                  <Image
                    source={AVATAR_IMAGES[index]}
                    style={styles.modalAvatarImage}
                  />
                  {selectedIndex === index && (
                    <View style={styles.modalCheckmark}>
                      <Check size={20} color="#1a1a2e" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type AvatarDisplayProps = {
  index: number;
  size?: number;
  showBorder?: boolean;
};

export function AvatarDisplay({ index, size = 64, showBorder = true }: AvatarDisplayProps) {
  return (
    <View
      style={[
        styles.avatarDisplay,
        { width: size, height: size, borderRadius: size / 2 },
        showBorder && styles.avatarDisplayBorder,
      ]}
    >
      <Image
        source={getAvatarSource(index)}
        style={[styles.avatarDisplayImage, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
  },
  avatarOption: {
    position: "relative",
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  avatarSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  avatarImage: {
    borderRadius: 32,
  },
  checkmark: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1a1a2e",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  modalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
    justifyContent: "center",
  },
  modalAvatarOption: {
    position: "relative",
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  modalAvatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  modalCheckmark: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1a1a2e",
  },
  avatarDisplay: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarDisplayBorder: {
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  avatarDisplayImage: {
    resizeMode: "cover",
  },
});
