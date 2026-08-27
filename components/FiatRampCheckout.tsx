/**
 * FiatRampCheckout Component
 *
 * WebView-based checkout component for MoonPay and Transak widgets.
 * Handles the full buy/sell flow within the app.
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
} from "lucide-react-native";
import * as Linking from "expo-linking";
import type {
  FiatRampProvider,
  FiatCurrency,
  OrderType,
} from "@/lib/fiat-ramp/types";
import { getFiatRampService, tctToUsd } from "@/lib/fiat-ramp";

interface FiatRampCheckoutProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (success: boolean, orderId?: string) => void;
  userId: string;
  walletAddress: string;
  orderType: OrderType;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  tctAmount?: number;
  email?: string;
  preferredProvider?: FiatRampProvider;
}

type CheckoutState =
  | "loading"
  | "ready"
  | "processing"
  | "success"
  | "error"
  | "closed";

export function FiatRampCheckout({
  visible,
  onClose,
  onComplete,
  userId,
  walletAddress,
  orderType,
  fiatAmount,
  fiatCurrency,
  tctAmount,
  email,
  preferredProvider,
}: FiatRampCheckoutProps) {
  const [state, setState] = useState<CheckoutState>("loading");
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<FiatRampProvider | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const webViewRef = useRef<WebView>(null);

  // Initialize and get widget URL
  useEffect(() => {
    if (visible) {
      initializeCheckout();
    } else {
      // Reset state when hidden
      setState("loading");
      setWidgetUrl(null);
      setError(null);
      setLoadProgress(0);
    }
  }, [visible]);

  const initializeCheckout = async () => {
    setState("loading");
    setError(null);

    try {
      const service = getFiatRampService();
      await service.initialize();

      // Check if any provider is configured
      if (!service.isConfigured()) {
        setError("Fiat ramp providers are not configured. Please try again later.");
        setState("error");
        return;
      }

      // Get widget URL based on order type
      const result =
        orderType === "buy"
          ? await service.getBuyWidgetUrl({
              userId,
              walletAddress,
              orderType,
              fiatAmount,
              fiatCurrency,
              email,
              preferredProvider,
            })
          : await service.getSellWidgetUrl({
              userId,
              walletAddress,
              orderType,
              fiatAmount,
              fiatCurrency,
              email,
              preferredProvider,
            });

      if (!result) {
        const availability = await service.getAvailability();
        if (!availability.moonpay.available && !availability.transak.available) {
          setError(
            "No payment providers are available in your region. Please try a different payment method."
          );
        } else {
          setError("Unable to initialize payment. Please try again.");
        }
        setState("error");
        return;
      }

      setWidgetUrl(result.url);
      setProvider(result.provider);
      setOrderId(result.orderId);
      setState("ready");
    } catch (err) {
      console.error("Checkout initialization error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize checkout"
      );
      setState("error");
    }
  };

  // Handle navigation state changes in WebView
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      const { url } = navState;

      // Check for success redirect URLs
      if (url.includes("success") || url.includes("complete")) {
        setState("success");
        setTimeout(() => {
          onComplete(true, orderId || undefined);
        }, 2000);
        return;
      }

      // Check for cancel/close URLs
      if (url.includes("cancel") || url.includes("close")) {
        handleClose();
        return;
      }

      // Check for failure URLs
      if (url.includes("fail") || url.includes("error")) {
        setState("error");
        setError("Payment failed. Please try again.");
        return;
      }
    },
    [orderId, onComplete]
  );

  // Handle WebView messages (postMessage from widget)
  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case "MOONPAY_WIDGET_CLOSE":
          case "TRANSAK_WIDGET_CLOSE":
            handleClose();
            break;

          case "MOONPAY_TRANSACTION_COMPLETED":
          case "TRANSAK_ORDER_SUCCESSFUL":
            setState("success");
            setTimeout(() => {
              onComplete(true, orderId || undefined);
            }, 2000);
            break;

          case "MOONPAY_TRANSACTION_FAILED":
          case "TRANSAK_ORDER_FAILED":
            setState("error");
            setError(data.message || "Payment failed");
            break;

          default:
            console.log("Widget message:", data);
        }
      } catch {
        // Not a JSON message, ignore
      }
    },
    [orderId, onComplete]
  );

  // Handle close
  const handleClose = useCallback(() => {
    if (state === "success") {
      onComplete(true, orderId || undefined);
    } else {
      onComplete(false);
    }
    onClose();
  }, [state, orderId, onComplete, onClose]);

  // Handle external links
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      // Allow widget URLs
      if (
        request.url.includes("moonpay.com") ||
        request.url.includes("transak.com")
      ) {
        return true;
      }

      // Open external links in browser
      if (
        request.url.startsWith("http") &&
        !request.url.includes("moonpay") &&
        !request.url.includes("transak")
      ) {
        Linking.openURL(request.url);
        return false;
      }

      return true;
    },
    []
  );

  // Render loading state
  const renderLoading = () => (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#FFD700" />
      <Text style={styles.loadingText}>Initializing payment...</Text>
    </View>
  );

  // Render error state
  const renderError = () => (
    <View style={styles.centerContainer}>
      <View style={styles.errorIconContainer}>
        <AlertCircle size={48} color="#F5576C" />
      </View>
      <Text style={styles.errorTitle}>Unable to Load Payment</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <View style={styles.errorActions}>
        <TouchableOpacity style={styles.retryButton} onPress={initializeCheckout}>
          <RefreshCw size={18} color="#FFD700" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeErrorButton} onPress={handleClose}>
          <Text style={styles.closeErrorButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render success state
  const renderSuccess = () => (
    <View style={styles.centerContainer}>
      <View style={styles.successIconContainer}>
        <CheckCircle size={64} color="#4CAF82" />
      </View>
      <Text style={styles.successTitle}>
        {orderType === "buy" ? "Deposit Initiated!" : "Withdrawal Initiated!"}
      </Text>
      <Text style={styles.successMessage}>
        {orderType === "buy"
          ? "Your payment is being processed. TCT will be credited once confirmed."
          : "Your withdrawal is being processed. Funds will arrive soon."}
      </Text>
      <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
        <LinearGradient
          colors={["#4CAF82", "#3A9F6E"]}
          style={styles.doneButtonGradient}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // Render WebView
  const renderWebView = () => {
    if (!widgetUrl) return null;

    return (
      <View style={styles.webViewContainer}>
        {/* Loading progress bar */}
        {loadProgress < 1 && (
          <View style={styles.progressBarContainer}>
            <View
              style={[styles.progressBar, { width: `${loadProgress * 100}%` }]}
            />
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: widgetUrl }}
          style={styles.webView}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onLoadProgress={({ nativeEvent }) =>
            setLoadProgress(nativeEvent.progress)
          }
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error("WebView error:", nativeEvent);
            setError("Failed to load payment page. Please try again.");
            setState("error");
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#FFD700" />
            </View>
          )}
          // Security settings
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Inject script to capture widget events
          injectedJavaScript={`
            (function() {
              window.addEventListener('message', function(event) {
                window.ReactNativeWebView.postMessage(JSON.stringify(event.data));
              });
            })();
            true;
          `}
        />
      </View>
    );
  };

  // Render content based on state
  const renderContent = () => {
    switch (state) {
      case "loading":
        return renderLoading();
      case "error":
        return renderError();
      case "success":
        return renderSuccess();
      case "ready":
      case "processing":
        return renderWebView();
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {orderType === "buy" ? "Deposit Funds" : "Withdraw Funds"}
          </Text>
          {provider && (
            <View style={styles.providerBadge}>
              <Text style={styles.providerText}>
                via {provider === "moonpay" ? "MoonPay" : "Transak"}
              </Text>
            </View>
          )}
        </View>

        {/* Order Summary (when ready) */}
        {state === "ready" && (
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue}>
                {fiatCurrency} {fiatAmount.toFixed(2)}
              </Text>
            </View>
            {tctAmount && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>TCT</Text>
                <Text style={styles.summaryValue}>
                  {orderType === "buy" ? "+" : "-"}
                  {tctAmount.toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Main Content */}
        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginRight: 40, // Balance the close button
  },
  providerBadge: {
    position: "absolute",
    right: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  providerText: {
    fontSize: 12,
    color: "#FFD700",
    fontWeight: "600",
  },

  // Summary Bar
  summaryBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255, 215, 0, 0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#A0A0A0",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFD700",
    marginTop: 2,
  },

  // Content
  content: {
    flex: 1,
  },

  // Center Container (loading, error, success)
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
    color: "#A0A0A0",
    marginTop: 16,
  },

  // Error State
  errorIconContainer: {
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 15,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  errorActions: {
    flexDirection: "row",
    gap: 16,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFD700",
  },
  closeErrorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  closeErrorButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Success State
  successIconContainer: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
    textAlign: "center",
  },
  successMessage: {
    fontSize: 15,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
    maxWidth: 280,
  },
  doneButton: {
    borderRadius: 12,
    overflow: "hidden",
    width: 200,
  },
  doneButtonGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // WebView
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: "#0F0F1E",
  },
  webViewLoading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F0F1E",
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#FFD700",
  },
});

export default FiatRampCheckout;
