/**
 * Toast Notification System
 *
 * A comprehensive toast notification system for displaying sync errors,
 * success messages, and other notifications throughout the app.
 *
 * Features:
 * - Multiple toast types (error, warning, success, info)
 * - Auto-dismiss with configurable duration
 * - Manual dismiss with swipe gesture
 * - Action button support (e.g., retry)
 * - Stacked toast management
 * - Smooth animations using Reanimated
 * - Integration with sync error system
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  X,
  RefreshCw,
} from "lucide-react-native";

// ============================================================================
// Types
// ============================================================================

export type ToastType = "error" | "warning" | "success" | "info";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
  dismissible?: boolean;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, "id">) => string;
  hideToast: (id: string) => void;
  hideAllToasts: () => void;
  showSyncError: (message: string, onRetry?: () => void) => string;
  showSuccess: (title: string, message?: string) => string;
  showInfo: (title: string, message?: string) => string;
  showWarning: (title: string, message?: string) => string;
}

// ============================================================================
// Constants
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TOAST_WIDTH = SCREEN_WIDTH - 32;
const DEFAULT_DURATION = 4000;
const MAX_VISIBLE_TOASTS = 3;
const TOAST_SPACING = 8;

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  error: {
    bg: "#FEF2F2",
    border: "#FCA5A5",
    icon: "#DC2626",
  },
  warning: {
    bg: "#FFFBEB",
    border: "#FCD34D",
    icon: "#D97706",
  },
  success: {
    bg: "#F0FDF4",
    border: "#86EFAC",
    icon: "#16A34A",
  },
  info: {
    bg: "#EFF6FF",
    border: "#93C5FD",
    icon: "#2563EB",
  },
};

// ============================================================================
// Context
// ============================================================================

const ToastContext = createContext<ToastContextType | null>(null);

// ============================================================================
// Toast Item Component
// ============================================================================

interface ToastItemProps {
  toast: Toast;
  index: number;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, index, onDismiss }: ToastItemProps) {
  const translateY = useSharedValue(-100);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const isDismissing = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = TOAST_COLORS[toast.type];

  // Enter animation
  useEffect(() => {
    translateY.value = withSpring(0, {
      damping: 20,
      stiffness: 300,
    });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSpring(1, {
      damping: 15,
      stiffness: 200,
    });
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    const duration = toast.duration ?? DEFAULT_DURATION;

    if (duration > 0) {
      dismissTimer.current = setTimeout(() => {
        dismissToast();
      }, duration);
    }

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, [toast.duration]);

  const dismissToast = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;

    translateY.value = withTiming(-100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(onDismiss)(toast.id);
    });
  }, [toast.id, onDismiss]);

  // Swipe to dismiss gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Allow horizontal swipe for dismiss
      translateX.value = event.translationX;
      // Reduce opacity based on swipe distance
      opacity.value = interpolate(
        Math.abs(event.translationX),
        [0, TOAST_WIDTH / 2],
        [1, 0.5],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      // Dismiss if swiped far enough
      if (Math.abs(event.translationX) > TOAST_WIDTH / 3) {
        translateX.value = withTiming(
          event.translationX > 0 ? TOAST_WIDTH : -TOAST_WIDTH,
          { duration: 200 },
          () => {
            runOnJS(onDismiss)(toast.id);
          }
        );
      } else {
        // Snap back
        translateX.value = withSpring(0);
        opacity.value = withTiming(1, { duration: 100 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value + index * (80 + TOAST_SPACING) },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const renderIcon = () => {
    const iconProps = { size: 20, color: colors.icon };

    switch (toast.type) {
      case "error":
        return <AlertCircle {...iconProps} />;
      case "warning":
        return <AlertTriangle {...iconProps} />;
      case "success":
        return <CheckCircle {...iconProps} />;
      case "info":
        return <Info {...iconProps} />;
    }
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.toastContainer,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
          },
          animatedStyle,
        ]}
      >
        <View style={styles.toastContent}>
          <View style={styles.iconContainer}>{renderIcon()}</View>

          <View style={styles.textContainer}>
            <Text style={styles.title}>{toast.title}</Text>
            {toast.message && (
              <Text style={styles.message} numberOfLines={2}>
                {toast.message}
              </Text>
            )}
          </View>

          <View style={styles.actionsContainer}>
            {toast.action && (
              <TouchableOpacity
                onPress={() => {
                  toast.action?.onPress();
                  dismissToast();
                }}
                style={[styles.actionButton, { borderColor: colors.icon }]}
                activeOpacity={0.7}
              >
                {toast.type === "error" && (
                  <RefreshCw size={14} color={colors.icon} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.actionText, { color: colors.icon }]}>
                  {toast.action.label}
                </Text>
              </TouchableOpacity>
            )}

            {toast.dismissible !== false && (
              <TouchableOpacity
                onPress={dismissToast}
                style={styles.dismissButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ============================================================================
// Toast Container Component
// ============================================================================

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  // Only show the most recent toasts
  const visibleToasts = toasts.slice(-MAX_VISIBLE_TOASTS);

  if (visibleToasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {visibleToasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          index={index}
          onDismiss={onDismiss}
        />
      ))}
    </View>
  );
}

// ============================================================================
// Provider
// ============================================================================

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idCounter = useRef(0);

  const generateId = useCallback(() => {
    idCounter.current += 1;
    return `toast-${Date.now()}-${idCounter.current}`;
  }, []);

  const showToast = useCallback((toast: Omit<Toast, "id">): string => {
    const id = generateId();
    const newToast: Toast = {
      id,
      dismissible: true,
      ...toast,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, [generateId]);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const hideAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showSyncError = useCallback(
    (message: string, onRetry?: () => void): string => {
      return showToast({
        type: "error",
        title: "Sync Failed",
        message,
        duration: onRetry ? 0 : DEFAULT_DURATION, // Don't auto-dismiss if retry available
        action: onRetry
          ? {
              label: "Retry",
              onPress: onRetry,
            }
          : undefined,
      });
    },
    [showToast]
  );

  const showSuccess = useCallback(
    (title: string, message?: string): string => {
      return showToast({
        type: "success",
        title,
        message,
        duration: 3000,
      });
    },
    [showToast]
  );

  const showInfo = useCallback(
    (title: string, message?: string): string => {
      return showToast({
        type: "info",
        title,
        message,
      });
    },
    [showToast]
  );

  const showWarning = useCallback(
    (title: string, message?: string): string => {
      return showToast({
        type: "warning",
        title,
        message,
      });
    },
    [showToast]
  );

  const contextValue: ToastContextType = {
    showToast,
    hideToast,
    hideAllToasts,
    showSyncError,
    showSuccess,
    showInfo,
    showWarning,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </ToastContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      "useToast must be used within a ToastProvider. " +
      "Make sure your component is wrapped with <ToastProvider>."
    );
  }

  return context;
}

// ============================================================================
// Sync Error Toast Hook
// ============================================================================

/**
 * Hook specifically for sync error toasts with automatic retry integration
 */
export function useSyncErrorToast() {
  const { showSyncError, hideToast } = useToast();

  const showError = useCallback(
    (
      error: string | Error,
      onRetry?: () => Promise<void>
    ): string => {
      const message = error instanceof Error ? error.message : error;

      const handleRetry = onRetry
        ? async () => {
            try {
              await onRetry();
            } catch (e) {
              // Show another toast if retry fails
              showError(e instanceof Error ? e.message : "Retry failed", onRetry);
            }
          }
        : undefined;

      return showSyncError(message, handleRetry);
    },
    [showSyncError]
  );

  return { showError, hideToast };
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  toastContainer: {
    position: "absolute",
    width: TOAST_WIDTH,
    minHeight: 60,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dismissButton: {
    padding: 4,
  },
});
