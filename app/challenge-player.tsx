import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  InteractionManager,
} from "react-native";
import Slider from "@/components/shims/Slider";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import { X, Clock, DollarSign, User, Check, Calendar, Swords } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { createChallengeService, ColorPreference } from "@/lib/challenges";
import { DEFAULT_RAKE_RATE } from "@/lib/escrow";
import { AvatarDisplay } from "@/components/AvatarPicker";
import { supabase } from "@/lib/supabase";
import { ethers } from "ethers";

const TIMER_OPTIONS = [30, 60, 90, 120, 180, 300, 600, 1200];
const MIN_WAGER = 1;
const TCT_TO_USD = 0.04;

function usdToTCT(usd: number): number {
  return usd / TCT_TO_USD;
}

type ChessColor = "white" | "black" | "random";

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  JP: "🇯🇵",
  BR: "🇧🇷",
  IN: "🇮🇳",
  MX: "🇲🇽",
};

export default function ChallengePlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Defer auth hook - don't block initial render
  const { profile } = useAuth();

  // Extract params FIRST - these are available immediately
  const playerId = params.playerId as string;
  const playerName = params.playerName as string;
  const playerRating = params.playerRating as string;
  const playerCountry = params.playerCountry as string;
  const playerAvatar = params.playerAvatar as string;
  const playerProfilePicture = params.playerProfilePicture as string;
  const passedUserBalance = params.userBalance as string;
  const source = params.source as string;

  // Initialize balance from passed param for instant display
  const initialBalance = passedUserBalance ? Number(passedUserBalance) || 0 : 0;

  const [selectedTimer, setSelectedTimer] = useState<number>(90);
  const [selectedWager, setSelectedWager] = useState<number>(10);
  const [wagerInputValue, setWagerInputValue] = useState<string>("10");
  const [selectedColor, setSelectedColor] = useState<ChessColor>("white");
  const [playNow, setPlayNow] = useState<boolean>(true);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [showDateDropdown, setShowDateDropdown] = useState<boolean>(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [availableTct, setAvailableTct] = useState<number>(initialBalance);
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(!passedUserBalance);

  // Fetch fresh balance AFTER screen renders (deferred)
  useEffect(() => {
    if (!profile?.id) return;

    // Defer database fetch until after animations complete
    const task = InteractionManager.runAfterInteractions(() => {
      supabase
        .from("balances")
        .select("available_tct")
        .eq("user_id", profile.id)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            setAvailableTct(Number(data.available_tct) || 0);
          }
          setIsBalanceLoading(false);
        })
        .catch(() => setIsBalanceLoading(false));
    });

    return () => task.cancel();
  }, [profile?.id]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setIsBalanceLoading(true);
    // Reset form to defaults
    setSelectedTimer(90);
    setSelectedWager(10);
    setWagerInputValue("10");
    setSelectedColor("white");
    setPlayNow(true);

    // Re-fetch balance from database
    if (profile?.id) {
      supabase
        .from("balances")
        .select("available_tct")
        .eq("user_id", profile.id)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            setAvailableTct(Number(data.available_tct) || 0);
          }
          setIsRefreshing(false);
          setIsBalanceLoading(false);
        })
        .catch(() => {
          setIsRefreshing(false);
          setIsBalanceLoading(false);
        });
    } else {
      setIsRefreshing(false);
      setIsBalanceLoading(false);
    }
  }, [profile?.id]);

  // Calculate rake using the actual platform rate (5%)
  const rakeRate = DEFAULT_RAKE_RATE;
  const rakePercentDisplay = Math.round(rakeRate * 100);

  const handleChallengeNow = useCallback(async () => {
    const maxWagerUsd = availableTct * TCT_TO_USD;
    console.log("[ChallengePlayer] handleChallengeNow called", {
      selectedWager,
      availableTct,
      maxWagerUsd,
      profileId: profile?.id,
      playerName,
    });

    if (selectedWager > maxWagerUsd) {
      Alert.alert(
        "Insufficient Funds",
        `You need ${usdToTCT(selectedWager).toFixed(0)} TCT but only have ${availableTct.toFixed(0)} TCT available.`
      );
      return;
    }

    if (!profile?.id) {
      Alert.alert("Error", "Please log in to create a challenge.");
      return;
    }

    setIsSubmitting(true);
    console.log("[ChallengePlayer] Creating challenge...");

    try {
      // Create the challenge service with Supabase profile UUID
      const challengeService = createChallengeService(profile.id);

      // Convert USD wager to TCT
      const wagerTct = usdToTCT(selectedWager);

      // Generate on-chain game ID for wager games
      // This bytes32 hash is used by the escrow contract to track the game
      let onChainGameId: string | undefined;
      if (wagerTct > 0) {
        const uniqueString = `challenge_${profile.id}_${playerName}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        onChainGameId = ethers.id(uniqueString);
        console.log("[ChallengePlayer] Generated on-chain game ID:", onChainGameId);
      }

      // Create the direct challenge
      const result = await challengeService.createDirectChallenge({
        creatorId: profile.id,
        opponentUsername: playerName,
        wagerTct: wagerTct,
        timeControlSeconds: selectedTimer,
        incrementSeconds: 0, // No increment by default
        colorPreference: selectedColor as ColorPreference,
        isRated: true,
        onChainGameId,
      });

      console.log("[ChallengePlayer] Challenge result:", result);

      if (result.success && result.challengeId && result.roomCode) {
        console.log("[ChallengePlayer] Navigating to create-challenge lobby...");
        // Navigate to create-challenge screen in waiting mode
        // This reuses the existing waiting UI from create-challenge
        router.replace({
          pathname: "/create-challenge",
          params: {
            challengeId: result.challengeId,
            roomCode: result.roomCode,
            directChallenge: "true",
            opponentName: playerName,
            source: source || "challenge",
          },
        });
      } else {
        console.error("[ChallengePlayer] Challenge failed:", result.error);
        Alert.alert(
          "Challenge Failed",
          result.error || "Failed to create challenge. Please try again."
        );
      }
    } catch (error) {
      console.error("[ChallengePlayer] Error creating challenge:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedWager,
    availableTct,
    profile?.id,
    playerName,
    selectedTimer,
    selectedColor,
    router,
  ]);

  const handleWagerSliderChange = (value: number) => {
    const roundedValue = Math.round(value);
    setSelectedWager(roundedValue);
    setWagerInputValue(roundedValue.toString());
  };

  const handleWagerInputChange = (text: string) => {
    setWagerInputValue(text);
    const numValue = parseFloat(text);
    const maxWagerUsd = availableTct * TCT_TO_USD;
    if (!isNaN(numValue) && numValue >= MIN_WAGER && numValue <= maxWagerUsd) {
      setSelectedWager(numValue);
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
          <Swords size={48} color="#FFD700" />
          <Text style={styles.title}>Challenge Player</Text>
          <Text style={styles.subtitle}>Configure your match settings</Text>
        </View>

        <View style={styles.opponentCard}>
          {playerProfilePicture ? (
            <Image
              source={{ uri: playerProfilePicture }}
              style={styles.opponentAvatar}
            />
          ) : (
            <AvatarDisplay
              index={parseInt(playerAvatar) || 0}
              size={56}
              showBorder
            />
          )}
          <View style={styles.opponentInfo}>
            <Text style={styles.opponentName}>{playerName}</Text>
            <Text style={styles.opponentRating}>{playerRating} ELO</Text>
          </View>
          <Text style={styles.opponentFlag}>{COUNTRY_FLAGS[playerCountry] || "🌍"}</Text>
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
          <View style={styles.balanceInfo}>
            <Text style={styles.balanceLabel}>Available Balance:</Text>
            {isBalanceLoading ? (
              <ActivityIndicator size="small" color="#4ECDC4" />
            ) : (
              <Text style={styles.balanceValue}>
                {availableTct.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TCT (${(availableTct * TCT_TO_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </Text>
            )}
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
                maximumValue={Math.max(MIN_WAGER, availableTct * TCT_TO_USD)}
                value={selectedWager}
                onValueChange={handleWagerSliderChange}
                minimumTrackTintColor="#FFD700"
                maximumTrackTintColor="rgba(255, 255, 255, 0.2)"
                thumbTintColor="#FFD700"
                step={0.5}
              />
              <Text style={styles.sliderLabel}>Max: {availableTct.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT (${(availableTct * TCT_TO_USD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</Text>
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
                  ? "Start the match immediately when opponent accepts"
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
              {/* Date Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setShowDateDropdown(!showDateDropdown);
                    setShowTimeDropdown(false);
                  }}
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
                  <Text style={styles.dropdownArrow}>{showDateDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showDateDropdown && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                    {Array.from({ length: 14 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() + i);
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.dropdownItem,
                            scheduledDate.toDateString() === date.toDateString() && styles.dropdownItemActive,
                          ]}
                          onPress={() => {
                            const newDate = new Date(scheduledDate);
                            newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                            setScheduledDate(newDate);
                            setShowDateDropdown(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              scheduledDate.toDateString() === date.toDateString() && styles.dropdownItemTextActive,
                            ]}
                          >
                            {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              {/* Time Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setShowTimeDropdown(!showTimeDropdown);
                    setShowDateDropdown(false);
                  }}
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
                  <Text style={styles.dropdownArrow}>{showTimeDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showTimeDropdown && (
                  <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                    {Array.from({ length: 48 }, (_, i) => {
                      const hour = Math.floor(i / 2);
                      const minute = (i % 2) * 30;
                      const timeLabel = `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${minute.toString().padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
                      const isSelected = scheduledDate.getHours() === hour && scheduledDate.getMinutes() === minute;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemActive,
                          ]}
                          onPress={() => {
                            const newDate = new Date(scheduledDate);
                            newDate.setHours(hour, minute, 0, 0);
                            setScheduledDate(newDate);
                            setShowTimeDropdown(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextActive,
                            ]}
                          >
                            {timeLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
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
            <Text style={styles.summaryLabel}>Platform Fee ({rakePercentDisplay}%):</Text>
            <Text style={styles.summaryValue}>
              {usdToTCT(selectedWager * 2 * rakeRate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($
              {(selectedWager * 2 * rakeRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowHighlight]}>
            <Text style={styles.summaryLabelHighlight}>Winner Gets:</Text>
            <Text style={styles.summaryValueHighlight}>
              {usdToTCT(selectedWager * 2 * (1 - rakeRate)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} $TCT ($
              {(selectedWager * 2 * (1 - rakeRate)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </Text>
          </View>
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

        <TouchableOpacity
          style={[
            styles.challengeButton,
            isSubmitting && styles.challengeButtonDisabled,
          ]}
          onPress={handleChallengeNow}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#0F0F1E" />
          ) : (
            <Swords size={20} color="#0F0F1E" />
          )}
          <Text style={styles.challengeButtonText}>
            {isSubmitting ? "Creating Challenge..." : "Challenge Now"}
          </Text>
        </TouchableOpacity>
      </ScrollView>

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
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginTop: 4,
  },
  opponentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  opponentAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  opponentInfo: {
    flex: 1,
  },
  opponentName: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  opponentRating: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FFD700",
  },
  opponentFlag: {
    fontSize: 32,
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
  optionText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  optionTextActive: {
    color: "#FFD700",
    fontWeight: "700" as const,
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
  challengeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    paddingVertical: 18,
    borderRadius: 12,
  },
  challengeButtonText: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#0F0F1E",
  },
  challengeButtonDisabled: {
    opacity: 0.7,
    backgroundColor: "#C9A900",
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
  balanceInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  balanceLabel: {
    fontSize: 14,
    color: "#4ECDC4",
    fontWeight: "600" as const,
  },
  balanceValue: {
    fontSize: 14,
    color: "#4ECDC4",
    fontWeight: "700" as const,
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
  schedulerContainer: {
    marginTop: 16,
    gap: 12,
  },
  dropdownContainer: {
    position: "relative",
    zIndex: 10,
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
  dropdownArrow: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  dropdownList: {
    maxHeight: 200,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
  },
  dropdownItemText: {
    fontSize: 15,
    color: "#FFFFFF",
  },
  dropdownItemTextActive: {
    color: "#FFD700",
    fontWeight: "600" as const,
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
});
