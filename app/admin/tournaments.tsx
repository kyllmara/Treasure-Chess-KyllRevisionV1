/**
 * Admin Tournament Management Screen
 *
 * List, create, edit, start, and cancel tournaments.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/contexts/AuthContext";
import { useTournamentAdmin } from "@/hooks/useTournamentAdmin";
import { formatTournamentStatus, adminCloseTournament } from "@/lib/tournament";
import type { TournamentFrequency } from "@/lib/tournament";
import type { Tournament, TournamentStatus } from "@/lib/tournament.types";

export default function AdminTournamentsScreen() {
  return (
    <AdminGate featureName="Tournament Management">
      <AdminTournamentsContent />
    </AdminGate>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

const STATUS_COLORS: Record<TournamentStatus, string> = {
  draft: "#888",
  registration: "#4CAF82",
  starting: "#FFD700",
  active: "#34C759",
  completed: "#A0A0A0",
  cancelled: "#FF453A",
  closed: "#666",
};

function StatusBadge({ status }: { status: TournamentStatus }) {
  const color = STATUS_COLORS[status] || "#888";
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>
        {formatTournamentStatus(status)}
      </Text>
    </View>
  );
}

// ============================================================================
// Main Content
// ============================================================================

function AdminTournamentsContent() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const adminId = profile?.id || user?.id || "";

  const {
    tournaments,
    isLoading,
    error,
    loadTournaments,
    createTournament,
    startTournament,
    cancelTournament,
    updateTournament,
    isCreating,
    isStarting,
    isCancelling,
    isUpdating,
  } = useTournamentAdmin();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTournament, setEditTournament] = useState<Tournament | null>(null);
  const [filterStatus, setFilterStatus] = useState<TournamentStatus | "all">("all");
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const filteredTournaments = filterStatus === "all"
    ? tournaments
    : tournaments.filter((t) => t.status === filterStatus);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const handleStartTournament = useCallback(
    (tournament: Tournament) => {
      Alert.alert(
        "Start Tournament",
        `Start "${tournament.name}" now? This will seed players and generate the bracket.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start",
            onPress: async () => {
              const result = await startTournament(tournament.id, adminId);
              if (result.success) {
                Alert.alert("Success", "Tournament started successfully.");
              } else {
                Alert.alert("Error", result.error || "Failed to start tournament");
              }
            },
          },
        ]
      );
    },
    [startTournament, adminId]
  );

  const handleCancelTournament = useCallback(
    (tournament: Tournament) => {
      Alert.alert(
        "Cancel Tournament",
        `Cancel "${tournament.name}"? All entry fees will be refunded.`,
        [
          { text: "No", style: "cancel" },
          {
            text: "Cancel Tournament",
            style: "destructive",
            onPress: async () => {
              const result = await cancelTournament(tournament.id, adminId);
              if (result.success) {
                Alert.alert("Success", "Tournament cancelled. Entry fees refunded.");
              } else {
                Alert.alert("Error", result.error || "Failed to cancel tournament");
              }
            },
          },
        ]
      );
    },
    [cancelTournament, adminId]
  );

  const handleCloseTournament = useCallback(
    (tournament: Tournament) => {
      Alert.alert(
        "Close Tournament",
        `Close "${tournament.name}"? Results will no longer be highlighted as recent.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Close",
            onPress: async () => {
              setIsClosing(true);
              const result = await adminCloseTournament(tournament.id);
              setIsClosing(false);
              if (result.success) {
                Alert.alert("Success", "Tournament closed.");
                loadTournaments();
              } else {
                Alert.alert("Error", result.error || "Failed to close tournament");
              }
            },
          },
        ]
      );
    },
    [loadTournaments]
  );

  const handleViewTournament = useCallback(
    (tournament: Tournament) => {
      router.push(`/tournament/${tournament.id}` as any);
    },
    [router]
  );

  // --------------------------------------------------------------------------
  // Tournament Card
  // --------------------------------------------------------------------------

  const renderTournament = useCallback(
    ({ item }: { item: Tournament }) => {
      const canStart = item.status === "registration" && item.current_players >= item.min_players;
      const canCancel = item.status !== "completed" && item.status !== "cancelled";
      const canEdit = item.status === "draft" || item.status === "registration";

      return (
        <TouchableOpacity
          style={styles.tournamentCard}
          onPress={() => handleViewTournament(item)}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.tournamentName} numberOfLines={1}>
              {item.name}
            </Text>
            <StatusBadge status={item.status} />
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {item.current_players}/{item.max_players} players
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {item.entry_fee_tct} TCT entry
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {Math.floor(item.time_control_seconds / 60)}+{item.increment_seconds}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={14} color="#A0A0A0" />
              <Text style={styles.detailText}>
                {new Date(item.start_time).toLocaleString()}
              </Text>
            </View>
          </View>

          {item.prize_pool_tct > 0 && (
            <View style={styles.prizeRow}>
              <Ionicons name="trophy-outline" size={14} color="#FFD700" />
              <Text style={styles.prizeText}>
                {item.prize_pool_tct} TCT prize pool
              </Text>
            </View>
          )}

          <View style={styles.cardActions}>
            {canEdit && (
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => setEditTournament(item)}
              >
                <Ionicons name="create-outline" size={14} color="#FFD700" />
                <Text style={[styles.actionButtonText, { color: "#FFD700" }]}>Edit</Text>
              </TouchableOpacity>
            )}
            {canStart && (
              <TouchableOpacity
                style={[styles.actionButton, styles.startButton]}
                onPress={() => handleStartTournament(item)}
                disabled={isStarting}
              >
                {isStarting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.actionButtonText}>Start</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => handleCancelTournament(item)}
                disabled={isCancelling}
              >
                <Ionicons name="close-circle" size={14} color="#FF453A" />
                <Text style={[styles.actionButtonText, { color: "#FF453A" }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, styles.viewButton]}
              onPress={() => handleViewTournament(item)}
            >
              <Ionicons name="eye-outline" size={14} color="#4CAF82" />
              <Text style={[styles.actionButtonText, { color: "#4CAF82" }]}>
                View
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [handleStartTournament, handleCancelTournament, handleViewTournament, isStarting, isCancelling]
  );

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

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
              <Ionicons name="trophy" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>Tournaments</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={loadTournaments}
              disabled={isLoading}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={isLoading ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF453A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Filter Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            {(["all", "registration", "active", "completed", "closed", "cancelled"] as const).map(
              (status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterTab,
                    filterStatus === status && styles.filterTabActive,
                  ]}
                  onPress={() => setFilterStatus(status)}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      filterStatus === status && styles.filterTabTextActive,
                    ]}
                  >
                    {status === "all" ? "All" : formatTournamentStatus(status as TournamentStatus)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>

          {/* Create Button */}
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Tournament</Text>
          </TouchableOpacity>

          {/* Tournament List */}
          {isLoading && tournaments.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : (
            <FlatList
              data={filteredTournaments}
              renderItem={renderTournament}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="trophy-outline" size={48} color="#666" />
                  <Text style={styles.emptyText}>No tournaments found</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* Create Tournament Modal */}
      <TournamentFormModal
        visible={showCreateModal}
        title="Create Tournament"
        submitLabel="Create"
        onClose={() => setShowCreateModal(false)}
        onSubmit={async (params) => {
          const result = await createTournament(params, adminId);
          if (result.success) {
            setShowCreateModal(false);
            Alert.alert("Success", "Tournament created successfully.");
          } else {
            Alert.alert("Error", result.error || "Failed to create tournament");
          }
        }}
        isSubmitting={isCreating}
      />

      {/* Edit Tournament Modal */}
      <TournamentFormModal
        visible={!!editTournament}
        title="Edit Tournament"
        submitLabel="Save Changes"
        tournament={editTournament || undefined}
        onClose={() => setEditTournament(null)}
        onSubmit={async (params) => {
          if (!editTournament) return;
          const result = await updateTournament(editTournament.id, {
            name: params.name,
            description: params.description,
            entryFee: params.entryFee,
            maxPlayers: params.maxPlayers,
            timeControlSeconds: params.timeControlSeconds,
            incrementSeconds: params.incrementSeconds,
            startTime: params.startTime,
            isRated: params.isRated,
          });
          if (result.success) {
            setEditTournament(null);
            Alert.alert("Success", "Tournament updated successfully.");
          } else {
            Alert.alert("Error", result.error || "Failed to update tournament");
          }
        }}
        isSubmitting={isUpdating}
      />
    </View>
  );
}

