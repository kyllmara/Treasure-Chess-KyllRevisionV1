/**
 * Admin Manage Admins Screen
 *
 * View current admins, search users, and grant/revoke admin privileges.
 * Grant/revoke actions require super admin privileges.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAdmin } from "@/hooks/useAdmin";
import type { AdminUserListItem } from "@/types/admin";

// ============================================================================
// Types
// ============================================================================

type TabKey = "admins" | "search";

// ============================================================================
// Main Screen
// ============================================================================

export default function ManageAdminsScreen() {
  return (
    <AdminGate featureName="Manage Admins" requireSuperAdmin>
      <ManageAdminsContent />
    </AdminGate>
  );
}

function ManageAdminsContent() {
  const router = useRouter();
  const {
    isSuperAdmin,
    searchUsers,
    grantAdminRole,
    revokeAdminRole,
    grantSuperAdminRole,
    checkAdminStatus,
    isLoading,
  } = useAdmin();

  const [activeTab, setActiveTab] = useState<TabKey>("admins");
  const [admins, setAdmins] = useState<AdminUserListItem[]>([]);
  const [searchResults, setSearchResults] = useState<AdminUserListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    setError(null);
    try {
      const results = await searchUsers({
        filterAdmin: true,
        limit: 100,
        offset: 0,
        orderBy: "created_at",
        orderDir: "ASC",
      });
      setAdmins(results);
    } catch (err: any) {
      console.error("Error loading admins:", err);
      setError(err.message || "Failed to load admins");
    } finally {
      setLoadingAdmins(false);
    }
  }, [searchUsers]);

  useEffect(() => {
    checkAdminStatus();
    loadAdmins();
  }, [loadAdmins, checkAdminStatus]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const results = await searchUsers({
        searchTerm: searchQuery.trim(),
        limit: 50,
        offset: 0,
      });
      setSearchResults(results);
    } catch (err: any) {
      console.error("Error searching users:", err);
      setError(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchUsers]);

  const handleGrantAdmin = useCallback(
    async (user: AdminUserListItem) => {
      if (!isSuperAdmin) {
        Alert.alert("Permission Denied", "Only super admins can grant admin privileges.");
        return;
      }

      Alert.alert(
        "Grant Admin",
        `Make ${user.username} an admin? They will have access to the admin panel.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Grant Admin",
            style: "default",
            onPress: async () => {
              setActionLoading(user.id);
              const result = await grantAdminRole(user.id, `Granted admin by super admin`);
              setActionLoading(null);
              if (result.success) {
                Alert.alert("Success", `${user.username} is now an admin.`);
                loadAdmins();
                // Update search results to reflect change
                setSearchResults((prev) =>
                  prev.map((u) => (u.id === user.id ? { ...u, isAdmin: true } : u))
                );
              } else {
                Alert.alert("Error", result.error || "Failed to grant admin role.");
              }
            },
          },
        ]
      );
    },
    [isSuperAdmin, grantAdminRole, loadAdmins]
  );

  const handleRevokeAdmin = useCallback(
    async (user: AdminUserListItem) => {
      if (!isSuperAdmin) {
        Alert.alert("Permission Denied", "Only super admins can revoke admin privileges.");
        return;
      }

      Alert.alert(
        "Revoke Admin",
        `Remove admin privileges from ${user.username}?${user.isSuperAdmin ? " This will also remove their super admin status." : ""} They will lose access to the admin panel.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke Admin",
            style: "destructive",
            onPress: async () => {
              setActionLoading(user.id);
              const result = await revokeAdminRole(user.id, `Revoked admin by super admin`);
              setActionLoading(null);
              if (result.success) {
                Alert.alert("Success", `${user.username} is no longer an admin.`);
                loadAdmins();
                setSearchResults((prev) =>
                  prev.map((u) => (u.id === user.id ? { ...u, isAdmin: false } : u))
                );
              } else {
                Alert.alert("Error", result.error || "Failed to revoke admin role.");
              }
            },
          },
        ]
      );
    },
    [isSuperAdmin, revokeAdminRole, loadAdmins]
  );

  const handleGrantSuperAdmin = useCallback(
    async (user: AdminUserListItem) => {
      if (!isSuperAdmin) {
        Alert.alert("Permission Denied", "Only super admins can promote to super admin.");
        return;
      }

      Alert.alert(
        "Promote to Super Admin",
        `Make ${user.username} a super admin? They will be able to grant/revoke admin privileges.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Promote",
            style: "default",
            onPress: async () => {
              setActionLoading(user.id);
              const result = await grantSuperAdminRole(user.id, `Promoted to super admin`);
              setActionLoading(null);
              if (result.success) {
                Alert.alert("Success", `${user.username} is now a super admin.`);
                loadAdmins();
                setSearchResults((prev) =>
                  prev.map((u) => (u.id === user.id ? { ...u, isAdmin: true, isSuperAdmin: true } : u))
                );
              } else {
                Alert.alert("Error", result.error || "Failed to grant super admin role.");
              }
            },
          },
        ]
      );
    },
    [isSuperAdmin, grantSuperAdminRole, loadAdmins]
  );

  const renderAdminItem = useCallback(
    ({ item }: { item: AdminUserListItem }) => (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.avatarContainer}>
            <Ionicons
              name={item.isSuperAdmin ? "star" : "shield"}
              size={20}
              color={item.isSuperAdmin ? "#FFD700" : "#4CAF82"}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            <View style={styles.metaRow}>
              <View
                style={[
                  styles.roleBadge,
                  item.isSuperAdmin ? styles.superAdminRoleBadge : styles.adminRoleBadge,
                ]}
              >
                <Text
                  style={[
                    styles.roleBadgeText,
                    item.isSuperAdmin ? styles.superAdminRoleBadgeText : styles.adminRoleBadgeText,
                  ]}
                >
                  {item.isSuperAdmin ? "Super Admin" : "Admin"}
                </Text>
              </View>
              <Text style={styles.metaText}>ELO {item.eloRating}</Text>
            </View>
          </View>
        </View>
        {isSuperAdmin && (
          <View style={styles.cardActions}>
            {!item.isSuperAdmin && (
              <TouchableOpacity
                style={styles.promoteButton}
                onPress={() => handleGrantSuperAdmin(item)}
                disabled={actionLoading === item.id}
              >
                {actionLoading === item.id ? (
                  <ActivityIndicator size="small" color="#FFD700" />
                ) : (
                  <>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={styles.promoteButtonText}>Super</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.revokeButton}
              onPress={() => handleRevokeAdmin(item)}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#FF453A" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={16} color="#FF453A" />
                  <Text style={styles.revokeButtonText}>Revoke</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    ),
    [isSuperAdmin, handleRevokeAdmin, handleGrantSuperAdmin, actionLoading]
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: AdminUserListItem }) => (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.avatarContainer}>
            <Ionicons
              name={item.isAdmin ? "shield" : "person"}
              size={20}
              color={item.isAdmin ? "#4CAF82" : "#A0A0A0"}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username} numberOfLines={1}>
              {item.username}
            </Text>
            <View style={styles.metaRow}>
              {item.isAdmin ? (
                <View style={styles.adminRoleBadge}>
                  <Text style={styles.adminRoleBadgeText}>
                    {item.isSuperAdmin ? "Super Admin" : "Admin"}
                  </Text>
                </View>
              ) : (
                <Text style={styles.metaText}>Regular User</Text>
              )}
              <Text style={styles.metaText}>ELO {item.eloRating}</Text>
              <Text style={styles.metaText}>{item.gamesPlayed} games</Text>
            </View>
          </View>
        </View>
        {isSuperAdmin && (
          <View style={styles.cardActions}>
            {item.isAdmin ? (
              <>
                {!item.isSuperAdmin && (
                  <TouchableOpacity
                    style={styles.promoteButton}
                    onPress={() => handleGrantSuperAdmin(item)}
                    disabled={actionLoading === item.id}
                  >
                    {actionLoading === item.id ? (
                      <ActivityIndicator size="small" color="#FFD700" />
                    ) : (
                      <>
                        <Ionicons name="star" size={14} color="#FFD700" />
                        <Text style={styles.promoteButtonText}>Super</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() => handleRevokeAdmin(item)}
                  disabled={actionLoading === item.id}
                >
                  {actionLoading === item.id ? (
                    <ActivityIndicator size="small" color="#FF453A" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={16} color="#FF453A" />
                      <Text style={styles.revokeButtonText}>Revoke</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.grantButton}
                onPress={() => handleGrantAdmin(item)}
                disabled={actionLoading === item.id}
              >
                {actionLoading === item.id ? (
                  <ActivityIndicator size="small" color="#4CAF82" />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark" size={16} color="#4CAF82" />
                    <Text style={styles.grantButtonText}>Admin</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    ),
    [isSuperAdmin, handleGrantAdmin, handleRevokeAdmin, handleGrantSuperAdmin, actionLoading]
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
              <Ionicons name="people" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>Manage Admins</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => { checkAdminStatus(); loadAdmins(); }}
              disabled={loadingAdmins}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={loadingAdmins ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Permission Notice */}
          {!isSuperAdmin && (
            <View style={styles.noticeContainer}>
              <Ionicons name="information-circle" size={18} color="#FCD34D" />
              <Text style={styles.noticeText}>
                Only super admins can grant or revoke admin privileges.
              </Text>
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={20} color="#FF453A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "admins" && styles.tabActive]}
              onPress={() => setActiveTab("admins")}
            >
              <Ionicons
                name="shield"
                size={16}
                color={activeTab === "admins" ? "#4CAF82" : "#A0A0A0"}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "admins" && styles.tabTextActive,
                ]}
              >
                Current Admins ({admins.length})
              </Text>
            </TouchableOpacity>
            {isSuperAdmin && (
              <TouchableOpacity
                style={[styles.tab, activeTab === "search" && styles.tabActive]}
                onPress={() => setActiveTab("search")}
              >
                <Ionicons
                  name="search"
                  size={16}
                  color={activeTab === "search" ? "#4CAF82" : "#A0A0A0"}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "search" && styles.tabTextActive,
                  ]}
                >
                  Add Admin
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          {activeTab === "admins" ? (
            loadingAdmins && admins.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFD700" />
              </View>
            ) : (
              <FlatList
                data={admins}
                renderItem={renderAdminItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="shield-outline" size={48} color="#666" />
                    <Text style={styles.emptyText}>No admins found</Text>
                  </View>
                }
              />
            )
          ) : (
            <View style={styles.searchContainer}>
              {/* Search Bar */}
              <View style={styles.searchBarRow}>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={18} color="#A0A0A0" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by username..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="#666" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.searchButtonText}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Search Results */}
              <FlatList
                data={searchResults}
                renderItem={renderSearchItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  searchQuery.trim() && !searching ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="person-outline" size={48} color="#666" />
                      <Text style={styles.emptyText}>No users found</Text>
                    </View>
                  ) : !searchQuery.trim() ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="search-outline" size={48} color="#666" />
                      <Text style={styles.emptyText}>
                        Search for a user to grant admin privileges
                      </Text>
                    </View>
                  ) : null
                }
              />
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>
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
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  noticeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(252, 211, 77, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(252, 211, 77, 0.2)",
  },
  noticeText: { color: "#FCD34D", fontSize: 13, flex: 1 },
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tabActive: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderColor: "#4CAF82",
  },
  tabText: { fontSize: 13, color: "#A0A0A0", fontWeight: "500" },
  tabTextActive: { color: "#4CAF82" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  emptyContainer: { alignItems: "center", paddingTop: 64, gap: 12 },
  emptyText: { fontSize: 15, color: "#666", textAlign: "center", paddingHorizontal: 32 },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 14,
    padding: 14,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
    marginRight: 8,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: { flex: 1 },
  username: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaText: { fontSize: 12, color: "#A0A0A0" },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  adminRoleBadge: {
    backgroundColor: "rgba(78, 205, 196, 0.15)",
  },
  superAdminRoleBadge: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  adminRoleBadgeText: { color: "#4CAF82" },
  superAdminRoleBadgeText: { color: "#FFD700" },

  // Action buttons
  cardActions: {
    flexDirection: "row",
    gap: 6,
  },
  promoteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  promoteButtonText: { fontSize: 12, fontWeight: "600", color: "#FFD700" },
  grantButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(78, 205, 196, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  grantButtonText: { fontSize: 13, fontWeight: "600", color: "#4CAF82" },
  revokeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 69, 58, 0.2)",
  },
  revokeButtonText: { fontSize: 13, fontWeight: "600", color: "#FF453A" },

  // Search
  searchContainer: { flex: 1 },
  searchBarRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#FFFFFF",
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
  },
  searchButton: {
    backgroundColor: "#4CAF82",
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonText: { fontSize: 14, fontWeight: "600", color: "#0F0F1E" },
});
