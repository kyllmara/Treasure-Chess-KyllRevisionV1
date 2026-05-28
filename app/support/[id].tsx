import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

interface Message {
  id: string;
  sender_id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
}

interface TicketInfo {
  id: string;
  subject: string;
  status: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: "rgba(255, 204, 0, 0.15)", text: "#FFCC00", label: "Open" },
  in_progress: { bg: "rgba(78, 205, 196, 0.15)", text: "#4ECDC4", label: "In Progress" },
  resolved: { bg: "rgba(52, 199, 89, 0.15)", text: "#34C759", label: "Resolved" },
};

export default function TicketConversation() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [ticket, setTicket] = useState<TicketInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadTicketAndMessages = useCallback(async () => {
    if (!id) return;
    try {
      const [ticketResult, messagesResult] = await Promise.all([
        supabase
          .from("support_tickets")
          .select("id, subject, status")
          .eq("id", id)
          .single(),
        supabase
          .from("support_messages")
          .select("*")
          .eq("ticket_id", id)
          .order("created_at", { ascending: true }),
      ]);

      if (ticketResult.error) throw ticketResult.error;
      if (messagesResult.error) throw messagesResult.error;

      setTicket(ticketResult.data);
      setMessages(messagesResult.data || []);

      // Mark as read by user
      if (profile?.id) {
        supabase.rpc("mark_support_ticket_read_user", {
          p_ticket_id: id,
          p_user_id: profile.id,
        });
      }
    } catch (error) {
      console.error("Failed to load ticket:", error);
    } finally {
      setIsLoading(false);
    }
  }, [id, profile?.id]);

  useEffect(() => {
    loadTicketAndMessages();
  }, [loadTicketAndMessages]);

  // Subscribe to new messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`support_messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    // Also subscribe to ticket status changes
    const ticketChannel = supabase
      .channel(`support_ticket:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_tickets",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setTicket((prev) =>
            prev ? { ...prev, status: (payload.new as any).status } : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(ticketChannel);
    };
  }, [id]);

  const handleSend = async () => {
    if (!newMessage.trim() || !profile?.id || !id) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: id,
        sender_id: profile.id,
        is_admin: false,
        message: newMessage.trim(),
      });

      if (error) throw error;
      setNewMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = !item.is_admin;
    const showDate =
      index === 0 ||
      formatDate(messages[index - 1].created_at) !== formatDate(item.created_at);

    return (
      <View>
        {showDate && (
          <Text style={styles.dateSeparator}>{formatDate(item.created_at)}</Text>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.adminBubble,
          ]}
        >
          {!isUser && (
            <Text style={styles.adminLabel}>Support Team</Text>
          )}
          <Text style={[styles.messageText, isUser ? styles.userText : styles.adminText]}>
            {item.message}
          </Text>
          <Text style={[styles.messageTime, isUser ? styles.userTime : styles.adminTime]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const isResolved = ticket?.status === "resolved";
  const statusInfo = ticket ? STATUS_COLORS[ticket.status] || STATUS_COLORS.open : null;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
          </View>
        </LinearGradient>
      </View>
    );
  }

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
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {ticket?.subject || "Ticket"}
              </Text>
              {statusInfo && (
                <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                  <Text style={[styles.statusText, { color: statusInfo.text }]}>
                    {statusInfo.label}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
            />

            {isResolved ? (
              <View style={styles.resolvedBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                <Text style={styles.resolvedText}>
                  This ticket has been resolved
                </Text>
              </View>
            ) : (
              <SafeAreaView edges={["bottom"]} style={styles.inputContainer}>
                <TextInput
                  style={styles.messageInput}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type a message..."
                  placeholderTextColor="#666"
                  multiline
                  maxLength={2000}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!newMessage.trim() || isSending) && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!newMessage.trim() || isSending}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#0F0F1E" />
                  ) : (
                    <Ionicons name="send" size={20} color="#0F0F1E" />
                  )}
                </TouchableOpacity>
              </SafeAreaView>
            )}
          </KeyboardAvoidingView>
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 44,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    gap: 8,
  },
  dateSeparator: {
    textAlign: "center",
    fontSize: 12,
    color: "#666",
    marginVertical: 12,
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    padding: 12,
    marginBottom: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderBottomRightRadius: 4,
  },
  adminBubble: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderBottomLeftRadius: 4,
  },
  adminLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4ECDC4",
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#FFFFFF",
  },
  adminText: {
    color: "#E0E0E0",
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  userTime: {
    color: "rgba(255, 215, 0, 0.5)",
    textAlign: "right",
  },
  adminTime: {
    color: "#666",
  },
  resolvedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    borderTopWidth: 1,
    borderTopColor: "rgba(52, 199, 89, 0.2)",
  },
  resolvedText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#34C759",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#FFFFFF",
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#444",
  },
});