// ============================================================================
// Tournament Form Modal (shared for Create & Edit)
// ============================================================================

const FREQUENCY_OPTIONS: { value: TournamentFrequency; label: string }[] = [
  { value: "one-time", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "bi-weekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

interface TournamentFormModalProps {
  visible: boolean;
  title: string;
  submitLabel: string;
  tournament?: Tournament;
  onClose: () => void;
  onSubmit: (params: {
    name: string;
    entryFee: number;
    maxPlayers: number;
    timeControlSeconds: number;
    incrementSeconds: number;
    startTime: string;
    isRated: boolean;
    description?: string;
    frequency?: TournamentFrequency;
  }) => Promise<void>;
  isSubmitting: boolean;
}

function TournamentFormModal({
  visible,
  title,
  submitLabel,
  tournament,
  onClose,
  onSubmit,
  isSubmitting,
}: TournamentFormModalProps) {
  const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [name, setName] = useState("");
  const [entryFee, setEntryFee] = useState("100");
  const [maxPlayers, setMaxPlayers] = useState<number>(16);
  const [timeControl, setTimeControl] = useState("5");
  const [increment, setIncrement] = useState("3");
  const [isRated, setIsRated] = useState(true);
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<TournamentFrequency>("one-time");
  const [startDate, setStartDate] = useState<Date>(defaultDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Calendar state
  const [calendarYear, setCalendarYear] = useState(defaultDate.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(defaultDate.getMonth());

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  // Populate form when editing
  useEffect(() => {
    if (visible && tournament) {
      const d = new Date(tournament.start_time);
      setName(tournament.name);
      setEntryFee(String(tournament.entry_fee_tct));
      setMaxPlayers(tournament.max_players);
      setTimeControl(String(Math.floor(tournament.time_control_seconds / 60)));
      setIncrement(String(tournament.increment_seconds));
      setIsRated(tournament.is_rated);
      setDescription(tournament.description || "");
      setStartDate(d);
      setCalendarYear(d.getFullYear());
      setCalendarMonth(d.getMonth());
      setShowDatePicker(false);
      setShowTimePicker(false);
    } else if (visible && !tournament) {
      resetForm();
    }
  }, [visible, tournament]);

  const resetForm = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setName("");
    setEntryFee("100");
    setMaxPlayers(16);
    setTimeControl("5");
    setIncrement("3");
    setStartDate(d);
    setCalendarYear(d.getFullYear());
    setCalendarMonth(d.getMonth());
    setIsRated(true);
    setDescription("");
    setFrequency("one-time");
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  // Build calendar grid
  const getCalendarDays = () => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(startDate);
    newDate.setFullYear(calendarYear, calendarMonth, day);
    setStartDate(newDate);
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleSelectHour = (h: number) => {
    const newDate = new Date(startDate);
    const currentHours = newDate.getHours();
    const isPM = currentHours >= 12;
    let hours24 = isPM ? (h % 12) + 12 : h % 12;
    newDate.setHours(hours24);
    setStartDate(newDate);
  };

  const handleSelectMinute = (m: number) => {
    const newDate = new Date(startDate);
    newDate.setMinutes(m);
    setStartDate(newDate);
  };

  const handleToggleAmPm = () => {
    const newDate = new Date(startDate);
    const h = newDate.getHours();
    newDate.setHours(h >= 12 ? h - 12 : h + 12);
    setStartDate(newDate);
  };

  const formatDateDisplay = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTimeDisplay = (date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const isSelectedDay = (day: number) => {
    return startDate.getDate() === day
      && startDate.getMonth() === calendarMonth
      && startDate.getFullYear() === calendarYear;
  };

  const isToday = (day: number) => {
    const now = new Date();
    return now.getDate() === day && now.getMonth() === calendarMonth && now.getFullYear() === calendarYear;
  };

  const currentHour12 = startDate.getHours() % 12 || 12;
  const currentMinute = startDate.getMinutes();
  const currentAmPm = startDate.getHours() >= 12 ? "PM" : "AM";

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Tournament name is required");
      return;
    }

    const fee = parseInt(entryFee, 10);
    if (isNaN(fee) || fee < 0) {
      Alert.alert("Error", "Entry fee must be a non-negative number");
      return;
    }

    if (startDate <= new Date()) {
      Alert.alert("Error", "Start time must be in the future");
      return;
    }

    await onSubmit({
      name: name.trim(),
      entryFee: fee,
      maxPlayers,
      timeControlSeconds: parseInt(timeControl, 10) * 60,
      incrementSeconds: parseInt(increment, 10),
      startTime: startDate.toISOString(),
      isRated,
      description: description.trim() || undefined,
      frequency,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {/* Name */}
            <Text style={styles.fieldLabel}>Tournament Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Weekend Blitz Championship"
              placeholderTextColor="#666"
            />

            {/* Description */}
            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tournament description..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={3}
            />

            {/* Entry Fee */}
            <Text style={styles.fieldLabel}>Entry Fee (TCT)</Text>
            <TextInput
              style={styles.textInput}
              value={entryFee}
              onChangeText={setEntryFee}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor="#666"
            />

            {/* Max Players */}
            <Text style={styles.fieldLabel}>Max Players</Text>
            <View style={styles.optionRow}>
              {[2, 4, 8, 16, 32].map((count) => (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.optionButton,
                    maxPlayers === count && styles.optionButtonActive,
                  ]}
                  onPress={() => setMaxPlayers(count)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      maxPlayers === count && styles.optionButtonTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Time Control */}
            <Text style={styles.fieldLabel}>Time Control (minutes)</Text>
            <View style={styles.optionRow}>
              {["1", "3", "5", "10"].map((tc) => (
                <TouchableOpacity
                  key={tc}
                  style={[
                    styles.optionButton,
                    timeControl === tc && styles.optionButtonActive,
                  ]}
                  onPress={() => setTimeControl(tc)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      timeControl === tc && styles.optionButtonTextActive,
                    ]}
                  >
                    {tc}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Increment */}
            <Text style={styles.fieldLabel}>Increment (seconds)</Text>
            <View style={styles.optionRow}>
              {["0", "2", "3", "5"].map((inc) => (
                <TouchableOpacity
                  key={inc}
                  style={[
                    styles.optionButton,
                    increment === inc && styles.optionButtonActive,
                  ]}
                  onPress={() => setIncrement(inc)}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      increment === inc && styles.optionButtonTextActive,
                    ]}
                  >
                    {inc}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Start Date */}
            <Text style={styles.fieldLabel}>Start Date</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => {
                setShowDatePicker(!showDatePicker);
                setShowTimePicker(false);
              }}
            >
              <Ionicons name="calendar-outline" size={20} color="#4CAF82" />
              <Text style={styles.datePickerButtonText}>
                {formatDateDisplay(startDate)}
              </Text>
              <Ionicons
                name={showDatePicker ? "chevron-up" : "chevron-down"}
                size={16}
                color="#A0A0A0"
                style={{ marginLeft: "auto" }}
              />
            </TouchableOpacity>
            {showDatePicker && (
              <View style={styles.calendarContainer}>
                {/* Month/Year nav */}
                <View style={styles.calendarNav}>
                  <TouchableOpacity onPress={handlePrevMonth} style={styles.calendarNavBtn}>
                    <Ionicons name="chevron-back" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.calendarNavTitle}>
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </Text>
                  <TouchableOpacity onPress={handleNextMonth} style={styles.calendarNavBtn}>
                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                {/* Day headers */}
                <View style={styles.calendarRow}>
                  {DAY_LABELS.map((d) => (
                    <Text key={d} style={styles.calendarDayHeader}>{d}</Text>
                  ))}
                </View>
                {/* Day grid */}
                <View style={styles.calendarGrid}>
                  {getCalendarDays().map((day, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.calendarDay,
                        day !== null && isSelectedDay(day) && styles.calendarDaySelected,
                        day !== null && isToday(day) && !isSelectedDay(day) && styles.calendarDayToday,
                      ]}
                      onPress={() => day !== null && handleSelectDay(day)}
                      disabled={day === null}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          day !== null && isSelectedDay(day) && styles.calendarDayTextSelected,
                          day === null && { color: "transparent" },
                        ]}
                      >
                        {day ?? ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Start Time */}
            <Text style={styles.fieldLabel}>Start Time</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => {
                setShowTimePicker(!showTimePicker);
                setShowDatePicker(false);
              }}
            >
              <Ionicons name="time-outline" size={20} color="#4CAF82" />
              <Text style={styles.datePickerButtonText}>
                {formatTimeDisplay(startDate)}
              </Text>
              <Ionicons
                name={showTimePicker ? "chevron-up" : "chevron-down"}
                size={16}
                color="#A0A0A0"
                style={{ marginLeft: "auto" }}
              />
            </TouchableOpacity>
            {showTimePicker && (
              <View style={styles.timePickerContainer}>
                {/* Hours */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeColumnLabel}>Hour</Text>
                  <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timeItem, currentHour12 === h && styles.timeItemActive]}
                        onPress={() => handleSelectHour(h)}
                      >
                        <Text style={[styles.timeItemText, currentHour12 === h && styles.timeItemTextActive]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {/* Minutes */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeColumnLabel}>Min</Text>
                  <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                    {[0,5,10,15,20,25,30,35,40,45,50,55].map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.timeItem, currentMinute === m && styles.timeItemActive]}
                        onPress={() => handleSelectMinute(m)}
                      >
                        <Text style={[styles.timeItemText, currentMinute === m && styles.timeItemTextActive]}>
                          {String(m).padStart(2, "0")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {/* AM/PM */}
                <View style={styles.timeColumn}>
                  <Text style={styles.timeColumnLabel}>{" "}</Text>
                  <View>
                    {(["AM", "PM"] as const).map((ap) => (
                      <TouchableOpacity
                        key={ap}
                        style={[styles.timeItem, currentAmPm === ap && styles.timeItemActive]}
                        onPress={handleToggleAmPm}
                      >
                        <Text style={[styles.timeItemText, currentAmPm === ap && styles.timeItemTextActive]}>
                          {ap}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* Frequency (create only) */}
            {!tournament && (
              <>
                <Text style={styles.fieldLabel}>Frequency</Text>
                <View style={styles.frequencyGrid}>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.frequencyButton,
                        frequency === opt.value && styles.frequencyButtonActive,
                      ]}
                      onPress={() => setFrequency(opt.value)}
                    >
                      <Text
                        style={[
                          styles.frequencyButtonText,
                          frequency === opt.value && styles.frequencyButtonTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Rated */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsRated(!isRated)}
            >
              <Text style={styles.fieldLabel}>Rated Game</Text>
              <Ionicons
                name={isRated ? "checkbox" : "square-outline"}
                size={24}
                color={isRated ? "#4CAF82" : "#666"}
              />
            </TouchableOpacity>

            {/* Prize Info */}
            <View style={styles.prizeInfoCard}>
              <Text style={styles.prizeInfoTitle}>Prize Distribution (post-rake)</Text>
              <Text style={styles.prizeInfoText}>1st: 60% | 2nd: 25% | 3rd/4th: 7.5% each</Text>
              <Text style={styles.prizeInfoText}>5% rake applied to entry fees</Text>
            </View>
          </ScrollView>

          {/* Submit */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelModalButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.submitButtonText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
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
  errorText: {
    color: "#FF453A",
    fontSize: 14,
    flex: 1,
  },
  filterContainer: {
    maxHeight: 44,
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterTabActive: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4CAF82",
  },
  filterTabText: {
    fontSize: 13,
    color: "#A0A0A0",
    fontWeight: "500",
  },
  filterTabTextActive: {
    color: "#4CAF82",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFD700",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 64,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
  },

  // Tournament Card
  tournamentCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tournamentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  prizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  prizeText: {
    fontSize: 13,
    color: "#FFD700",
    fontWeight: "600",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editButton: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
  },
  startButton: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
  },
  cancelButton: {
    backgroundColor: "rgba(255, 69, 58, 0.1)",
  },
  viewButton: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
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
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  optionButtonActive: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderColor: "#4CAF82",
  },
  optionButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  optionButtonTextActive: {
    color: "#4CAF82",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  prizeInfoCard: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
  },
  prizeInfoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFD700",
    marginBottom: 4,
  },
  prizeInfoText: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 8,
  },
  datePickerButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  // Calendar styles
  calendarContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 12,
  },
  calendarNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  calendarNavBtn: {
    padding: 8,
  },
  calendarNavTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  calendarRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  calendarDayHeader: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    paddingVertical: 4,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  calendarDaySelected: {
    backgroundColor: "#4CAF82",
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.5)",
  },
  calendarDayText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  calendarDayTextSelected: {
    color: "#000",
    fontWeight: "700",
  },
  // Time picker styles
  timePickerContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 12,
    gap: 8,
  },
  timeColumn: {
    flex: 1,
    alignItems: "center",
  },
  timeColumnLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    marginBottom: 8,
  },
  timeScroll: {
    maxHeight: 180,
  },
  timeItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 50,
  },
  timeItemActive: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
  },
  timeItemText: {
    fontSize: 16,
    color: "#A0A0A0",
    fontWeight: "500",
  },
  timeItemTextActive: {
    color: "#4CAF82",
    fontWeight: "700",
  },
  frequencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  frequencyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  frequencyButtonActive: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
    borderColor: "#4CAF82",
  },
  frequencyButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  frequencyButtonTextActive: {
    color: "#4CAF82",
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
  },
  cancelModalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFD700",
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
  },
});
