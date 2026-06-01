/**
 * Admin House Challenges Screen
 *
 * Manage house challenges:
 * - View all challenges with stats
 * - Create new challenges
 * - Edit/Delete existing challenges
 * - View attempt history
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { supabase } from "@/lib/supabase";
import {
  HouseChallengeService,
  createHouseChallengeService,
} from "@/lib/houseChallenges";
import type {
  HouseChallenge,
  HouseChallengeAttempt,
  CreateHouseChallengeInput,
  UpdateHouseChallengeInput,
  DifficultyLabel,
  AIDifficultyLevel,
  ChallengeObjectiveType,
  PlayerColor,
  HouseChallengeStats,
} from "@/types/houseChallenge";
import { useAuth } from "@/hooks/useAuth";
import { getDifficultyColor, getObjectiveDescription } from "@/types/houseChallenge";

// ============================================================================
// Types
// ============================================================================

type TabType = "challenges" | "attempts" | "stats";

// ============================================================================
// Constants
// ============================================================================

const DIFFICULTY_OPTIONS: DifficultyLabel[] = ["Easy", "Medium", "Hard", "Expert"];
const AI_DIFFICULTY_OPTIONS: AIDifficultyLevel[] = ["beginner", "easy", "medium", "hard", "expert"];
const OBJECTIVE_TYPE_OPTIONS: { value: ChallengeObjectiveType; label: string }[] = [
  { value: "checkmate_in_moves", label: "Checkmate in X moves" },
  { value: "checkmate_with_piece", label: "Checkmate with piece" },
  { value: "sacrifice_queen", label: "Sacrifice queen" },
  { value: "smothered_mate", label: "Smothered mate" },
  { value: "back_rank_mate", label: "Back rank mate" },
  { value: "promotion_mate", label: "Promotion mate" },
];
const PLAYER_COLOR_OPTIONS: PlayerColor[] = ["white", "black", "random"];

// ============================================================================
// Date Picker Component
// ============================================================================

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
}

function DatePicker({ value, onChange, placeholder = "Select date" }: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  // Parse initial value
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setSelectedYear(date.getFullYear());
        setSelectedMonth(date.getMonth());
      }
    }
  }, [value]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => null);
  const allDays = [...emptyDays, ...days];

  const handleSelectDate = (day: number) => {
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(dateStr);
    setShowPicker(false);
  };

  const handleClear = () => {
    onChange("");
    setShowPicker(false);
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const formatDisplayValue = (val: string) => {
    if (!val) return placeholder;
    const date = new Date(val);
    if (isNaN(date.getTime())) return val;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isSelectedDay = (day: number) => {
    if (!value) return false;
    const selectedDate = new Date(value);
    return (
      selectedDate.getFullYear() === selectedYear &&
      selectedDate.getMonth() === selectedMonth &&
      selectedDate.getDate() === day
    );
  };

  return (
    <>
      <TouchableOpacity
        style={datePickerStyles.input}
        onPress={() => setShowPicker(true)}
      >
        <Text style={[datePickerStyles.inputText, !value && datePickerStyles.placeholder]}>
          {formatDisplayValue(value)}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#FFD700" />
      </TouchableOpacity>

      <Modal visible={showPicker} animationType="fade" transparent>
        <TouchableOpacity
          style={datePickerStyles.overlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={datePickerStyles.container}>
            {/* Header with month/year navigation */}
            <View style={datePickerStyles.header}>
              <TouchableOpacity onPress={goToPrevMonth} style={datePickerStyles.navButton}>
                <Ionicons name="chevron-back" size={24} color="#FFD700" />
              </TouchableOpacity>
              <Text style={datePickerStyles.monthYearText}>
                {months[selectedMonth]} {selectedYear}
              </Text>
              <TouchableOpacity onPress={goToNextMonth} style={datePickerStyles.navButton}>
                <Ionicons name="chevron-forward" size={24} color="#FFD700" />
              </TouchableOpacity>
            </View>

            {/* Day of week headers */}
            <View style={datePickerStyles.weekHeader}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={datePickerStyles.weekDay}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={datePickerStyles.grid}>
              {allDays.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    datePickerStyles.dayCell,
                    day !== null && isSelectedDay(day) && datePickerStyles.selectedDay,
                  ]}
                  onPress={() => day !== null && handleSelectDate(day)}
                  disabled={day === null}
                >
                  {day !== null && (
                    <Text
                      style={[
                        datePickerStyles.dayText,
                        isSelectedDay(day) && datePickerStyles.selectedDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={datePickerStyles.actions}>
              <TouchableOpacity style={datePickerStyles.clearButton} onPress={handleClear}>
                <Text style={datePickerStyles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={datePickerStyles.todayButton}
                onPress={() => {
                  const today = new Date();
                  setSelectedYear(today.getFullYear());
                  setSelectedMonth(today.getMonth());
                  handleSelectDate(today.getDate());
                }}
              >
                <Text style={datePickerStyles.todayButtonText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={datePickerStyles.closeButton}
                onPress={() => setShowPicker(false)}
              >
                <Text style={datePickerStyles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const datePickerStyles = StyleSheet.create({
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  inputText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  placeholder: {
    color: "#666",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 340,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  weekHeader: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  selectedDay: {
    backgroundColor: "#FFD700",
  },
  dayText: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  selectedDayText: {
    color: "#0F0F1E",
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  todayButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(74, 222, 128, 0.15)",
    alignItems: "center",
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4ADE80",
  },
  closeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

// ============================================================================
// Components
// ============================================================================

function StatusBadge({ isActive, status }: { isActive: boolean; status: string }) {
  const color = isActive && status === "active" ? "#4ADE80" : "#A0A0A0";
  const label = isActive && status === "active" ? "Active" : status;

  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Create/Edit Challenge Modal
// ============================================================================

interface ChallengeFormModalProps {
  visible: boolean;
  challenge?: HouseChallenge | null;
  onClose: () => void;
  onSave: (data: CreateHouseChallengeInput | UpdateHouseChallengeInput) => Promise<void>;
}

function ChallengeFormModal({ visible, challenge, onClose, onSave }: ChallengeFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryFee, setEntryFee] = useState("0");
  const [prizeMultiplier, setPrizeMultiplier] = useState("2.0");
  const [difficulty, setDifficulty] = useState<DifficultyLabel>("Medium");
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficultyLevel>("medium");
  const [timeLimit, setTimeLimit] = useState("300");
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  const [objectiveType, setObjectiveType] = useState<ChallengeObjectiveType>("checkmate_in_moves");
  const [objectiveValue, setObjectiveValue] = useState("4");
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState("");
  const [maxEntriesPerUserPerMonth, setMaxEntriesPerUserPerMonth] = useState("");
  const [maxTotalEntries, setMaxTotalEntries] = useState("");
  const [attemptsPerEntry, setAttemptsPerEntry] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (challenge) {
      setName(challenge.name);
      setDescription(challenge.description);
      setEntryFee(challenge.entry_fee_tct.toString());
      setPrizeMultiplier(challenge.prize_multiplier.toString());
      setDifficulty(challenge.difficulty);
      setAiDifficulty(challenge.ai_difficulty);
      setTimeLimit(challenge.time_limit_seconds.toString());
      setPlayerColor(challenge.player_color);
      setObjectiveType(challenge.objective_type);
      setObjectiveValue(challenge.objective_value);
      setMaxEntriesPerUser(challenge.max_entries_per_user?.toString() || "");
      setMaxEntriesPerUserPerMonth(challenge.max_entries_per_user_per_month?.toString() || "");
      setMaxTotalEntries(challenge.max_total_entries?.toString() || "");
      setAttemptsPerEntry(challenge.attempts_per_entry?.toString() || "1");
      setStartDate(challenge.start_date ? challenge.start_date.split("T")[0] : "");
      setEndDate(challenge.end_date ? challenge.end_date.split("T")[0] : "");
      setIsActive(challenge.is_active);
    } else {
      // Reset form
      setName("");
      setDescription("");
      setEntryFee("0");
      setPrizeMultiplier("2.0");
      setDifficulty("Medium");
      setAiDifficulty("medium");
      setTimeLimit("300");
      setPlayerColor("white");
      setObjectiveType("checkmate_in_moves");
      setObjectiveValue("4");
      setMaxEntriesPerUser("");
      setMaxEntriesPerUserPerMonth("");
      setMaxTotalEntries("");
      setAttemptsPerEntry("1");
      setStartDate("");
      setEndDate("");
      setIsActive(true);
    }
  }, [challenge, visible]);

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) {
      Alert.alert("Error", "Name and description are required");
      return;
    }

    setIsSaving(true);
    try {
      const data: CreateHouseChallengeInput = {
        name: name.trim(),
        description: description.trim(),
        entry_fee_tct: parseFloat(entryFee) || 0,
        prize_multiplier: parseFloat(prizeMultiplier) || 2.0,
        difficulty,
        ai_difficulty: aiDifficulty,
        time_limit_seconds: parseInt(timeLimit) || 300,
        player_color: playerColor,
        objective_type: objectiveType,
        objective_value: objectiveValue,
        max_entries_per_user: maxEntriesPerUser ? parseInt(maxEntriesPerUser) : null,
        max_entries_per_user_per_month: maxEntriesPerUserPerMonth ? parseInt(maxEntriesPerUserPerMonth) : null,
        max_total_entries: maxTotalEntries ? parseInt(maxTotalEntries) : null,
        attempts_per_entry: parseInt(attemptsPerEntry) || 1,
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: isActive,
      };
      await onSave(data);
      onClose();
    } catch (error) {
      Alert.alert("Error", "Failed to save challenge");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {challenge ? "Edit Challenge" : "Create Challenge"}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={styles.formInput}
                value={name}
                onChangeText={setName}
                placeholder="Challenge name"
                placeholderTextColor="#666"
              />
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Challenge description"
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Entry Fee */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Entry Fee (TCT)</Text>
                <TextInput
                  style={styles.formInput}
                  value={entryFee}
                  onChangeText={setEntryFee}
                  placeholder="0"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.formLabel}>Prize Multiplier</Text>
                <TextInput
                  style={styles.formInput}
                  value={prizeMultiplier}
                  onChangeText={setPrizeMultiplier}
                  placeholder="2.0"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Attempts Per Entry - Pay once, get multiple tries */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>🎟️ Attempts Per Entry Fee</Text>
              <TextInput
                style={styles.formInput}
                value={attemptsPerEntry}
                onChangeText={setAttemptsPerEntry}
                placeholder="1"
                placeholderTextColor="#666"
                keyboardType="numeric"
              />
              <Text style={styles.formHint}>
                How many tries does 1 payment give? (e.g., 3 = pay once, get 3 attempts)
              </Text>
            </View>

            {/* Difficulty */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Display Difficulty</Text>
              <View style={styles.optionsRow}>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.optionButton,
                      difficulty === d && styles.optionButtonActive,
                      difficulty === d && { borderColor: getDifficultyColor(d) },
                    ]}
                    onPress={() => setDifficulty(d)}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        difficulty === d && { color: getDifficultyColor(d) },
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* AI Difficulty */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>AI Difficulty (Engine)</Text>
              <View style={styles.optionsRow}>
                {AI_DIFFICULTY_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.optionButton,
                      aiDifficulty === d && styles.optionButtonActive,
                    ]}
                    onPress={() => setAiDifficulty(d)}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        aiDifficulty === d && styles.optionButtonTextActive,
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Time Limit */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Game Time Limit (seconds)</Text>
              <TextInput
                style={styles.formInput}
                value={timeLimit}
                onChangeText={setTimeLimit}
                placeholder="300"
                placeholderTextColor="#666"
                keyboardType="numeric"
              />
              <Text style={styles.formHint}>e.g. 300 = 5 minutes, 600 = 10 minutes</Text>
            </View>

            {/* Attempt Limits */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Max Total Attempts</Text>
                <TextInput
                  style={styles.formInput}
                  value={maxEntriesPerUser}
                  onChangeText={setMaxEntriesPerUser}
                  placeholder="∞"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>Per user lifetime</Text>
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.formLabel}>Monthly Attempts</Text>
                <TextInput
                  style={styles.formInput}
                  value={maxEntriesPerUserPerMonth}
                  onChangeText={setMaxEntriesPerUserPerMonth}
                  placeholder="∞"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>Resets each month</Text>
              </View>
            </View>

            {/* Global limit */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Max Total Entries (all users)</Text>
              <TextInput
                style={styles.formInput}
                value={maxTotalEntries}
                onChangeText={setMaxTotalEntries}
                placeholder="∞ Unlimited"
                placeholderTextColor="#666"
                keyboardType="numeric"
              />
              <Text style={styles.formHint}>Limit total attempts across all users</Text>
            </View>

            {/* Availability Dates */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.formLabel}>Start Date</Text>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Select start date"
                />
                <Text style={styles.formHint}>Leave empty = available now</Text>
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.formLabel}>End Date (Expiry)</Text>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Select end date"
                />
                <Text style={styles.formHint}>Leave empty = no expiry</Text>
              </View>
            </View>

            {/* Player Color */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Player Color</Text>
              <View style={styles.optionsRow}>
                {PLAYER_COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.optionButton,
                      playerColor === c && styles.optionButtonActive,
                    ]}
                    onPress={() => setPlayerColor(c)}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        playerColor === c && styles.optionButtonTextActive,
                      ]}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Objective Type */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Objective Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.optionsRow}>
                  {OBJECTIVE_TYPE_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[
                        styles.optionButton,
                        objectiveType === o.value && styles.optionButtonActive,
                      ]}
                      onPress={() => setObjectiveType(o.value)}
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          objectiveType === o.value && styles.optionButtonTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Objective Value */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                Objective Value{" "}
                {objectiveType === "checkmate_in_moves" && "(moves)"}
                {objectiveType === "checkmate_with_piece" && "(p/n/b/r/q)"}
              </Text>
              <TextInput
                style={styles.formInput}
                value={objectiveValue}
                onChangeText={setObjectiveValue}
                placeholder={
                  objectiveType === "checkmate_in_moves" ? "4" :
                  objectiveType === "checkmate_with_piece" ? "n" : "value"
                }
                placeholderTextColor="#666"
              />
            </View>

            {/* Active Toggle */}
            <View style={styles.formGroup}>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setIsActive(!isActive)}
              >
                <View
                  style={[
                    styles.toggle,
                    isActive && styles.toggleActive,
                  ]}
                >
                  {isActive && <Ionicons name="checkmark" size={16} color="#0F0F1E" />}
                </View>
                <Text style={styles.toggleLabel}>Active (visible to users)</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#0F0F1E" />
            ) : (
              <Text style={styles.saveButtonText}>
                {challenge ? "Save Changes" : "Create Challenge"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// Tutorial Modal - Step-by-step guide for admins
// ============================================================================

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

function TutorialModal({ visible, onClose }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "👋 Welcome to House Challenges!",
      icon: "flash",
      content: `House Challenges let players compete against AI for prizes!

🎯 How it works:
• Players pay an entry fee (in TCT)
• They play against an AI opponent
• If they complete the objective, they win!
• Winners get their entry fee × multiplier

Example:
Entry fee = 100 TCT
Multiplier = 2x
Winner gets = 200 TCT 🎉`,
    },
    {
      title: "➕ Creating a Challenge",
      icon: "add-circle",
      content: `Tap the yellow "Create Challenge" button to start!

📝 Required fields:
• Name - Give it a catchy name
  Example: "Knight's Gambit"

• Description - Explain the challenge
  Example: "Checkmate with a knight in under 10 moves!"

• Entry Fee - How much to play (in TCT)
  Example: 50, 100, 250, 500

• Prize Multiplier - What winners get
  Example: 2.0 = double their entry`,
    },
    {
      title: "🤖 Setting AI Difficulty",
      icon: "hardware-chip",
      content: `Choose how smart the AI should be:

Display Difficulty (shown to players):
• Easy - For beginners
• Medium - Average players
• Hard - Experienced players
• Expert - Chess masters only!

AI Engine Level (actual strength):
• beginner - Makes many mistakes
• easy - Makes some mistakes
• medium - Plays decently
• hard - Strong play
• expert - Very strong!

💡 Tip: Match display & engine difficulty!`,
    },
    {
      title: "🎟️ Attempts Per Entry Fee",
      icon: "ticket",
      content: `⭐ IMPORTANT: One payment = multiple tries!

When a player pays the entry fee, they get MULTIPLE attempts to complete the challenge!

HOW IT WORKS:
1. Player pays entry fee (e.g., 100 TCT)
2. Player gets X attempts (you decide!)
3. If they fail, they can try again FREE
4. Only pay again after all attempts used

SETTING IT UP:
• Find "Attempts Per Entry Fee" field
• Enter a number (default is 1)

EXAMPLES:

Attempts = 1 (strict)
Pay 100 TCT → get 1 try
Fail? Pay again for another try.

Attempts = 3 (generous)
Pay 100 TCT → get 3 tries!
Fail first try? 2 more FREE attempts!

Attempts = 5 (very generous)
Pay 100 TCT → get 5 tries!
Great for harder challenges.

💡 Tip: Harder objectives should give more attempts!
• Easy objective: 1-2 attempts
• Medium objective: 3 attempts
• Hard objective: 4-5 attempts`,
    },
    {
      title: "⏱️ Time & Limits",
      icon: "timer",
      content: `Control how long and who can play:

Game Time (seconds):
• 180 = 3 minutes (fast!)
• 300 = 5 minutes (standard)
• 600 = 10 minutes (relaxed)

Max Total Attempts:
How many times ONE player can try ever
• Example: 3 = each player gets 3 tries total

Monthly Attempts:
Resets every month!
• Example: 5 = each player gets 5 tries per month

Leave empty = unlimited tries ∞`,
    },
    {
      title: "🎯 OBJECTIVES - The Heart of Challenges!",
      icon: "flag",
      content: `⭐ THIS IS THE MOST IMPORTANT PART! ⭐

The objective is what the player MUST DO to win the prize. No objective met = no prize!

Think of it like a mission:
"Your mission: Checkmate the AI using only your knight!"

Without an objective, it's just a normal chess game. The objective makes it a CHALLENGE!

There are 6 objective types:
1. Checkmate in X moves
2. Checkmate with specific piece
3. Sacrifice your queen
4. Smothered mate
5. Back rank mate
6. Promotion mate

Let's learn each one... →`,
    },
    {
      title: "🏃 Objective: Checkmate in X Moves",
      icon: "speedometer",
      content: `The player must WIN within a certain number of moves.

HOW IT WORKS:
• You set a move limit
• Player must checkmate BEFORE that limit
• If they take too many moves = LOSE

SETTING IT UP:
• Objective Type: "Checkmate in X moves"
• Objective Value: Enter a number

EXAMPLES:

Easy Challenge:
Value: "20" = Win in 20 moves or less
(Plenty of time, good for beginners)

Medium Challenge:
Value: "10" = Win in 10 moves or less
(Need to play efficiently)

Hard Challenge:
Value: "5" = Win in 5 moves or less
(Very difficult! Scholar's mate territory)

Expert Challenge:
Value: "4" = Win in 4 moves or less
(Nearly impossible without traps!)

💡 Tip: Start with 15-20 moves for new challenges`,
    },
    {
      title: "♞ Objective: Checkmate with Piece",
      icon: "trophy",
      content: `The player must deliver checkmate using a SPECIFIC piece!

HOW IT WORKS:
• You choose which piece must give checkmate
• Player can use any strategy
• But the FINAL checkmate must be with that piece

SETTING IT UP:
• Objective Type: "Checkmate with piece"
• Objective Value: Use these letters:

  "q" = Queen ♛
  "r" = Rook ♜
  "b" = Bishop ♝
  "n" = Knight ♞
  "p" = Pawn ♟ (rare!)

DIFFICULTY RANKING:
Easiest → Hardest

♛ Queen (q) - Easiest, most powerful
♜ Rook (r) - Easy, strong piece
♝ Bishop (b) - Medium, diagonal only
♞ Knight (n) - Hard, tricky movement
♟ Pawn (p) - Expert, very rare!

EXAMPLE:
Type: "Checkmate with piece"
Value: "n"
= Player must checkmate with a KNIGHT!`,
    },
    {
      title: "👑 Objective: Sacrifice Queen",
      icon: "star",
      content: `The player must GIVE AWAY their queen AND still win!

HOW IT WORKS:
• Player must intentionally lose their queen
• The queen must be captured by opponent
• Then player must STILL checkmate
• Both conditions must be met!

SETTING IT UP:
• Objective Type: "Sacrifice queen"
• Objective Value: Leave empty or "true"

WHY IT'S SPECIAL:
The queen is the most powerful piece!
Winning without it shows true skill.

EXAMPLE SCENARIO:
1. Player moves queen to risky square
2. AI captures the queen
3. Player continues without queen
4. Player checkmates AI
5. 🎉 OBJECTIVE MET!

If player wins but queen wasn't captured:
❌ OBJECTIVE NOT MET (no prize)

DIFFICULTY: ⭐⭐⭐⭐ (Hard)
The AI must actually take the queen!`,
    },
    {
      title: "🐴 Objective: Smothered Mate",
      icon: "flash",
      content: `A beautiful chess pattern! Knight delivers checkmate while king is trapped by its OWN pieces.

HOW IT WORKS:
• The enemy king must be surrounded
• Surrounded by its OWN pieces (not yours!)
• Your KNIGHT delivers the final checkmate
• King has nowhere to escape

SETTING IT UP:
• Objective Type: "Smothered mate"
• Objective Value: Leave empty or "true"

WHAT IT LOOKS LIKE:
    ♜ ♞ ♜
    ♟ ♚ ♟
      ♞ ← Your knight here = checkmate!
        (King can't move anywhere!)

FAMOUS EXAMPLE:
"Philidor's Legacy" - A classic smothered mate pattern that's been known for centuries!

DIFFICULTY: ⭐⭐⭐⭐⭐ (Expert)
Very hard to force! The AI must cooperate by blocking its own king.

💡 Best with: Lower AI difficulty so patterns are possible`,
    },
    {
      title: "🏰 Objective: Back Rank Mate",
      icon: "shield",
      content: `Checkmate the king on its starting row (the back rank)!

HOW IT WORKS:
• Enemy king is on the back row (rank 1 or 8)
• King is trapped by its own pawns
• Your rook or queen delivers checkmate

SETTING IT UP:
• Objective Type: "Back rank mate"
• Objective Value: Leave empty or "true"

WHAT IT LOOKS LIKE:
♜ . . . ♚ . . ♜  ← King on back rank
♟ ♟ ♟ . . ♟ ♟ ♟  ← Pawns block escape
. . . . ♖ . . .  ← Your rook = checkmate!

WHY IT HAPPENS:
Players often forget to give their king an escape square ("luft"). The pawns become a prison!

DIFFICULTY: ⭐⭐⭐ (Medium)
Common pattern, but requires good tactics.

💡 Tip: Works great with AI that doesn't castle early or create escape squares`,
    },
    {
      title: "⬆️ Objective: Promotion Mate",
      icon: "arrow-up-circle",
      content: `Checkmate using a pawn that just promoted!

HOW IT WORKS:
• Move a pawn to the last rank
• Promote it to any piece (usually queen)
• That NEW piece must give checkmate
• Must be in the SAME move or very soon after

SETTING IT UP:
• Objective Type: "Promotion mate"
• Objective Value: Leave empty or "true"

THE JOURNEY:
♟ → ♟ → ♟ → ♟ → ♛ → CHECKMATE!
(Pawn travels across the board, becomes queen, wins!)

WHY IT'S COOL:
The weakest piece becomes the hero!
From humble pawn to match-winning queen.

DIFFICULTY: ⭐⭐⭐⭐ (Hard)
Requires:
• Getting a pawn to the end
• Perfect timing for the checkmate
• Protecting the pawn's journey

💡 Best with: Longer time limits to allow pawn advancement`,
    },
    {
      title: "🎓 Choosing the Right Objective",
      icon: "bulb",
      content: `Match objectives to your target players!

FOR BEGINNERS (Easy prizes):
• Checkmate in 20+ moves
• Checkmate with queen
• Back rank mate
Entry fee: Lower (50-100 TCT)
AI: beginner or easy

FOR INTERMEDIATE:
• Checkmate in 10-15 moves
• Checkmate with rook or bishop
Entry fee: Medium (100-250 TCT)
AI: easy or medium

FOR ADVANCED:
• Checkmate in 5-10 moves
• Checkmate with knight
• Queen sacrifice
Entry fee: Higher (250-500 TCT)
AI: medium or hard

FOR EXPERTS ONLY:
• Checkmate in 4-5 moves
• Smothered mate
• Promotion mate
Entry fee: Premium (500+ TCT)
AI: hard or expert

⚠️ IMPORTANT:
Harder objectives = Fewer winners = More profit
But too hard = Players stop trying!

Find the sweet spot! 🎯`,
    },
    {
      title: "♟️ Player Color",
      icon: "contrast",
      content: `Choose which color the player uses:

⬜ White - Player moves first
⬛ Black - AI moves first
🔀 Random - 50/50 chance each game

💡 Tips:
• White is easier (moves first)
• Black is harder (reacts to AI)
• Random adds excitement!`,
    },
    {
      title: "📅 Start & End Dates",
      icon: "calendar",
      content: `Make challenges available for limited time!

Start Date:
When the challenge becomes available
• Leave empty = available immediately

End Date (Expiry):
When the challenge ends
• Leave empty = never expires

Format: YYYY-MM-DD
Example: 2026-03-01

💡 Great for:
• Holiday events
• Weekend specials
• Monthly tournaments`,
    },
    {
      title: "✏️ Editing & Deleting",
      icon: "create",
      content: `Managing existing challenges:

To EDIT a challenge:
1. Find it in the Challenges tab
2. Tap the blue "Edit" button
3. Change what you need
4. Tap "Save Changes"

To DELETE a challenge:
1. Tap the red "Delete" button
2. Confirm in the popup
3. Challenge is archived (not truly deleted)

⚠️ Note: Players who already started won't lose their progress!`,
    },
    {
      title: "📊 Viewing Results",
      icon: "bar-chart",
      content: `Track how your challenges perform!

ATTEMPTS Tab:
See every player attempt with:
• Who played (username)
• Won or Lost
• Moves they made
• If they met the objective
• Payout status

STATS Tab:
See the big picture:
• Total challenges created
• How many attempts
• Win rate (% of winners)
• Money collected
• Money paid out
• Net profit/loss`,
    },
    {
      title: "🚀 Quick Start Example",
      icon: "rocket",
      content: `Let's create a simple challenge!

Name: "Quick Knight Mate"
Description: "Checkmate with a knight!"
Entry Fee: 100 TCT
Prize Multiplier: 2.0
Difficulty: Medium
AI Difficulty: easy
Time: 300 (5 min)
Player Color: white
Objective: Checkmate with piece
Value: n (knight)
Active: ✓

That's it! Players pay 100 TCT, win 200 TCT if they checkmate with a knight! 🎉`,
    },
  ];

  const currentStepData = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (!isLastStep) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (!isFirstStep) setCurrentStep(currentStep - 1);
  };

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={tutorialStyles.overlay}>
        <View style={tutorialStyles.container}>
          {/* Header */}
          <View style={tutorialStyles.header}>
            <View style={tutorialStyles.iconContainer}>
              <Ionicons name={currentStepData.icon as any} size={32} color="#FFD700" />
            </View>
            <TouchableOpacity style={tutorialStyles.closeButton} onPress={handleClose}>
              <Ionicons name="close" size={24} color="#A0A0A0" />
            </TouchableOpacity>
          </View>

          {/* Progress dots */}
          <View style={tutorialStyles.progressContainer}>
            {steps.map((_, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  tutorialStyles.progressDot,
                  index === currentStep && tutorialStyles.progressDotActive,
                  index < currentStep && tutorialStyles.progressDotCompleted,
                ]}
                onPress={() => setCurrentStep(index)}
              />
            ))}
          </View>

          {/* Title */}
          <Text style={tutorialStyles.title}>{currentStepData.title}</Text>

          {/* Content */}
          <ScrollView style={tutorialStyles.contentScroll} showsVerticalScrollIndicator={false}>
            <Text style={tutorialStyles.content}>{currentStepData.content}</Text>
          </ScrollView>

          {/* Step counter */}
          <Text style={tutorialStyles.stepCounter}>
            Step {currentStep + 1} of {steps.length}
          </Text>

          {/* Navigation buttons */}
          <View style={tutorialStyles.navigation}>
            <TouchableOpacity
              style={[tutorialStyles.navButton, isFirstStep && tutorialStyles.navButtonDisabled]}
              onPress={handlePrev}
              disabled={isFirstStep}
            >
              <Ionicons name="chevron-back" size={20} color={isFirstStep ? "#444" : "#fff"} />
              <Text style={[tutorialStyles.navButtonText, isFirstStep && tutorialStyles.navButtonTextDisabled]}>
                Back
              </Text>
            </TouchableOpacity>

            {isLastStep ? (
              <TouchableOpacity style={tutorialStyles.doneButton} onPress={handleClose}>
                <Text style={tutorialStyles.doneButtonText}>Got it!</Text>
                <Ionicons name="checkmark-circle" size={20} color="#0F0F1E" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={tutorialStyles.nextButton} onPress={handleNext}>
                <Text style={tutorialStyles.nextButtonText}>Next</Text>
                <Ionicons name="chevron-forward" size={20} color="#0F0F1E" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const tutorialStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "#1A1A2E",
    borderRadius: 24,
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  progressDotActive: {
    backgroundColor: "#FFD700",
    width: 24,
  },
  progressDotCompleted: {
    backgroundColor: "#4ADE80",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 16,
    textAlign: "center",
  },
  contentScroll: {
    maxHeight: 300,
    marginBottom: 16,
  },
  content: {
    fontSize: 14,
    color: "#E0E0E0",
    lineHeight: 22,
  },
  stepCounter: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  navigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  navButtonTextDisabled: {
    color: "#666",
  },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFD700",
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  doneButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#4ADE80",
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F0F1E",
  },
});

