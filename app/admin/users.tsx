/**
 * Admin User Management Screen
 *
 * Search, view, ban, suspend, and unsuspend users.
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
import { useAdmin } from "@/hooks/useAdmin";
import type {
  AdminUserListItem,
  AdminUserDetails,
  UserSearchFilters,
} from "@/types/admin";

export default function AdminUsersScreen() {
  return (
    <AdminGate featureName="User Management">
      <AdminUsersContent />
    </AdminGate>
  );
}

function AdminUsersContent() {
  const router = useRouter();
  const {
    isLoading,
    isSuperAdmin,
    searchUsers,
    getUserDetails,
    banUser,
    unbanUser,
    suspendUser,
    unsuspendUser,
    grantAdminRole,
    revokeAdminRole,
    error,
    clearError,
  } = useAdmin();

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Filter state
  const [filterBanned, setFilterBanned] = useState<boolean | undefined>();
  const [filterSuspended, setFilterSuspended] = useState<boolean | undefined>();

  // User detail modal state
  const [selectedUser, setSelectedUser] = useState<AdminUserDetails | null>(null);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    type: "ban" | "suspend" | null;
    userId: string;
    username: string;
  }>({ type: null, userId: "", username: "" });
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Suspend date/time picker state
  const defaultSuspendDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [suspendUntil, setSuspendUntil] = useState<Date>(defaultSuspendDate);
  const [showSuspendDatePicker, setShowSuspendDatePicker] = useState(false);
  const [showSuspendTimePicker, setShowSuspendTimePicker] = useState(false);
  const [suspendCalendarYear, setSuspendCalendarYear] = useState(defaultSuspendDate.getFullYear());
  const [suspendCalendarMonth, setSuspendCalendarMonth] = useState(defaultSuspendDate.getMonth());

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const getSuspendCalendarDays = () => {
    const firstDay = new Date(suspendCalendarYear, suspendCalendarMonth, 1).getDay();
    const daysInMonth = new Date(suspendCalendarYear, suspendCalendarMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  };

  const handleSuspendSelectDay = (day: number) => {
    const newDate = new Date(suspendUntil);
    newDate.setFullYear(suspendCalendarYear, suspendCalendarMonth, day);
    setSuspendUntil(newDate);
  };

  const handleSuspendPrevMonth = () => {
    if (suspendCalendarMonth === 0) {
      setSuspendCalendarMonth(11);
      setSuspendCalendarYear(suspendCalendarYear - 1);
    } else {
      setSuspendCalendarMonth(suspendCalendarMonth - 1);
    }
  };

  const handleSuspendNextMonth = () => {
    if (suspendCalendarMonth === 11) {
      setSuspendCalendarMonth(0);
      setSuspendCalendarYear(suspendCalendarYear + 1);
    } else {
      setSuspendCalendarMonth(suspendCalendarMonth + 1);
    }
  };

  const handleSuspendSelectHour = (h: number) => {
    const newDate = new Date(suspendUntil);
    const isPM = newDate.getHours() >= 12;
    newDate.setHours(isPM ? (h % 12) + 12 : h % 12);
    setSuspendUntil(newDate);
  };

  const handleSuspendSelectMinute = (m: number) => {
    const newDate = new Date(suspendUntil);
    newDate.setMinutes(m);
    setSuspendUntil(newDate);
  };

  const handleSuspendToggleAmPm = () => {
    const newDate = new Date(suspendUntil);
    const h = newDate.getHours();
    newDate.setHours(h >= 12 ? h - 12 : h + 12);
    setSuspendUntil(newDate);
  };

  const formatSuspendDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatSuspendTime = (date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const isSuspendSelectedDay = (day: number) => {
    return suspendUntil.getDate() === day
      && suspendUntil.getMonth() === suspendCalendarMonth
      && suspendUntil.getFullYear() === suspendCalendarYear;
  };

  const isSuspendToday = (day: number) => {
    const now = new Date();
    return now.getDate() === day && now.getMonth() === suspendCalendarMonth && now.getFullYear() === suspendCalendarYear;
  };

  const suspendHour12 = suspendUntil.getHours() % 12 || 12;
  const suspendMinute = suspendUntil.getMinutes();
  const suspendAmPm = suspendUntil.getHours() >= 12 ? "PM" : "AM";

  const resetSuspendPicker = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    setSuspendUntil(d);
    setSuspendCalendarYear(d.getFullYear());
    setSuspendCalendarMonth(d.getMonth());
    setShowSuspendDatePicker(false);
    setShowSuspendTimePicker(false);
  };

  // Search function
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    setHasSearched(true);

    const filters: UserSearchFilters = {
      searchTerm: searchTerm || undefined,
      filterBanned,
      filterSuspended,
      limit: 50,
    };

    const results = await searchUsers(filters);
    setUsers(results);
    setIsSearching(false);
  }, [searchTerm, filterBanned, filterSuspended, searchUsers]);

  // Load user on mount
  useEffect(() => {
    handleSearch();
  }, []);

  // View user details
  const handleViewUser = async (userId: string) => {
    setIsLoadingUser(true);
    setIsUserModalVisible(true);

    const details = await getUserDetails(userId);
    setSelectedUser(details);
    setIsLoadingUser(false);
  };

  // Action handlers
  const handleBanUser = async () => {
    if (!actionReason.trim()) {
      Alert.alert("Error", "Please provide a reason for the ban");
      return;
    }

    setIsActionLoading(true);

    const durationDays = actionDuration ? parseInt(actionDuration, 10) : undefined;

    const result = await banUser({
      targetUserId: actionModal.userId,
      reason: actionReason,
      durationDays,
    });

    setIsActionLoading(false);

    if (result.success) {
      Alert.alert("Success", `User ${actionModal.username} has been banned`);
      setActionModal({ type: null, userId: "", username: "" });
      setActionReason("");
      setActionDuration("");
      handleSearch();
    } else {
      Alert.alert("Error", result.error || "Failed to ban user");
    }
  };

  const handleUnbanUser = async (userId: string, username: string) => {
    Alert.alert(
      "Unban User",
      `Are you sure you want to unban ${username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unban",
          onPress: async () => {
            const result = await unbanUser(userId);
            if (result.success) {
              Alert.alert("Success", `${username} has been unbanned`);
              handleSearch();
            } else {
              Alert.alert("Error", result.error || "Failed to unban user");
            }
          },
        },
      ]
    );
  };

  const handleSuspendUser = async () => {
    if (!actionReason.trim()) {
      Alert.alert("Error", "Please provide a reason for the suspension");
      return;
    }

    const now = new Date();
    if (suspendUntil <= now) {
      Alert.alert("Error", "Suspension end date must be in the future");
      return;
    }

    setIsActionLoading(true);

    const durationHours = Math.max(1, Math.ceil((suspendUntil.getTime() - now.getTime()) / (1000 * 60 * 60)));

    const result = await suspendUser({
      targetUserId: actionModal.userId,
      reason: actionReason,
      durationHours,
    });

    setIsActionLoading(false);

    if (result.success) {
      Alert.alert("Success", `User ${actionModal.username} suspended until ${formatSuspendDate(suspendUntil)} ${formatSuspendTime(suspendUntil)}`);
      setActionModal({ type: null, userId: "", username: "" });
      setActionReason("");
      resetSuspendPicker();
      handleSearch();
    } else {
      Alert.alert("Error", result.error || "Failed to suspend user");
    }
  };

  const handleUnsuspendUser = async (userId: string, username: string) => {
    Alert.alert(
      "Lift Suspension",
      `Are you sure you want to lift the suspension for ${username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Lift Suspension",
          onPress: async () => {
            const result = await unsuspendUser(userId);
            if (result.success) {
              Alert.alert("Success", `${username}'s suspension has been lifted`);
              handleSearch();
            } else {
              Alert.alert("Error", result.error || "Failed to unsuspend user");
            }
          },
        },
      ]
    );
  };

  const handlePromoteAdmin = async (userId: string, username: string) => {
    if (!isSuperAdmin) {
      Alert.alert("Error", "Only super admins can promote users");
      return;
    }
    Alert.alert(
      "Promote to Admin",
      `Make ${username} an admin?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Promote",
          onPress: async () => {
            const result = await grantAdminRole(userId, `Promoted by super admin`);
            if (result.success) {
              Alert.alert("Success", `${username} is now an admin`);
              handleSearch();
            } else {
              Alert.alert("Error", result.error || "Failed to promote user");
            }
          },
        },
      ]
    );
  };

  const handleDemoteAdmin = async (userId: string, username: string) => {
    if (!isSuperAdmin) {
      Alert.alert("Error", "Only super admins can demote admins");
      return;
    }
    Alert.alert(
      "Remove Admin",
      `Remove admin privileges from ${username}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Demote",
          style: "destructive",
          onPress: async () => {
            const result = await revokeAdminRole(userId, `Demoted by super admin`);
            if (result.success) {
              Alert.alert("Success", `${username} is no longer an admin`);
              handleSearch();
            } else {
              Alert.alert("Error", result.error || "Failed to demote admin");
            }
          },
        },
      ]
    );
  };

  // Render user item
  const renderUserItem = ({ item }: { item: AdminUserListItem }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => handleViewUser(item.id)}
    >
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          {item.email && <Text style={styles.email}>{item.email}</Text>}
        </View>
        <View style={styles.userBadges}>
          {item.isAdmin && (
            <View style={[styles.badge, styles.adminBadge]}>
              <Ionicons name="shield" size={12} color="#4ECDC4" />
            </View>
          )}
          {item.isBanned && (
            <View style={[styles.badge, styles.bannedBadge]}>
              <Text style={styles.badgeText}>Banned</Text>
            </View>
          )}
          {item.isSuspended && (
            <View style={[styles.badge, styles.suspendedBadge]}>
              <Text style={styles.badgeText}>Suspended</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.userStats}>
        <StatPill icon="game-controller" value={item.gamesPlayed} label="Games" />
        <StatPill icon="trophy" value={item.gamesWon} label="Wins" />
        <StatPill icon="trending-up" value={item.eloRating} label="ELO" />
        <StatPill icon="wallet" value={`${item.availableTCT.toFixed(0)}`} label="TCT" />
      </View>

      <View style={styles.userActions}>
        {item.isBanned ? (
          <ActionButton
            icon="checkmark-circle"
            label="Unban"
            color="#34C759"
            onPress={() => handleUnbanUser(item.id, item.username)}
          />
        ) : (
          <ActionButton
            icon="ban"
            label="Ban"
            color="#FF453A"
            onPress={() =>
              setActionModal({ type: "ban", userId: item.id, username: item.username })
            }
          />
        )}
        {item.isSuspended ? (
          <ActionButton
            icon="checkmark-circle"
            label="Unsuspend"
            color="#34C759"
            onPress={() => handleUnsuspendUser(item.id, item.username)}
          />
        ) : (
          <ActionButton
            icon="time"
            label="Suspend"
            color="#FF9500"
            onPress={() =>
              setActionModal({ type: "suspend", userId: item.id, username: item.username })
            }
          />
        )}
        {isSuperAdmin && (
          item.isAdmin ? (
            <ActionButton
              icon="shield-outline"
              label="Demote"
              color="#A0A0A0"
              onPress={() => handleDemoteAdmin(item.id, item.username)}
            />
          ) : (
            <ActionButton
              icon="shield"
              label="Admin"
              color="#4ECDC4"
              onPress={() => handlePromoteAdmin(item.id, item.username)}
            />
          )
        )}
      </View>
    </TouchableOpacity>
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
            <Text style={styles.headerTitle}>User Management</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username, email, or ID..."
                placeholderTextColor="#666"
                value={searchTerm}
                onChangeText={setSearchTerm}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm("")}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color="#0F0F1E" />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Filters */}
          <View style={styles.filtersContainer}>
            <FilterChip
              label="Banned"
              isActive={filterBanned === true}
              onPress={() => {
                setFilterBanned(filterBanned === true ? undefined : true);
              }}
              color="#FF453A"
            />
            <FilterChip
              label="Suspended"
              isActive={filterSuspended === true}
              onPress={() => {
                setFilterSuspended(filterSuspended === true ? undefined : true);
              }}
              color="#FF9500"
            />
            <FilterChip
              label="Clear"
              isActive={false}
              onPress={() => {
                setFilterBanned(undefined);
                setFilterSuspended(undefined);
                setSearchTerm("");
              }}
              color="#666"
            />
          </View>

          {/* Results */}
          <FlatList
            data={users}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                {isSearching ? (
                  <ActivityIndicator size="large" color="#FFD700" />
                ) : hasSearched ? (
                  <>
                    <Ionicons name="search" size={48} color="#666" />
                    <Text style={styles.emptyText}>No users found</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="people" size={48} color="#666" />
                    <Text style={styles.emptyText}>Search for users above</Text>
                  </>
                )}
              </View>
            }
          />
        </SafeAreaView>
      </LinearGradient>

      {/* Action Modal */}
      <Modal
        visible={actionModal.type !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActionModal({ type: null, userId: "", username: "" })}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {actionModal.type === "ban" && "Ban User"}
                {actionModal.type === "suspend" && "Suspend User"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setActionModal({ type: null, userId: "", username: "" });
                  setActionReason("");
                  setActionDuration("");
                  resetSuspendPicker();
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Target: <Text style={styles.modalHighlight}>{actionModal.username}</Text>
            </Text>

            <Text style={styles.inputLabel}>Reason *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter reason for this action..."
              placeholderTextColor="#666"
              value={actionReason}
              onChangeText={setActionReason}
              multiline
              numberOfLines={3}
            />

            {actionModal.type === "ban" && (
              <>
                <Text style={styles.inputLabel}>
                  Duration (days) - leave empty for permanent
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., 7 for 7 days"
                  placeholderTextColor="#666"
                  value={actionDuration}
                  onChangeText={setActionDuration}
                  keyboardType="number-pad"
                />
                {!isSuperAdmin && (
                  <Text style={styles.warningText}>
                    Note: Permanent bans require super admin privileges
                  </Text>
                )}
              </>
            )}

            {actionModal.type === "suspend" && (
              <>
                <Text style={styles.inputLabel}>Suspend Until</Text>

                {/* Date picker button */}
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    setShowSuspendDatePicker(!showSuspendDatePicker);
                    setShowSuspendTimePicker(false);
                  }}
                >
                  <Ionicons name="calendar-outline" size={20} color="#FF9500" />
                  <Text style={styles.datePickerButtonText}>
                    {formatSuspendDate(suspendUntil)}
                  </Text>
                  <Ionicons
                    name={showSuspendDatePicker ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#A0A0A0"
                    style={{ marginLeft: "auto" }}
                  />
                </TouchableOpacity>

                {/* Calendar dropdown */}
                {showSuspendDatePicker && (
                  <View style={styles.calendarContainer}>
                    <View style={styles.calendarNav}>
                      <TouchableOpacity onPress={handleSuspendPrevMonth} style={styles.calendarNavBtn}>
                        <Ionicons name="chevron-back" size={20} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.calendarNavTitle}>
                        {MONTH_NAMES[suspendCalendarMonth]} {suspendCalendarYear}
                      </Text>
                      <TouchableOpacity onPress={handleSuspendNextMonth} style={styles.calendarNavBtn}>
                        <Ionicons name="chevron-forward" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.calendarRow}>
                      {DAY_LABELS.map((d) => (
                        <Text key={d} style={styles.calendarDayHeader}>{d}</Text>
                      ))}
                    </View>
                    <View style={styles.calendarGrid}>
                      {getSuspendCalendarDays().map((day, idx) => (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.calendarDay,
                            day !== null && isSuspendSelectedDay(day) && styles.calendarDaySelected,
                            day !== null && isSuspendToday(day) && !isSuspendSelectedDay(day) && styles.calendarDayToday,
                          ]}
                          onPress={() => day !== null && handleSuspendSelectDay(day)}
                          disabled={day === null}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              day !== null && isSuspendSelectedDay(day) && styles.calendarDayTextSelected,
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

                {/* Time picker button */}
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    setShowSuspendTimePicker(!showSuspendTimePicker);
                    setShowSuspendDatePicker(false);
                  }}
                >
                  <Ionicons name="time-outline" size={20} color="#FF9500" />
                  <Text style={styles.datePickerButtonText}>
                    {formatSuspendTime(suspendUntil)}
                  </Text>
                  <Ionicons
                    name={showSuspendTimePicker ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#A0A0A0"
                    style={{ marginLeft: "auto" }}
                  />
                </TouchableOpacity>

                {/* Time picker dropdown */}
                {showSuspendTimePicker && (
                  <View style={styles.timePickerContainer}>
                    <View style={styles.timeColumn}>
                      <Text style={styles.timeColumnLabel}>Hour</Text>
                      <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.timeItem, suspendHour12 === h && styles.timeItemActive]}
                            onPress={() => handleSuspendSelectHour(h)}
                          >
                            <Text style={[styles.timeItemText, suspendHour12 === h && styles.timeItemTextActive]}>
                              {h}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.timeColumn}>
                      <Text style={styles.timeColumnLabel}>Min</Text>
                      <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {[0,5,10,15,20,25,30,35,40,45,50,55].map((m) => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.timeItem, suspendMinute === m && styles.timeItemActive]}
                            onPress={() => handleSuspendSelectMinute(m)}
                          >
                            <Text style={[styles.timeItemText, suspendMinute === m && styles.timeItemTextActive]}>
                              {String(m).padStart(2, "0")}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.timeColumn}>
                      <Text style={styles.timeColumnLabel}>{" "}</Text>
                      <View>
                        {(["AM", "PM"] as const).map((ap) => (
                          <TouchableOpacity
                            key={ap}
                            style={[styles.timeItem, suspendAmPm === ap && styles.timeItemActive]}
                            onPress={handleSuspendToggleAmPm}
                          >
                            <Text style={[styles.timeItemText, suspendAmPm === ap && styles.timeItemTextActive]}>
                              {ap}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[
                styles.modalButton,
                actionModal.type === "ban" && styles.dangerButton,
                actionModal.type === "suspend" && styles.warningButton,
              ]}
              onPress={() => {
                if (actionModal.type === "ban") handleBanUser();
                else if (actionModal.type === "suspend") handleSuspendUser();
              }}
              disabled={isActionLoading}
            >
              {isActionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>
                  {actionModal.type === "ban" && "Confirm Ban"}
                  {actionModal.type === "suspend" && "Confirm Suspension"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* User Detail Modal */}
      <Modal
        visible={isUserModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsUserModalVisible(false);
          setSelectedUser(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.detailModalContent]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsUserModalVisible(false);
                  setSelectedUser(null);
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {isLoadingUser ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
              </View>
            ) : selectedUser ? (
              <ScrollView style={styles.detailScroll}>
                <Text style={styles.detailUsername}>{selectedUser.profile.username}</Text>
                {selectedUser.profile.email && (
                  <Text style={styles.detailEmail}>{selectedUser.profile.email}</Text>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Statistics</Text>
                  <DetailRow label="ELO Rating" value={selectedUser.profile.eloRating} />
                  <DetailRow label="Games Played" value={selectedUser.profile.gamesPlayed} />
                  <DetailRow label="Games Won" value={selectedUser.profile.gamesWon} />
                  <DetailRow label="Games Lost" value={selectedUser.profile.gamesLost} />
                  <DetailRow label="Games Drawn" value={selectedUser.profile.gamesDrawn} />
                  <DetailRow label="Current Streak" value={selectedUser.profile.currentStreak} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Balance</Text>
                  <DetailRow
                    label="Available"
                    value={`${selectedUser.balance.availableTCT.toFixed(2)} TCT`}
                  />
                  <DetailRow
                    label="Locked"
                    value={`${selectedUser.balance.lockedTCT.toFixed(2)} TCT`}
                  />
                  <DetailRow
                    label="Total Deposited"
                    value={`${selectedUser.balance.totalDepositedTCT.toFixed(2)} TCT`}
                  />
                  <DetailRow
                    label="Total Won"
                    value={`${selectedUser.balance.totalWonTCT.toFixed(2)} TCT`}
                  />
                  <DetailRow
                    label="Total Lost"
                    value={`${selectedUser.balance.totalLostTCT.toFixed(2)} TCT`}
                  />
                </View>

                {(selectedUser.restrictions.isBanned ||
                  selectedUser.restrictions.isSuspended) && (
                  <View style={[styles.detailSection, styles.restrictionSection]}>
                    <Text style={styles.detailSectionTitle}>Restrictions</Text>
                    {selectedUser.restrictions.isBanned && (
                      <>
                        <DetailRow
                          label="Status"
                          value="Banned"
                          valueColor="#FF453A"
                        />
                        <DetailRow
                          label="Reason"
                          value={selectedUser.restrictions.banReason || "N/A"}
                        />
                        <DetailRow
                          label="Expires"
                          value={
                            selectedUser.restrictions.banExpiresAt
                              ? new Date(
                                  selectedUser.restrictions.banExpiresAt
                                ).toLocaleDateString()
                              : "Permanent"
                          }
                        />
                      </>
                    )}
                    {selectedUser.restrictions.isSuspended && (
                      <>
                        <DetailRow
                          label="Status"
                          value="Suspended"
                          valueColor="#FF9500"
                        />
                        <DetailRow
                          label="Reason"
                          value={selectedUser.restrictions.suspensionReason || "N/A"}
                        />
                        <DetailRow
                          label="Expires"
                          value={
                            selectedUser.restrictions.suspensionExpiresAt
                              ? new Date(
                                  selectedUser.restrictions.suspensionExpiresAt
                                ).toLocaleString()
                              : "N/A"
                          }
                        />
                      </>
                    )}
                  </View>
                )}

                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Account</Text>
                  <DetailRow
                    label="Created"
                    value={new Date(selectedUser.profile.createdAt).toLocaleDateString()}
                  />
                  <DetailRow
                    label="Last Seen"
                    value={new Date(selectedUser.profile.lastSeenAt).toLocaleString()}
                  />
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.errorText}>Failed to load user details</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function StatPill({
  icon,
  value,
  label,
}: {
  icon: string;
  value: number | string;
  label: string;
}) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon as any} size={14} color="#A0A0A0" />
      <Text style={styles.statPillValue}>{value}</Text>
      <Text style={styles.statPillLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { backgroundColor: `${color}20` }]}
      onPress={onPress}
    >
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
  color,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        isActive && { backgroundColor: `${color}30`, borderColor: color },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, isActive && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 44,
  },
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: "#FFFFFF",
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonText: {
    color: "#0F0F1E",
    fontWeight: "600",
    fontSize: 14,
  },
  filtersContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "transparent",
  },
  filterChipText: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  userCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  email: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 2,
  },
  userBadges: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  adminBadge: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  bannedBadge: {
    backgroundColor: "rgba(255, 69, 58, 0.15)",
  },
  suspendedBadge: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FF453A",
  },
  userStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statPillValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  statPillLabel: {
    fontSize: 10,
    color: "#A0A0A0",
  },
  userActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
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
    padding: 24,
    maxHeight: "80%",
  },
  detailModalContent: {
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    marginBottom: 16,
  },
  modalHighlight: {
    color: "#FFD700",
    fontWeight: "600",
  },
  inputLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 12,
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 16,
    textAlignVertical: "top",
  },
  warningText: {
    fontSize: 12,
    color: "#FF9500",
    marginBottom: 16,
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
    backgroundColor: "#FF9500",
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.5)",
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
    backgroundColor: "rgba(255, 149, 0, 0.2)",
  },
  timeItemText: {
    fontSize: 16,
    color: "#A0A0A0",
    fontWeight: "500",
  },
  timeItemTextActive: {
    color: "#FF9500",
    fontWeight: "700",
  },
  modalButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  dangerButton: {
    backgroundColor: "#FF453A",
  },
  warningButton: {
    backgroundColor: "#FF9500",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    padding: 48,
    alignItems: "center",
  },
  detailScroll: {
    maxHeight: 500,
  },
  detailUsername: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 4,
  },
  detailEmail: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 24,
  },
  detailSection: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  restrictionSection: {
    borderWidth: 1,
    borderColor: "rgba(255, 69, 58, 0.3)",
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFD700",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 14,
    color: "#A0A0A0",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  errorText: {
    color: "#FF453A",
    textAlign: "center",
    padding: 24,
  },
});
