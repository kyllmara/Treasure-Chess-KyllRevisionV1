import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  TextInput,
  Modal,
  Platform,
  RefreshControl,
} from "react-native";
import Slider from "@/components/shims/Slider";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { X, Clock, DollarSign, User, UserPlus, Globe, Video, Share2, Check, Calendar } from "lucide-react-native";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/hooks/useAuth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Challenge } from "@/types";

const TIMER_OPTIONS = [30, 60, 90, 120, 180, 300, 600, 1200];
const MIN_WAGER = 1;
const SOCIAL_PLATFORMS = [
  { id: "twitch", name: "Twitch", color: "#9146FF" },
  { id: "x", name: "X (Twitter)", color: "#1DA1F2" },
  { id: "instagram", name: "Instagram", color: "#E4405F" },
  { id: "facebook", name: "Facebook", color: "#1877F2" },
  { id: "discord", name: "Discord", color: "#5865F2" },
];
const TCT_TO_USD = 0.04;

function usdToTCT(usd: number): number {
  return usd / TCT_TO_USD;
}

type ChessColor = "white" | "black" | "random";

export default function CustomMatchScreen() {
  const router = useRouter();
  const { user, enterCustomChallengeMatchmaking } = useApp();
  const { profile } = useAuth();
  const [selectedTimer, setSelectedTimer] = useState<number>(90);
  const [selectedWager, setSelectedWager] = useState<number>(10);
  const [wagerInputValue, setWagerInputValue] = useState<string>("10");
  const [selectedColor, setSelectedColor] = useState<ChessColor>("white");
  const [isLivestreamEnabled, setIsLivestreamEnabled] = useState<boolean>(false);
  const [showSocialsModal, setShowSocialsModal] = useState<boolean>(false);
  const [connectedSocials, setConnectedSocials] = useState<string[]>([]);
  const [playNow, setPlayNow] = useState<boolean>(true);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    // Reset form to defaults
    setSelectedTimer(90);
    setSelectedWager(10);
    setWagerInputValue("10");
    setSelectedColor("white");
    setIsLivestreamEnabled(false);
    setPlayNow(true);
    setTimeout(() => setIsRefreshing(false), 300);
  }, []);

  const handleInviteFriend = () => {
    Alert.alert(
      "Invite Friend",
      "Share invite link with your friend to start a custom match!",
      [{ text: "OK" }]
    );
  };

  const handlePostChallenge = async () => {
    if (selectedWager > user.walletBalance) {
      Alert.alert(
        "Insufficient Funds",
        "Please add more funds to your wallet before posting a challenge."
      );
      return;
    }

    try {
      const tctAmount = selectedWager / TCT_TO_USD;
      const newChallenge: Challenge = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        challenger: {
          id: profile?.id || user.id,
          username: profile?.username || user.username,
          rating: 1800,
        },
        betAmount: tctAmount as any,
        createdAt: new Date(),
        scheduledTime: playNow ? new Date(Date.now() - 60000) : scheduledDate,
        gameClock: selectedTimer / 60,
      };

      const stored = await AsyncStorage.getItem("@custom_challenges");
      let existingChallenges: Challenge[] = [];

      if (stored) {
        try {
          existingChallenges = JSON.parse(stored);
        } catch (parseError) {
          console.error("Failed to parse existing challenges, starting fresh:", parseError);
          await AsyncStorage.removeItem("@custom_challenges");
        }
      }

      const updatedChallenges = [newChallenge, ...existingChallenges];
      await AsyncStorage.setItem("@custom_challenges", JSON.stringify(updatedChallenges));

      if (playNow) {
        enterCustomChallengeMatchmaking(newChallenge.id, {
          wager: selectedWager,
          timer: selectedTimer,
          color: selectedColor,
        });
        router.push("/challenge-waiting" as any);
      } else {
        Alert.alert(
          "Challenge Posted!",
          "Your custom challenge has been posted to the Peer-to-Peer challenge board.",
          [
            {
              text: "View Challenges",
              onPress: () => router.push("/challenge-board" as any),
            },
            { text: "OK", style: "cancel" },
          ]
        );
      }
    } catch (error) {
      console.error("Failed to post challenge:", error);
      Alert.alert("Error", "Failed to post challenge. Please try again.");
    }
  };

  const handleWagerSliderChange = (value: number) => {
    const roundedValue = Math.round(value);
    setSelectedWager(roundedValue);
    setWagerInputValue(roundedValue.toString());
  };

  const handleWagerInputChange = (text: string) => {
    setWagerInputValue(text);
    const numValue = parseFloat(text);
    if (!isNaN(numValue) && numValue >= MIN_WAGER && numValue <= user.walletBalance) {
      setSelectedWager(numValue);
    }
  };

  const toggleSocial = (socialId: string) => {
    if (connectedSocials.includes(socialId)) {
      setConnectedSocials(connectedSocials.filter((id) => id !== socialId));
    } else {
      setConnectedSocials([...connectedSocials, socialId]);
    }
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => router.back()}
      >
        <X size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
            colors={["#FFD700"]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Custom Match</Text>
          <Text style={styles.subtitle}>Configure your game settings</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Clock size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Game Timer</Text>
          </View>
          <View style={styles.optionsGrid}>
            {TIMER_OPTIONS.map((timer) => (
              <TouchableOpacity
                key={timer}
                style={[
                  styles.optionButton,
                  selectedTimer === timer && styles.optionButtonActive,
                ]}
                onPress={() => setSelectedTimer(timer)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedTimer === timer && styles.optionTextActive,
                  ]}
                >
                  {timer < 60 ? `${timer}s` : `${timer / 60}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DollarSign size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Set Wager</Text>
          </View>
          <View style={styles.wagerContainer}>
            <View style={styles.wagerDisplay}>
              <Text style={styles.wagerTCT}>{usdToTCT(selectedWager).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT</Text>
              <Text style={styles.wagerUSD}>${selectedWager.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>Min: {usdToTCT(MIN_WAGER).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT (${MIN_WAGER.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</Text>
              <Slider
                style={styles.slider}
                minimumValue={MIN_WAGER}
                maximumValue={user.walletBalance}
                value={selectedWager}
                onValueChange={handleWagerSliderChange}
                minimumTrackTintColor="#FFD700"
                maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                thumbTintColor="#FFD700"
                step={0.5}
              />
              <Text style={styles.sliderLabel}>Max: {usdToTCT(user.walletBalance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT (${user.walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</Text>
            </View>
            <TextInput
              style={styles.wagerInput}
              value={wagerInputValue}
              onChangeText={handleWagerInputChange}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor="#666"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Your Color</Text>
          </View>
          <View style={styles.colorOptions}>
            <TouchableOpacity
              style={[
                styles.colorButton,
                selectedColor === "white" && styles.colorButtonActive,
              ]}
              onPress={() => setSelectedColor("white")}
            >
              <View style={[styles.colorCircle, { backgroundColor: "#FFFFFF" }]} />
              <Text
                style={[
                  styles.colorText,
                  selectedColor === "white" && styles.colorTextActive,
                ]}
              >
                White
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.colorButton,
                selectedColor === "black" && styles.colorButtonActive,
              ]}
              onPress={() => setSelectedColor("black")}
            >
              <View style={[styles.colorCircle, { backgroundColor: "#333333" }]} />
              <Text
                style={[
                  styles.colorText,
                  selectedColor === "black" && styles.colorTextActive,
                ]}
              >
                Black
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.colorButton,
                selectedColor === "random" && styles.colorButtonActive,
              ]}
              onPress={() => setSelectedColor("random")}
            >
              <View style={styles.randomCircle}>
                <View style={styles.randomHalf1} />
                <View style={styles.randomHalf2} />
              </View>
              <Text
                style={[
                  styles.colorText,
                  selectedColor === "random" && styles.colorTextActive,
                ]}
              >
                Random
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Calendar size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Schedule</Text>
          </View>
          <View style={styles.toggleContainer}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleLabel}>Play Now</Text>
              <Text style={styles.toggleDescription}>
                {playNow
                  ? "Start the match immediately when opponent joins"
                  : "Schedule the match for a specific date and time"}
              </Text>
            </View>
            <Switch
              value={playNow}
              onValueChange={setPlayNow}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: "#FFD700" }}
              thumbColor={playNow ? "#FFFFFF" : "#A0A0A0"}
              ios_backgroundColor="rgba(255, 255, 255, 0.1)"
            />
          </View>
          {!playNow && (
            <View style={styles.schedulerContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={18} color="#FFD700" />
                <View style={styles.dateTimeInfo}>
                  <Text style={styles.dateTimeLabel}>Date</Text>
                  <Text style={styles.dateTimeValue}>
                    {scheduledDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Clock size={18} color="#FFD700" />
                <View style={styles.dateTimeInfo}>
                  <Text style={styles.dateTimeLabel}>Time</Text>
                  <Text style={styles.dateTimeValue}>
                    {scheduledDate.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Video size={20} color="#FFD700" />
            <Text style={styles.sectionTitle}>Livestream</Text>
          </View>
          <View style={styles.toggleContainer}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleLabel}>Enable Livestream</Text>
              <Text style={styles.toggleDescription}>
                {isLivestreamEnabled
                  ? "Your match will be public and visible to all players"
                  : "Your match will be private"}
              </Text>
            </View>
            <Switch
              value={isLivestreamEnabled}
              onValueChange={setIsLivestreamEnabled}
              trackColor={{ false: "rgba(255, 255, 255, 0.1)", true: "#FFD700" }}
              thumbColor={isLivestreamEnabled ? "#FFFFFF" : "#A0A0A0"}
              ios_backgroundColor="rgba(255, 255, 255, 0.1)"
            />
          </View>
          {isLivestreamEnabled && (
            <TouchableOpacity
              style={styles.connectSocialsButton}
              onPress={() => setShowSocialsModal(true)}
            >
              <Share2 size={18} color="#FFD700" />
              <Text style={styles.connectSocialsText}>Connect Socials</Text>
              {connectedSocials.length > 0 && (
                <View style={styles.socialsBadge}>
                  <Text style={styles.socialsBadgeText}>{connectedSocials.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Match Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Timer:</Text>
            <Text style={styles.summaryValue}>
              {selectedTimer < 60 ? `${selectedTimer} seconds` : `${selectedTimer / 60} minutes`}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Your Stake:</Text>
            <Text style={styles.summaryValue}>
              {usdToTCT(selectedWager).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT (${selectedWager.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Prize Pool:</Text>
            <Text style={styles.summaryValue}>
              {usdToTCT(selectedWager * 2).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT (${(selectedWager * 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee (10%):</Text>
            <Text style={styles.summaryValue}>
              {usdToTCT(selectedWager * 2 * 0.1).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($
              {(selectedWager * 2 * 0.1).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
            <Text style={styles.summaryLabelHighlight}>Winner Gets:</Text>
            <Text style={styles.summaryValueHighlight}>
              {usdToTCT(selectedWager * 2 * 0.9).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($
              {(selectedWager * 2 * 0.9).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
          {isLivestreamEnabled && (
            <View style={styles.livestreamBadge}>
              <Video size={14} color="#FF0000" />
              <Text style={styles.livestreamBadgeText}>This match will be livestreamed</Text>
            </View>
          )}
          {!playNow && (
            <View style={styles.scheduledInfoBadge}>
              <Calendar size={14} color="#4A90E2" />
              <Text style={styles.scheduledInfoText}>
                Scheduled for {scheduledDate.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={handleInviteFriend}
          >
            <UserPlus size={20} color="#0F0F1E" />
            <Text style={styles.inviteButtonText}>Invite Friend</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePostChallenge}
          >
            <Globe size={20} color="#0F0F1E" />
            <Text style={styles.postButtonText}>Post Challenge</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showSocialsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSocialsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect Social Channels</Text>
              <TouchableOpacity onPress={() => setShowSocialsModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.socialsList}>
              {SOCIAL_PLATFORMS.map((platform) => (
                <TouchableOpacity
                  key={platform.id}
                  style={[
                    styles.socialItem,
                    connectedSocials.includes(platform.id) && styles.socialItemActive,
                  ]}
                  onPress={() => toggleSocial(platform.id)}
                >
                  <View style={[styles.socialDot, { backgroundColor: platform.color }]} />
                  <Text style={styles.socialName}>{platform.name}</Text>
                  {connectedSocials.includes(platform.id) && (
                    <Check size={20} color="#FFD700" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowSocialsModal(false)}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {Platform.OS !== 'web' && showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Date</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <X size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerPlaceholder}>
                <Text style={styles.datePickerText}>
                  {scheduledDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <View style={styles.dateAdjustButtons}>
                  <TouchableOpacity
                    style={styles.dateAdjustButton}
                    onPress={() => {
                      const newDate = new Date(scheduledDate);
                      newDate.setDate(newDate.getDate() - 1);
                      setScheduledDate(newDate);
                    }}
                  >
                    <Text style={styles.dateAdjustButtonText}>- Day</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateAdjustButton}
                    onPress={() => {
                      const newDate = new Date(scheduledDate);
                      newDate.setDate(newDate.getDate() + 1);
                      setScheduledDate(newDate);
                    }}
                  >
                    <Text style={styles.dateAdjustButtonText}>+ Day</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS !== 'web' && showTimePicker && (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Time</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <X size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.datePickerPlaceholder}>
                <Text style={styles.datePickerText}>
                  {scheduledDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <View style={styles.timeAdjustContainer}>
                  <View style={styles.timeAdjustSection}>
                    <Text style={styles.timeAdjustLabel}>Hour</Text>
                    <View style={styles.dateAdjustButtons}>
                      <TouchableOpacity
                        style={styles.dateAdjustButton}
                        onPress={() => {
                          const newDate = new Date(scheduledDate);
                          newDate.setHours(newDate.getHours() - 1);
                          setScheduledDate(newDate);
                        }}
                      >
                        <Text style={styles.dateAdjustButtonText}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dateAdjustButton}
                        onPress={() => {
                          const newDate = new Date(scheduledDate);
                          newDate.setHours(newDate.getHours() + 1);
                          setScheduledDate(newDate);
                        }}
                      >
                        <Text style={styles.dateAdjustButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.timeAdjustSection}>
                    <Text style={styles.timeAdjustLabel}>Minute</Text>
                    <View style={styles.dateAdjustButtons}>
                      <TouchableOpacity
                        style={styles.dateAdjustButton}
                        onPress={() => {
                          const newDate = new Date(scheduledDate);
                          newDate.setMinutes(newDate.getMinutes() - 15);
                          setScheduledDate(newDate);
                        }}
                      >
                        <Text style={styles.dateAdjustButtonText}>-15</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.dateAdjustButton}
                        onPress={() => {
                          const newDate = new Date(scheduledDate);
                          newDate.setMinutes(newDate.getMinutes() + 15);
                          setScheduledDate(newDate);
                        }}
                      >
                        <Text style={styles.dateAdjustButtonText}>+15</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.modalButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    minWidth: 80,
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  optionButtonDisabled: {
    opacity: 0.4,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  optionTextActive: {
    color: "#FFD700",
    fontWeight: "700" as const,
  },
  optionTCT: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#A0A0A0",
  },
  optionUSD: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginTop: 2,
    opacity: 0.7,
  },
  colorOptions: {
    flexDirection: "row",
    gap: 12,
  },
  colorButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    gap: 8,
  },
  colorButtonActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  randomCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
  },
  randomHalf1: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  randomHalf2: {
    flex: 1,
    backgroundColor: "#333333",
  },
  colorText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  colorTextActive: {
    color: "#FFD700",
    fontWeight: "700" as const,
  },
  summaryCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryRowHighlight: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  summaryLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  summaryLabelHighlight: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  summaryValueHighlight: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  actionButtons: {
    gap: 12,
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4A90E2",
    paddingVertical: 16,
    borderRadius: 12,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  toggleLeft: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 12,
    color: "#A0A0A0",
    lineHeight: 16,
  },
  livestreamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 0, 0, 0.3)",
  },
  livestreamBadgeText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#FF6B6B",
  },
  wagerContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  wagerDisplay: {
    alignItems: "center",
    marginBottom: 20,
  },
  wagerTCT: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  wagerUSD: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginTop: 4,
  },
  sliderContainer: {
    marginBottom: 16,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  wagerInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  connectSocialsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  connectSocialsText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  socialsBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  socialsBadgeText: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  socialsList: {
    gap: 12,
    marginBottom: 24,
  },
  socialItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  socialItemActive: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "#FFD700",
  },
  socialDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  socialName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  modalButton: {
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  schedulerContainer: {
    marginTop: 16,
    gap: 12,
  },
  dateTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  dateTimeInfo: {
    flex: 1,
  },
  dateTimeLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginBottom: 4,
  },
  dateTimeValue: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  scheduledInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.3)",
  },
  scheduledInfoText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#4A90E2",
  },
  pickerModalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  datePickerPlaceholder: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
  },
  datePickerText: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 20,
    textAlign: "center",
  },
  dateAdjustButtons: {
    flexDirection: "row",
    gap: 12,
  },
  dateAdjustButton: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFD700",
    minWidth: 80,
    alignItems: "center",
  },
  dateAdjustButtonText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  timeAdjustContainer: {
    flexDirection: "row",
    gap: 16,
  },
  timeAdjustSection: {
    flex: 1,
    alignItems: "center",
  },
  timeAdjustLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    marginBottom: 12,
  },
});
