import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminGate } from "@/components/AdminGate";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface TicketWithDetails {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_last_read_at: string | null;
  username?: string;
  message_count: number;
  has_unread: boolean;
}

interface Message {
  id: string;
  sender_id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
}

type FilterTab = "all" | "open" | "in_progress" | "resolved";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "rgba(255, 204, 0, 0.15)", text: "#FFCC00", label: "Open" },
  in_progress: { bg: "rgba(78, 205, 196, 0.15)", text: "#4CAF82", label: "In Progress" },
  resolved: { bg: "rgba(52, 199, 89, 0.15)", text: "#34C759", label: "Resolved" },
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

export default function AdminSupportTicketsScreen() {
  return (
    <AdminGate featureName="Support Tickets">
      <AdminSupportTicketsContent />
    </AdminGate>
  );
}

function AdminSupportTicketsContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<TicketWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<Record<string, Message[]>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      let query = supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data: ticketData, error } = await query;
      if (error) throw error;

      if (ticketData && ticketData.length > 0) {
        // Fetch usernames
        const userIds = [...new Set(ticketData.map((t: any) => t.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", userIds);

        const usernameMap: Record<string, string> = {};
        if (profiles) {
          for (const p of profiles) {
            usernameMap[p.id] = p.username || "Unknown";
          }
        }

        // Fetch messages for counts and unread detection
        const ticketIds = ticketData.map((t: any) => t.id);
        const { data: allMessages } = await supabase
          .from("support_messages")
          .select("ticket_id, is_admin, created_at")
          .in("ticket_id", ticketIds);

        const countMap: Record<string, number> = {};
        const latestUserMsgMap: Record<string, string> = {};
        if (allMessages) {
          for (const m of allMessages) {
            countMap[m.ticket_id] = (countMap[m.ticket_id] || 0) + 1;
            if (!m.is_admin) {
              if (!latestUserMsgMap[m.ticket_id] || m.created_at > latestUserMsgMap[m.ticket_id]) {
                latestUserMsgMap[m.ticket_id] = m.created_at;
              }
            }
          }
        }

        setTickets(
          ticketData.map((t: any) => {
            const adminReadAt = t.admin_last_read_at || '1970-01-01T00:00:00Z';
            const latestUserMsg = latestUserMsgMap[t.id];
            const hasUnread = t.status !== 'resolved' && !!latestUserMsg && latestUserMsg > adminReadAt;
            return {
              ...t,
              username: usernameMap[t.user_id] || "Unknown",
              message_count: countMap[t.id] || 0,
              has_unread: hasUnread,
            };
          })
        );
      } else {
        setTickets([]);
      }
    } catch (error) {
      console.error("Failed to load tickets:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    loadTickets();
  }, [loadTickets]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadTickets();
  }, [loadTickets]);

  const loadMessages = async (ticketId: string) => {
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTicketMessages((prev) => ({ ...prev, [ticketId]: data || [] }));
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  };

  const handleExpandTicket = (ticketId: string) => {
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null);
    } else {
      setExpandedTicketId(ticketId);
      if (!ticketMessages[ticketId]) {
        loadMessages(ticketId);
      }
      // Mark as read by admin
      supabase.rpc("mark_support_ticket_read_admin", { p_ticket_id: ticketId });
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, has_unread: false } : t))
      );
    }
  };

  const handleReply = async (ticketId: string) => {
    const text = replyText[ticketId]?.trim();
    if (!text || !profile?.id) return;

    setIsSending(ticketId);
    try {
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: ticketId,
        sender_id: profile.id,
        is_admin: true,
        message: text,
      });

      if (error) throw error;

      setReplyText((prev) => ({ ...prev, [ticketId]: "" }));
      loadMessages(ticketId);
    } catch (error) {
      console.error("Failed to send reply:", error);
      Alert.alert("Error", "Failed to send reply.");
    } finally {
      setIsSending(null);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setIsUpdatingStatus(ticketId);
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: newStatus })
        .eq("id", ticketId);

      if (error) throw error;

      // Insert a status change message so the user sees it in the conversation
      const statusLabels: Record<string, string> = {
        in_progress: "In Progress",
        resolved: "Resolved",
        open: "Open",
      };
      if (profile?.id) {
        await supabase.from("support_messages").insert({
          ticket_id: ticketId,
          sender_id: profile.id,
          is_admin: true,
          message: `Status changed to ${statusLabels[newStatus] || newStatus}`,
        });
      }

      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );

      // Refresh messages if this ticket is expanded
      if (expandedTicketId === ticketId) {
        loadMessages(ticketId);
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      Alert.alert("Error", "Failed to update ticket status.");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = (msg: Message) => (
    <View
      key={msg.id}
      style={[
        styles.msgBubble,
        msg.is_admin ? styles.adminMsg : styles.userMsg,
      ]}
    >
      <Text style={styles.msgSender}>
        {msg.is_admin ? "Admin" : "User"}
      </Text>
      <Text style={styles.msgText}>{msg.message}</Text>
      <Text style={styles.msgTime}>{formatTime(msg.created_at)}</Text>
    </View>
  );

  const renderTicket = ({ item }: { item: TicketWithDetails }) => {
    const statusInfo = STATUS_COLORS[item.status] || STATUS_COLORS.open;
    const isExpanded = expandedTicketId === item.id;
    const messages = ticketMessages[item.id] || [];
    const reply = replyText[item.id] || "";

    return (
      <View style={styles.ticketCard}>
        <TouchableOpacity
          style={styles.ticketHeader}
          onPress={() => handleExpandTicket(item.id)}
        >
          <View style={styles.ticketInfo}>
            <View style={styles.ticketTopRow}>
              <View style={styles.usernameRow}>
                {item.has_unread && <View style={styles.unreadDot} />}
                <Text style={styles.ticketUsername}>{item.username}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusInfo.text }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>
            <Text style={styles.ticketSubject} numberOfLines={1}>
              {item.subject}
            </Text>
            <View style={styles.ticketMeta}>
              <Text style={styles.ticketDate}>{formatDate(item.created_at)}</Text>
              <View style={styles.messageCountBadge}>
                <Ionicons name="chatbubble-outline" size={12} color="#A0A0A0" />
                <Text style={styles.messageCountText}>{item.message_count}</Text>
              </View>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color="#666"
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedSection}>
            {/* Status change buttons */}
            <View style={styles.statusButtons}>
              {item.status !== "in_progress" && (
                <TouchableOpacity
                  style={[styles.statusButton, styles.inProgressButton]}
                  onPress={() => handleStatusChange(item.id, "in_progress")}
                  disabled={isUpdatingStatus === item.id}
                >
                  {isUpdatingStatus === item.id ? (
                    <ActivityIndicator size="small" color="#4CAF82" />
                  ) : (
                    <>
                      <Ionicons name="time-outline" size={14} color="#4CAF82" />
                      <Text style={styles.inProgressButtonText}>Mark In Progress</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
              {item.status !== "resolved" && (
                <TouchableOpacity
                  style={[styles.statusButton, styles.resolvedButton]}
                  onPress={() => handleStatusChange(item.id, "resolved")}
                  disabled={isUpdatingStatus === item.id}
                >
                  {isUpdatingStatus === item.id ? (
                    <ActivityIndicator size="small" color="#34C759" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#34C759" />
                      <Text style={styles.resolvedButtonText}>Mark Resolved</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Messages */}
            <View style={styles.messagesContainer}>
              {messages.length === 0 ? (
                <ActivityIndicator size="small" color="#FFD700" />
              ) : (
                messages.map(renderMessage)
              )}
            </View>

            {/* Reply input */}
            {item.status !== "resolved" && (
              <View style={styles.replyContainer}>
                <TextInput
                  style={styles.replyInput}
                  value={reply}
                  onChangeText={(text) =>
                    setReplyText((prev) => ({ ...prev, [item.id]: text }))
                  }
                  placeholder="Type admin reply..."
                  placeholderTextColor="#666"
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[
                    styles.replySendButton,
                    (!reply.trim() || isSending === item.id) && styles.replySendDisabled,
                  ]}
                  onPress={() => handleReply(item.id)}
                  disabled={!reply.trim() || isSending === item.id}
                >
                  {isSending === item.id ? (
                    <ActivityIndicator size="small" color="#0F0F1E" />
                  ) : (
                    <Ionicons name="send" size={16} color="#0F0F1E" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea} edges={["top"]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="chatbubbles" size={24} color="#FFD700" />
              <Text style={styles.headerTitle}>Support Tickets</Text>
            </View>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              disabled={isLoading}
            >
              <Ionicons
                name="refresh"
                size={24}
                color={isLoading ? "#666" : "#fff"}
              />
            </TouchableOpacity>
          </View>

          {/* Filter tabs */}
          <View style={styles.filterContainer}>
            {FILTER_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
                onPress={() => setFilter(tab.key)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    filter === tab.key && styles.filterTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#333" />
              <Text style={styles.emptyText}>No tickets found</Text>
            </View>
          ) : (
            <FlatList
              data={tickets}
              keyExtractor={(item) => item.id}
              renderItem={renderTicket}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor="#FFD700"
                />
              }
            />
          )}
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

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
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  filterTabActive: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "#FFD700",
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  filterTabTextActive: {
    color: "#FFD700",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#A0A0A0",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  ticketCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    overflow: "hidden",
  },
  ticketHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  ticketInfo: {
    flex: 1,
    gap: 4,
  },
  ticketTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF453A",
  },
  ticketUsername: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF82",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  ticketSubject: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  ticketMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 2,
  },
  ticketDate: {
    fontSize: 12,
    color: "#666",
  },
  messageCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  messageCountText: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    gap: 12,
  },
  statusButtons: {
    flexDirection: "row",
    gap: 8,
  },
  statusButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  inProgressButton: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  inProgressButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4CAF82",
  },
  resolvedButton: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    borderColor: "rgba(52, 199, 89, 0.3)",
  },
  resolvedButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#34C759",
  },
  messagesContainer: {
    gap: 8,
    maxHeight: 300,
  },
  msgBubble: {
    borderRadius: 12,
    padding: 10,
  },
  adminMsg: {
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    marginRight: 40,
  },
  userMsg: {
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    marginLeft: 40,
  },
  msgSender: {
    fontSize: 11,
    fontWeight: "600",
    color: "#A0A0A0",
    marginBottom: 2,
  },
  msgText: {
    fontSize: 14,
    color: "#E0E0E0",
    lineHeight: 20,
  },
  msgTime: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    textAlign: "right",
  },
  replyContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#FFFFFF",
    maxHeight: 80,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  replySendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  replySendDisabled: {
    backgroundColor: "#444",
  },
});
