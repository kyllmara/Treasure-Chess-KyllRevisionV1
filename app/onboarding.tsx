import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { AvatarPicker, AvatarDisplay } from "@/components/AvatarPicker";

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { address } = useWallet();

  const [username, setUsername] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const validateUsername = useCallback((value: string) => {
    if (!value.trim()) {
      setUsernameError("Username is required");
      return false;
    }
    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters");
      return false;
    }
    if (value.length > 20) {
      setUsernameError("Username must be 20 characters or less");
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError("Only letters, numbers, and underscores allowed");
      return false;
    }
    setUsernameError(null);
    return true;
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    if (value) {
      validateUsername(value);
    } else {
      setUsernameError(null);
    }
  }, [validateUsername]);

  const handleCreateProfile = useCallback(async () => {
    if (!validateUsername(username)) {
      return;
    }

    if (!user?.privyUserId) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert(
        "Configuration Required",
        "Supabase is not configured. Profile will be created when backend is connected.",
        [{ text: "OK", onPress: () => router.replace("/") }]
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check if username is taken
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.trim().toLowerCase())
        .single();

      if (existingUser) {
        setUsernameError("Username is already taken");
        setIsSubmitting(false);
        return;
      }

      // Create profile
      const { error: insertError } = await supabase.from("profiles").insert({
        username: username.trim(),
        email: user.email,
        avatar_index: selectedAvatar,
        privy_user_id: user.privyUserId,
        embedded_wallet_address: address || "",
        active_wallet_type: "embedded",
      } as never);

      if (insertError) {
        console.error("Profile creation error:", insertError);
        setError(insertError.message);
        return;
      }

      // Refresh profile in auth context
      await refreshProfile();

      // Navigate to home
      router.replace("/");
    } catch (err) {
      console.error("Error creating profile:", err);
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setIsSubmitting(false);
    }
  }, [username, selectedAvatar, user, address, refreshProfile, router, validateUsername]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Your Profile</Text>
          <Text style={styles.subtitle}>Choose a username and avatar to get started</Text>
        </View>

        {/* Selected Avatar Preview */}
        <View style={styles.previewSection}>
          <AvatarDisplay index={selectedAvatar} size={100} showBorder />
          <Text style={styles.previewHint}>Tap an avatar below to select</Text>
        </View>

        {/* Avatar Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Avatar</Text>
          <AvatarPicker
            selectedIndex={selectedAvatar}
            onSelect={setSelectedAvatar}
            size="medium"
          />
        </View>

        {/* Username Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Username</Text>
          <TextInput
            style={[
              styles.input,
              usernameError && styles.inputError,
            ]}
            placeholder="Enter username"
            placeholderTextColor="#666"
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          {usernameError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color="#ff6b6b" />
              <Text style={styles.errorHint}>{usernameError}</Text>
            </View>
          ) : (
            <Text style={styles.inputHint}>3-20 characters, letters, numbers, underscores only</Text>
          )}
        </View>

        {/* Wallet Info */}
        {address && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Wallet</Text>
            <View style={styles.walletCard}>
              <Ionicons name="wallet" size={24} color="#FFD700" />
              <Text style={styles.walletAddress}>
                {address.slice(0, 6)}...{address.slice(-4)}
              </Text>
              <View style={styles.walletBadge}>
                <Text style={styles.walletBadgeText}>Base</Text>
              </View>
            </View>
            <Text style={styles.walletHint}>
              Your embedded wallet has been created automatically
            </Text>
          </View>
        )}

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleCreateProfile}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#1a1a2e" />
          ) : (
            <Text style={styles.submitButtonText}>Create Profile</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
  },
  previewSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  previewHint: {
    fontSize: 14,
    color: "#666",
    marginTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#2a2a4e",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#fff",
    borderWidth: 2,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#ff6b6b",
  },
  inputHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  errorHint: {
    fontSize: 12,
    color: "#ff6b6b",
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a4e",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  walletAddress: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  walletBadge: {
    backgroundColor: "#4169E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  walletBadgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  walletHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 24,
  },
  errorText: {
    flex: 1,
    color: "#ff6b6b",
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1a1a2e",
  },
});