// ============================================================================
// Main Screen
// ============================================================================

export default function AdminHouseChallengesScreen() {
  return (
    <AdminGate featureName="House Challenges" requireSuperAdmin>
      <AdminHouseChallengesContent />
    </AdminGate>
  );
}

function AdminHouseChallengesContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [service, setService] = useState<HouseChallengeService | null>(null);
  const [challenges, setChallenges] = useState<HouseChallenge[]>([]);
  const [attempts, setAttempts] = useState<HouseChallengeAttempt[]>([]);
  const [stats, setStats] = useState<HouseChallengeStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>("challenges");

  // Modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<HouseChallenge | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // Initialize service
  useEffect(() => {
    if (profile?.id) {
      setService(createHouseChallengeService(profile.id));
    }
  }, [profile?.id]);

  // Load data
  const loadData = useCallback(async () => {
    if (!service) return;

    setIsLoading(true);
    setError(null);

    try {
      const [challengesData, attemptsData, statsData] = await Promise.all([
        service.getAllChallenges(),
        service.getAllAttempts(undefined, 100),
        service.getChallengeStats(),
      ]);

      setChallenges(challengesData);
      setAttempts(attemptsData);
      setStats(statsData);
    } catch (err: any) {
      console.error("[AdminHouseChallenges] Error loading data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create challenge
  const handleCreateChallenge = async (data: CreateHouseChallengeInput) => {
    if (!service) return;

    const result = await service.createChallenge(data);
    if (result) {
      Alert.alert("Success", "Challenge created successfully");
      loadData();
    } else {
      throw new Error("Failed to create challenge");
    }
  };

  // Update challenge
  const handleUpdateChallenge = async (data: UpdateHouseChallengeInput) => {
    if (!service || !editingChallenge) return;

    const result = await service.updateChallenge(editingChallenge.id, data);
    if (result) {
      Alert.alert("Success", "Challenge updated successfully");
      loadData();
    } else {
      throw new Error("Failed to update challenge");
    }
  };

  // Delete challenge
  const handleDeleteChallenge = (challenge: HouseChallenge) => {
    Alert.alert(
      "Delete Challenge",
      `Are you sure you want to delete "${challenge.name}"? This will archive the challenge.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!service) return;
            const success = await service.deleteChallenge(challenge.id);
            if (success) {
              Alert.alert("Success", "Challenge archived");
              loadData();
            } else {
              Alert.alert("Error", "Failed to delete challenge");
            }
          },
        },
      ]
    );
  };

  // Render challenge card
  const renderChallenge = useCallback(
    ({ item }: { item: HouseChallenge }) => {
      const winRate = item.total_attempts > 0
        ? ((item.total_wins / item.total_attempts) * 100).toFixed(1)
        : "0";

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.challengeName}>{item.name}</Text>
              <Text style={styles.challengeDescription} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
            <StatusBadge isActive={item.is_active} status={item.status} />
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={14} color="#FFD700" />
              <Text style={styles.detailTextGold}>
                {item.entry_fee_tct.toLocaleString()} TCT
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="trophy-outline" size={14} color="#4ADE80" />
              <Text style={styles.detailText}>{item.prize_multiplier}x</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {Math.floor(item.time_limit_seconds / 60)}min
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={14} color="#60A5FA" />
              <Text style={styles.detailTextBlue}>
                {item.max_entries_per_user !== null ? `${item.max_entries_per_user} max` : "Unlimited"}
              </Text>
            </View>
            <View style={[styles.difficultyBadge, { backgroundColor: `${getDifficultyColor(item.difficulty)}20` }]}>
              <Text style={[styles.difficultyText, { color: getDifficultyColor(item.difficulty) }]}>
                {item.difficulty}
              </Text>
            </View>
          </View>

          <View style={styles.cardStats}>
            <Text style={styles.cardStatText}>
              Attempts: <Text style={styles.cardStatValue}>{item.total_attempts}</Text>
            </Text>
            <Text style={styles.cardStatText}>
              Wins: <Text style={styles.cardStatValue}>{item.total_wins}</Text>
            </Text>
            <Text style={styles.cardStatText}>
              Win Rate: <Text style={styles.cardStatValue}>{winRate}%</Text>
            </Text>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                setEditingChallenge(item);
                setShowFormModal(true);
              }}
            >
              <Ionicons name="pencil" size={16} color="#60A5FA" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteChallenge(item)}
            >
              <Ionicons name="trash" size={16} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [service]
  );

  // Render attempt card with full details
  const renderAttempt = useCallback(
    ({ item }: { item: HouseChallengeAttempt }) => {
      const statusColors: Record<string, string> = {
        pending: "#FCD34D",
        in_progress: "#60A5FA",
        won: "#4ADE80",
        lost: "#EF4444",
        forfeited: "#A0A0A0",
        expired: "#A0A0A0",
      };

      const payoutStatusColors: Record<string, string> = {
        none: "#A0A0A0",
        pending: "#FCD34D",
        processing: "#60A5FA",
        completed: "#4ADE80",
        failed: "#EF4444",
      };

      const challenge = (item as any).challenge;
      const user = (item as any).user;

      return (
        <View style={styles.attemptCard}>
          {/* Header with user and status */}
          <View style={styles.attemptHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.attemptChallenge}>
                {challenge?.name || "Unknown Challenge"}
              </Text>
              <Text style={styles.attemptUser}>
                @{user?.username || "unknown"} • {item.player_color}
              </Text>
            </View>
            <View style={[styles.statusBadge, { borderColor: statusColors[item.status] }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] }]} />
              <Text style={[styles.statusBadgeText, { color: statusColors[item.status] }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Game details */}
          <View style={styles.attemptGameDetails}>
            <View style={styles.attemptDetailRow}>
              <Ionicons name="cash-outline" size={14} color="#FFD700" />
              <Text style={styles.attemptDetailLabel}>Entry:</Text>
              <Text style={styles.attemptDetailValue}>{item.entry_fee_paid_tct.toLocaleString()} TCT</Text>
            </View>
            {item.moves_made > 0 && (
              <View style={styles.attemptDetailRow}>
                <Ionicons name="swap-horizontal-outline" size={14} color="#60A5FA" />
                <Text style={styles.attemptDetailLabel}>Moves:</Text>
                <Text style={styles.attemptDetailValue}>{item.moves_made}</Text>
              </View>
            )}
            {item.objective_met !== null && (
              <View style={styles.attemptDetailRow}>
                <Ionicons
                  name={item.objective_met ? "checkmark-circle" : "close-circle"}
                  size={14}
                  color={item.objective_met ? "#4ADE80" : "#EF4444"}
                />
                <Text style={styles.attemptDetailLabel}>Objective:</Text>
                <Text style={[styles.attemptDetailValue, { color: item.objective_met ? "#4ADE80" : "#EF4444" }]}>
                  {item.objective_met ? "Met" : "Not Met"}
                </Text>
              </View>
            )}
            {item.checkmating_piece && (
              <View style={styles.attemptDetailRow}>
                <Ionicons name="ribbon-outline" size={14} color="#A0A0A0" />
                <Text style={styles.attemptDetailLabel}>Mating Piece:</Text>
                <Text style={styles.attemptDetailValue}>{item.checkmating_piece.toUpperCase()}</Text>
              </View>
            )}
            {item.queen_sacrificed && (
              <View style={styles.attemptDetailRow}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.attemptDetailLabel}>Queen Sacrifice:</Text>
                <Text style={[styles.attemptDetailValue, { color: "#FFD700" }]}>Yes</Text>
              </View>
            )}
          </View>

          {/* Payout section (if applicable) */}
          {item.status === "won" && (
            <View style={styles.attemptPayoutSection}>
              <View style={styles.attemptDetailRow}>
                <Ionicons name="trophy" size={14} color="#4ADE80" />
                <Text style={styles.attemptDetailLabel}>Payout:</Text>
                <Text style={[styles.attemptDetailValue, { color: "#4ADE80", fontWeight: "700" }]}>
                  {item.payout_amount_tct?.toLocaleString() || 0} TCT
                </Text>
              </View>
              <View style={styles.attemptDetailRow}>
                <Ionicons name="sync-outline" size={14} color={payoutStatusColors[item.payout_status]} />
                <Text style={styles.attemptDetailLabel}>Payout Status:</Text>
                <Text style={[styles.attemptDetailValue, { color: payoutStatusColors[item.payout_status] }]}>
                  {item.payout_status.toUpperCase()}
                </Text>
              </View>
              {item.payout_tx_hash && (
                <View style={styles.attemptDetailRow}>
                  <Ionicons name="link-outline" size={14} color="#60A5FA" />
                  <Text style={styles.attemptDetailLabel}>TX:</Text>
                  <Text style={[styles.attemptDetailValue, { color: "#60A5FA" }]} numberOfLines={1}>
                    {item.payout_tx_hash.slice(0, 10)}...{item.payout_tx_hash.slice(-8)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Timestamps */}
          <View style={styles.attemptTimestamps}>
            <Text style={styles.attemptTimestamp}>
              Started: {item.game_started_at ? new Date(item.game_started_at).toLocaleString() : "N/A"}
            </Text>
            {item.game_ended_at && (
              <Text style={styles.attemptTimestamp}>
                Ended: {new Date(item.game_ended_at).toLocaleString()}
              </Text>
            )}
          </View>
        </View>
      );
    },
    []
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="flash" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>House Challenges</Text>
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.helpButton}
                onPress={() => setShowTutorial(true)}
              >
                <Ionicons name="help-circle" size={24} color="#FFD700" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={loadData}
                disabled={isLoading}
              >
                <Ionicons
                  name="refresh"
                  size={24}
                  color={isLoading ? "#666" : "#fff"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF453A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabContainer}>
            {(["challenges", "attempts", "stats"] as TabType[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, selectedTab === tab && styles.tabActive]}
                onPress={() => setSelectedTab(tab)}
              >
                <Text
                  style={[styles.tabText, selectedTab === tab && styles.tabTextActive]}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          {isLoading && challenges.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : selectedTab === "challenges" ? (
            <>
              {/* Create Button */}
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => {
                  setEditingChallenge(null);
                  setShowFormModal(true);
                }}
              >
                <Ionicons name="add" size={20} color="#0F0F1E" />
                <Text style={styles.createButtonText}>Create Challenge</Text>
              </TouchableOpacity>

              <FlatList
                data={challenges}
                renderItem={renderChallenge}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="flash-outline" size={48} color="#666" />
                    <Text style={styles.emptyText}>No challenges found</Text>
                  </View>
                }
              />
            </>
          ) : selectedTab === "attempts" ? (
            <FlatList
              data={attempts}
              renderItem={renderAttempt}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="game-controller-outline" size={48} color="#666" />
                  <Text style={styles.emptyText}>No attempts found</Text>
                </View>
              }
            />
          ) : (
            <ScrollView style={styles.statsContainer}>
              {stats && (
                <>
                  <View style={styles.statsRow}>
                    <StatCard label="Total Challenges" value={stats.totalChallenges} />
                    <StatCard label="Active" value={stats.activeChallenges} color="#4ADE80" />
                  </View>
                  <View style={styles.statsRow}>
                    <StatCard label="Total Attempts" value={stats.totalAttempts} />
                    <StatCard label="Total Wins" value={stats.totalWins} color="#4ADE80" />
                  </View>
                  <View style={styles.statsRow}>
                    <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
                    <StatCard label="Fees Collected" value={`${stats.totalFeesCollected.toLocaleString()} TCT`} color="#FFD700" />
                  </View>
                  <View style={styles.statsRow}>
                    <StatCard label="Total Payouts" value={`${stats.totalPayouts.toLocaleString()} TCT`} color="#EF4444" />
                    <StatCard label="Net Revenue" value={`${stats.netRevenue.toLocaleString()} TCT`} color={stats.netRevenue >= 0 ? "#4ADE80" : "#EF4444"} />
                  </View>
                </>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* Form Modal */}
      <ChallengeFormModal
        visible={showFormModal}
        challenge={editingChallenge}
        onClose={() => {
          setShowFormModal(false);
          setEditingChallenge(null);
        }}
        onSave={editingChallenge ? handleUpdateChallenge : handleCreateChallenge}
      />

      {/* Tutorial Modal */}
      <TutorialModal
        visible={showTutorial}
        onClose={() => setShowTutorial(false)}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F0F1E" },
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  helpButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.15)",
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorText: { color: "#FF453A", fontSize: 14, flex: 1 },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  tabText: { fontSize: 14, color: "#A0A0A0", fontWeight: "500" },
  tabTextActive: { color: "#FFD700", fontWeight: "600" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  emptyContainer: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyText: { fontSize: 16, color: "#666" },

  // Create Button
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: { fontSize: 14, fontWeight: "700", color: "#0F0F1E" },

  // Card
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  challengeName: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  challengeDescription: { fontSize: 13, color: "#A0A0A0", marginTop: 4 },
  cardDetails: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { fontSize: 12, color: "#A0A0A0" },
  detailTextGold: { fontSize: 12, color: "#FFD700", fontWeight: "600" },
  detailTextBlue: { fontSize: 12, color: "#60A5FA", fontWeight: "600" },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  difficultyText: { fontSize: 11, fontWeight: "600" },
  cardStats: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  cardStatText: { fontSize: 12, color: "#A0A0A0" },
  cardStatValue: { fontWeight: "600", color: "#FFFFFF" },
  cardActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    paddingVertical: 10,
    borderRadius: 8,
  },
  editButtonText: { fontSize: 13, fontWeight: "600", color: "#60A5FA" },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingVertical: 10,
    borderRadius: 8,
  },
  deleteButtonText: { fontSize: 13, fontWeight: "600", color: "#EF4444" },

  // Status
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: "600" },

  // Attempts
  attemptCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  attemptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  attemptChallenge: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  attemptUser: { fontSize: 12, color: "#A0A0A0", marginTop: 2 },
  attemptGameDetails: {
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  attemptDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attemptDetailLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    width: 80,
  },
  attemptDetailValue: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  attemptPayoutSection: {
    gap: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(74, 222, 128, 0.08)",
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(74, 222, 128, 0.2)",
  },
  attemptTimestamps: {
    gap: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  attemptTimestamp: {
    fontSize: 10,
    color: "#666",
  },
  attemptDetails: { flexDirection: "row", gap: 12 },
  attemptDetailText: { fontSize: 12, color: "#A0A0A0" },

  // Stats
  statsContainer: { flex: 1, paddingHorizontal: 16 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  statLabel: { fontSize: 12, color: "#A0A0A0", marginTop: 4 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  modalBody: { padding: 16, maxHeight: 500 },

  // Form
  formGroup: { marginBottom: 16 },
  formRow: { flexDirection: "row", marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: "600", color: "#A0A0A0", marginBottom: 8 },
  formHint: { fontSize: 11, color: "#666", marginTop: 4, fontStyle: "italic" },
  formInput: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  formTextArea: { minHeight: 80, textAlignVertical: "top" },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  optionButtonActive: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  optionButtonText: { fontSize: 12, color: "#A0A0A0" },
  optionButtonTextActive: { color: "#FFD700", fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  toggleActive: { backgroundColor: "#4ADE80" },
  toggleLabel: { fontSize: 14, color: "#FFFFFF" },
  saveButton: {
    backgroundColor: "#FFD700",
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: "700", color: "#0F0F1E" },
});
