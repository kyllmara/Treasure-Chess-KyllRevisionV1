import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  user_last_read_at: string | null;
  last_message?: string;
  has_unread: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "rgba(255, 204, 0, 0.15)", text: "#FFCC00", label: "Open" },
  in_progress: { bg: "rgba(78, 205, 196, 0.15)", text: "#4ECDC4", label: "In Progress" },
  resolved: { bg: "rgba(52, 199, 89, 0.15)", text: "#34C759", label: "Resolved" },
};

export default function SupportTicketList() {
  const router = useRouter();
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: ticketData, error } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", profile.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      if (ticketData && ticketData.length > 0) {
        // Fetch messages for last message preview and unread detection
        const ticketIds = ticketData.map((t: any) => t.id);
        const { data: messages } = await supabase
          .from("support_messages")
          .select("ticket_id, message, created_at, is_admin")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: false });

        const lastMessages: Record<string, string> = {};
        const latestAdminMsgMap: Record<string, string> = {};
        if (messages) {
          for (const msg of messages) {
            if (!lastMessages[msg.ticket_id]) {
              lastMessages[msg.ticket_id] = msg.message;
            }
            if (msg.is_admin && !latestAdminMsgMap[msg.ticket_id]) {
              latestAdminMsgMap[msg.ticket_id] = msg.created_at;
            }
          }
        }

        setTickets(
          ticketData.map((t: any) => {
            const userReadAt = t.user_last_read_at || '1970-01-01T00:00:00Z';
            const latestAdminMsg = latestAdminMsgMap[t.id];
            return {
              ...t,
              last_message: lastMessages[t.id],
              has_unread: t.status !== 'resolved' && !!latestAdminMsg && latestAdminMsg > userReadAt,
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
  }, [profile?.id]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadTickets();
  }, [loadTickets]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderTicket = ({ item }: { item: Ticket }) => {
    const statusInfo = STATUS_COLORS[item.status] || STATUS_COLORS.open;
    return (
      <TouchableOpacity
        style={styles.ticketCard}
        onPress={() => router.push(`/support/${item.id}`)}
      >
        <View style={styles.ticketHeader}>
          <View style={styles.subjectRow}>
            {item.has_unread && <View style={styles.unreadDot} />}
            <Text style={styles.ticketSubject} numberOfLines={1}>
              {item.subject}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.statusText, { color: statusInfo.text }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
        {item.last_message && (
          <Text style={styles.lastMessage} numberOfLines={2}>
            {item.last_message}
          </Text>
        )}
        <Text style={styles.ticketDate}>{formatDate(item.updated_at)}</Text>
      </TouchableOpacity>
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
            <Text style={styles.headerTitle}>Support</Text>
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => router.push("/support/new")}
            >
              <Ionicons name="add" size={24} color="#FFD700" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          ) : tickets.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#333" />
              <Text style={styles.emptyTitle}>No Tickets Yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the + button to create a support ticket
              </Text>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  newButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#A0A0A0",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  ticketCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  ticketHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF453A",
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  lastMessage: {
    fontSize: 14,
    color: "#A0A0A0",
    lineHeight: 20,
  },
  ticketDate: {
    fontSize: 12,
    color: "#666",
  },
});
