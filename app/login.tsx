/**
 * Login Screen
 *
 * Complete authentication flow supporting:
 * - Email OTP authentication (works in Expo Go)
 * - OAuth logins (Google, Apple - requires EAS build)
 * - Guest mode for practice access
 *
 * The OTP flow:
 * 1. User enters email
 * 2. System sends 6-digit code to email
 * 3. User enters code
 * 4. System verifies and logs in
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/hooks/useAuth";
import { DEV_BYPASS_AUTH } from "@/constants/devFlags";

// Required on Android: signals to WebBrowser.openAuthSessionAsync that the
// OAuth redirect has been received, allowing the promise to resolve with the URL.
WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// OTP Input Component
// ============================================================================

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
}

function OTPInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
}: OTPInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      // Small delay to ensure the view is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const handlePress = () => {
    inputRef.current?.focus();
  };

  const digits = value.split("").concat(Array(length - value.length).fill(""));

  return (
    <TouchableOpacity
      style={styles.otpContainer}
      onPress={handlePress}
      activeOpacity={1}
    >
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(text) => {
          // Only allow digits
          const cleaned = text.replace(/\D/g, "").slice(0, length);
          onChange(cleaned);
        }}
        keyboardType="number-pad"
        maxLength={length}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        editable={!disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      <View style={styles.otpBoxes}>
        {digits.map((digit, index) => (
          <View
            key={index}
            style={[
              styles.otpBox,
              digit && styles.otpBoxFilled,
              isFocused && index === value.length && styles.otpBoxFocused,
            ]}
          >
            <Text style={styles.otpDigit}>{digit}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Main Login Screen
// ============================================================================

export default function LoginScreen() {
  const router = useRouter();
  const {
    sendOTP,
    verifyOTP,
    cancelOTPFlow,
    resendOTP,
    loginWithGoogle,
    loginWithApple,
    isLoading,
    otpState,
    otpEmail,
    error,
    clearError,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Complete any pending OAuth session when this screen mounts or re-mounts
  // after the redirect brings the user back from Google/Apple login.
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  // ⚠️ TESTING ONLY — skip login screen entirely when bypass flag is set
  useEffect(() => {
    if (DEV_BYPASS_AUTH) router.replace("/");
  }, []);

  // Handle resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Auto-submit OTP when 6 digits entered
  useEffect(() => {
    if (otpCode.length === 6 && otpState === "awaiting_code_input") {
      handleVerifyOTP();
    }
  }, [otpCode, otpState]);

  // Navigate to home on successful login
  useEffect(() => {
    if (otpState === "success") {
      router.replace("/");
    }
  }, [otpState, router]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSendOTP = async () => {
    if (!email.trim()) {
      Alert.alert("Email Required", "Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    Keyboard.dismiss();
    setIsSubmitting(true);
    clearError();

    try {
      await sendOTP({ email: email.trim() });
      setResendCooldown(60); // 60 second cooldown for resend
    } catch (err) {
      // Error is handled by the context
      console.log("[Login] Send OTP error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (DEV_BYPASS_AUTH) { router.replace("/"); return; } // ⚠️ TESTING ONLY
    if (otpCode.length !== 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code");
      return;
    }

    Keyboard.dismiss();
    setIsSubmitting(true);
    clearError();

    try {
      await verifyOTP({ code: otpCode });
      // Navigation happens via useEffect when otpState === "success"
    } catch (err) {
      // Error is handled by the context
      console.log("[Login] Verify OTP error:", err);
      setOtpCode(""); // Clear code on error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;

    setIsSubmitting(true);
    clearError();

    try {
      await resendOTP();
      setResendCooldown(60);
      setOtpCode("");
    } catch (err) {
      console.log("[Login] Resend OTP error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToEmail = () => {
    cancelOTPFlow();
    setOtpCode("");
    setEmail("");
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    clearError();

    try {
      await loginWithGoogle();
      // loginWithGoogle resolves after exchangeCodeForSession — onAuthStateChange
      // fires SIGNED_IN asynchronously, so let index.tsx handle the redirect.
      // Don't navigate here; the auth state update will trigger routing naturally.
    } catch (err: any) {
      if (err?.code !== "OAUTH_CANCELLED") {
        Alert.alert(
          "Login Failed",
          err?.message || "Google sign-in failed. Please try email login instead."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsSubmitting(true);
    clearError();

    try {
      await loginWithApple();
      router.replace("/");
    } catch (err: any) {
      if (err?.code !== "OAUTH_CANCELLED") {
        Alert.alert(
          "Login Failed",
          err?.message || "Apple sign-in failed. Please try email login in Expo Go."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // UI State
  // -------------------------------------------------------------------------

  const isButtonDisabled = isSubmitting;
  const showOTPInput =
    otpState === "awaiting_code_input" ||
    otpState === "verifying_code" ||
    otpState === "error";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardView}
          >
            <View style={styles.content}>
              {/* Logo Section */}
              <View style={styles.logoSection}>
                <View style={styles.logoContainer}>
                  <Ionicons name="trophy" size={64} color="#FFD700" />
                </View>
                <Text style={styles.title}>Treasure Chess</Text>
                <Text style={styles.subtitle}>Play. Compete. Win.</Text>
              </View>

              {/* Form Section */}
              <View style={styles.formSection}>
                {showOTPInput ? (
                  // OTP Verification Screen
                  <>
                    {/* Back Button */}
                    <TouchableOpacity
                      style={styles.backToEmailButton}
                      onPress={handleBackToEmail}
                      disabled={isButtonDisabled}
                    >
                      <Ionicons name="arrow-back" size={20} color="#4CAF82" />
                      <Text style={styles.backToEmailText}>Back</Text>
                    </TouchableOpacity>

                    <Text style={styles.otpTitle}>Enter Verification Code</Text>
                    <Text style={styles.otpSubtitle}>
                      We sent a 6-digit code to{"\n"}
                      <Text style={styles.otpEmailHighlight}>{otpEmail}</Text>
                    </Text>

                    <OTPInput
                      value={otpCode}
                      onChange={setOtpCode}
                      disabled={isButtonDisabled || otpState === "verifying_code"}
                      autoFocus
                    />

                    {/* Verify Button */}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        otpCode.length !== 6 && styles.primaryButtonDisabled,
                      ]}
                      onPress={handleVerifyOTP}
                      disabled={isButtonDisabled || otpCode.length !== 6}
                    >
                      <LinearGradient
                        colors={
                          otpCode.length === 6
                            ? ["#FFD700", "#FFA500"]
                            : ["#555", "#444"]
                        }
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        {otpState === "verifying_code" ? (
                          <ActivityIndicator color="#1a1a2e" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Verify Code</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Resend Option */}
                    <View style={styles.resendContainer}>
                      <Text style={styles.resendText}>Didn't receive the code? </Text>
                      {resendCooldown > 0 ? (
                        <Text style={styles.resendCooldown}>
                          Resend in {resendCooldown}s
                        </Text>
                      ) : (
                        <TouchableOpacity onPress={handleResendOTP} disabled={isButtonDisabled}>
                          <Text style={styles.resendLink}>Resend</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                ) : (
                  // Email Input Screen
                  <>
                    {/* Email Input */}
                    <View style={styles.inputContainer}>
                      <Ionicons
                        name="mail-outline"
                        size={20}
                        color="#666"
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your email"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        editable={!isButtonDisabled}
                        returnKeyType="go"
                        onSubmitEditing={handleSendOTP}
                      />
                    </View>

                    {/* Email Login Button */}
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={handleSendOTP}
                      disabled={isButtonDisabled}
                    >
                      <LinearGradient
                        colors={["#FFD700", "#FFA500"]}
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        {otpState === "sending_code" ? (
                          <ActivityIndicator color="#1a1a2e" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Continue with Email</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>or</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    {/* Google Login */}
                    <TouchableOpacity
                      style={styles.socialButton}
                      onPress={handleGoogleLogin}
                      disabled={isButtonDisabled}
                    >
                      <Ionicons
                        name="logo-google"
                        size={24}
                        color="#fff"
                        style={styles.buttonIcon}
                      />
                      <Text style={styles.socialButtonText}>Continue with Google</Text>
                    </TouchableOpacity>

                    {/* Apple Login - iOS only */}
                    {Platform.OS === "ios" && (
                      <TouchableOpacity
                        style={[styles.socialButton, styles.appleButton]}
                        onPress={handleAppleLogin}
                        disabled={isButtonDisabled}
                      >
                        <Ionicons
                          name="logo-apple"
                          size={24}
                          color="#fff"
                          style={styles.buttonIcon}
                        />
                        <Text style={styles.socialButtonText}>Continue with Apple</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* Error Display */}
                {error && (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={20} color="#ff6b6b" />
                    <Text style={styles.errorText}>{error.message}</Text>
                    <TouchableOpacity onPress={clearError} style={styles.errorDismiss}>
                      <Ionicons name="close" size={18} color="#ff6b6b" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  By continuing, you agree to our{" "}
                  <Text style={styles.footerLink}>Terms of Service</Text> and{" "}
                  <Text style={styles.footerLink}>Privacy Policy</Text>
                </Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
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
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },

  // Logo Section
  logoSection: {
    alignItems: "center",
    marginTop: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#888",
  },

  // Form Section
  formSection: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: "#fff",
  },

  // Buttons
  primaryButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  dividerText: {
    marginHorizontal: 16,
    color: "#666",
    fontSize: 14,
  },

  // Social Buttons
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#333",
    borderWidth: 1,
    borderColor: "#444",
  },
  appleButton: {
    backgroundColor: "#000",
    borderColor: "#333",
  },
  buttonIcon: {
    marginRight: 12,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },

  // OTP Section
  backToEmailButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  backToEmailText: {
    color: "#4CAF82",
    fontSize: 14,
    fontWeight: "500",
  },
  otpTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  otpSubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  otpEmailHighlight: {
    color: "#FFD700",
    fontWeight: "600",
  },
  otpContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpBoxes: {
    flexDirection: "row",
    gap: 10,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  otpBoxFilled: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  otpBoxFocused: {
    borderColor: "#4CAF82",
  },
  otpDigit: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  resendContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  resendText: {
    color: "#888",
    fontSize: 14,
  },
  resendLink: {
    color: "#4CAF82",
    fontSize: 14,
    fontWeight: "600",
  },
  resendCooldown: {
    color: "#666",
    fontSize: 14,
  },

  // Error
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#ff6b6b",
    fontSize: 14,
  },
  errorDismiss: {
    padding: 4,
  },

  // Footer
  footer: {
    alignItems: "center",
    marginBottom: 20,
  },
  footerText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 18,
  },
  footerLink: {
    color: "#888",
    textDecorationLine: "underline",
  },
});
