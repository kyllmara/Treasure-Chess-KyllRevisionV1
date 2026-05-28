/**
 * Migration Screen Component
 *
 * Full-screen modal for data migration from local storage to Supabase.
 * Shows migration summary, progress, and handles success/failure states.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Wallet,
  User,
  Settings,
  ArrowRight,
  RotateCcw,
  X,
  Shield,
} from "lucide-react-native";
import {
  MigrationService,
  type MigrationProgress,
  type MigrationStep,
  type MigrationResult,
} from "@/lib/migration";

// ============================================================================
// Types
// ============================================================================

interface MigrationScreenProps {
  visible: boolean;
  userId: string;
  onComplete: (success: boolean) => void;
  onSkip?: () => void;
}

interface MigrationSummary {
  hasUser: boolean;
  transactionCount: number;
  localBalance: number;
  localBalanceTct: number;
  localElo: number;
  gamesPlayed: number;
}

type ScreenState = "summary" | "migrating" | "success" | "failed";

// ============================================================================
// Step Icons
// ============================================================================

const STEP_CONFIG: Record<
  MigrationStep,
  { icon: React.ElementType; label: string; color: string }
> = {
  detecting: { icon: Database, label: "Detecting data", color: "#4ECDC4" },
  backing_up: { icon: Shield, label: "Creating backup", color: "#4ECDC4" },
  migrating_profile: { icon: User, label: "Profile data", color: "#FFD700" },
  migrating_balance: { icon: Wallet, label: "Wallet balance", color: "#FFD700" },
  migrating_transactions: { icon: Database, label: "Transactions", color: "#FFD700" },
  migrating_settings: { icon: Settings, label: "Settings", color: "#FFD700" },
  verifying: { icon: CheckCircle, label: "Verifying", color: "#4ECDC4" },
  cleaning_up: { icon: Database, label: "Cleaning up", color: "#4ECDC4" },
  complete: { icon: CheckCircle, label: "Complete", color: "#4ECDC4" },
  failed: { icon: AlertCircle, label: "Failed", color: "#FF6B6B" },
};

// ============================================================================
// Components
// ============================================================================

function StepIndicator({
  step,
  isActive,
  isComplete,
  isFailed,
}: {
  step: MigrationStep;
  isActive: boolean;
  isComplete: boolean;
  isFailed: boolean;
}) {
  const config = STEP_CONFIG[step];
  const Icon = config.icon;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isActive, pulseAnim]);

  const iconColor = isFailed
    ? "#FF6B6B"
    : isComplete
    ? "#4ECDC4"
    : isActive
    ? "#FFD700"
    : "#666666";

  return (
    <View style={styles.stepIndicator}>
      <Animated.View
        style={[
          styles.stepIconContainer,
          isComplete && styles.stepIconComplete,
          isFailed && styles.stepIconFailed,
          isActive && styles.stepIconActive,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        {isComplete ? (
          <CheckCircle size={20} color="#4ECDC4" />
        ) : isFailed ? (
          <AlertCircle size={20} color="#FF6B6B" />
        ) : (
          <Icon size={20} color={iconColor} />
        )}
      </Animated.View>
      <Text
        style={[
          styles.stepLabel,
          isComplete && styles.stepLabelComplete,
          isFailed && styles.stepLabelFailed,
          isActive && styles.stepLabelActive,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

function ProgressBar({ percentage }: { percentage: number }) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [percentage, widthAnim]);

  return (
    <View style={styles.progressBarContainer}>
      <Animated.View
        style={[
          styles.progressBarFill,
          {
            width: widthAnim.interpolate({
              inputRange: [0, 100],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MigrationScreen({
  visible,
  userId,
  onComplete,
  onSkip,
}: MigrationScreenProps) {
  const [screenState, setScreenState] = useState<ScreenState>("summary");
  const [summary, setSummary] = useState<MigrationSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<MigrationStep>>(new Set());
  const [canRollback, setCanRollback] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Load migration summary on mount
  useEffect(() => {
    if (visible) {
      loadSummary();
    }
  }, [visible]);

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const migrationSummary = await MigrationService.getMigrationSummary();
      setSummary(migrationSummary);
      const rollbackAvailable = await MigrationService.canRollback();
      setCanRollback(rollbackAvailable);
    } catch (error) {
      console.error("[MigrationScreen] Failed to load summary:", error);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleStartMigration = useCallback(async () => {
    setScreenState("migrating");
    setCompletedSteps(new Set());
    setProgress(null);

    const migrationResult = await MigrationService.executeMigration(
      userId,
      (progressUpdate) => {
        setProgress(progressUpdate);

        // Track completed steps
        if (progressUpdate.percentage === 100 || progressUpdate.step === "complete") {
          setCompletedSteps((prev) => new Set([...prev, progressUpdate.step]));
        }

        // Update step completion based on progress
        const stepOrder: MigrationStep[] = [
          "detecting",
          "backing_up",
          "migrating_profile",
          "migrating_balance",
          "migrating_transactions",
          "migrating_settings",
          "verifying",
          "cleaning_up",
        ];
        const currentIndex = stepOrder.indexOf(progressUpdate.step);
        if (currentIndex > 0) {
          const newCompleted = new Set(stepOrder.slice(0, currentIndex));
          setCompletedSteps((prev) => new Set([...prev, ...newCompleted]));
        }
      }
    );

    setResult(migrationResult);
    setScreenState(migrationResult.success ? "success" : "failed");

    // Check if rollback is available
    const rollbackAvailable = await MigrationService.canRollback();
    setCanRollback(rollbackAvailable);
  }, [userId]);

  const handleRetry = useCallback(() => {
    handleStartMigration();
  }, [handleStartMigration]);

  const handleRollback = useCallback(async () => {
    setIsRollingBack(true);
    try {
      const rollbackResult = await MigrationService.rollback();
      if (rollbackResult.success) {
        setScreenState("summary");
        await loadSummary();
      } else {
        // Show error
        console.error("[MigrationScreen] Rollback failed:", rollbackResult.error);
      }
    } finally {
      setIsRollingBack(false);
    }
  }, []);

  const handleDone = useCallback(() => {
    onComplete(screenState === "success");
  }, [onComplete, screenState]);

  const handleSkip = useCallback(() => {
    onSkip?.();
  }, [onSkip]);

  // Render based on state
  const renderContent = () => {
    switch (screenState) {
      case "summary":
        return renderSummary();
      case "migrating":
        return renderMigrating();
      case "success":
        return renderSuccess();
      case "failed":
        return renderFailed();
    }
  };

  const renderSkeletonItem = () => (
    <View style={styles.summaryItem}>
      <View style={styles.skeletonIcon} />
      <View style={styles.summaryItemContent}>
        <View style={styles.skeletonLabel} />
        <View style={styles.skeletonValue} />
      </View>
    </View>
  );

  const renderSummary = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.iconContainer}>
        <Database size={64} color="#FFD700" />
      </View>

      <Text style={styles.title}>Data Migration</Text>
      <Text style={styles.subtitle}>
        We found local data that needs to be synced with your account.
      </Text>

      {isLoadingSummary ? (
        <View style={styles.summaryContainer}>
          <View style={styles.skeletonTitle} />
          {renderSkeletonItem()}
          {renderSkeletonItem()}
          {renderSkeletonItem()}
        </View>
      ) : summary ? (
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>What will be migrated:</Text>

          <View style={styles.summaryItem}>
            <User size={20} color="#4ECDC4" />
            <View style={styles.summaryItemContent}>
              <Text style={styles.summaryItemLabel}>Profile Data</Text>
              <Text style={styles.summaryItemValue}>
                {summary.gamesPlayed} games played, ELO {summary.localElo}
              </Text>
            </View>
          </View>

          <View style={styles.summaryItem}>
            <Wallet size={20} color="#FFD700" />
            <View style={styles.summaryItemContent}>
              <Text style={styles.summaryItemLabel}>Wallet Balance</Text>
              <Text style={styles.summaryItemValue}>
                {summary.localBalanceTct.toLocaleString()} TCT (${summary.localBalance.toFixed(2)})
              </Text>
            </View>
          </View>

          <View style={styles.summaryItem}>
            <Database size={20} color="#9B59B6" />
            <View style={styles.summaryItemContent}>
              <Text style={styles.summaryItemLabel}>Transaction History</Text>
              <Text style={styles.summaryItemValue}>
                {summary.transactionCount} transactions
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.infoBox}>
        <Shield size={16} color="#4ECDC4" />
        <Text style={styles.infoText}>
          A backup will be created. You can rollback within 30 days if needed.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, isLoadingSummary && styles.buttonDisabled]}
        onPress={handleStartMigration}
        disabled={isLoadingSummary}
      >
        <Text style={styles.primaryButtonText}>Start Migration</Text>
        <ArrowRight size={20} color="#1A1A2E" />
      </TouchableOpacity>

      {onSkip && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  const renderMigrating = () => {
    const steps: MigrationStep[] = [
      "detecting",
      "backing_up",
      "migrating_profile",
      "migrating_balance",
      "migrating_transactions",
      "migrating_settings",
      "verifying",
      "cleaning_up",
    ];

    return (
      <View style={styles.migratingContainer}>
        <View style={styles.iconContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
        </View>

        <Text style={styles.title}>Migrating Data</Text>
        <Text style={styles.subtitle}>
          {progress?.message || "Please wait..."}
        </Text>

        <ProgressBar percentage={progress?.percentage ?? 0} />

        <View style={styles.stepsContainer}>
          {steps.map((step) => (
            <StepIndicator
              key={step}
              step={step}
              isActive={progress?.step === step}
              isComplete={completedSteps.has(step)}
              isFailed={progress?.step === "failed"}
            />
          ))}
        </View>

        {progress?.itemsProcessed !== undefined && progress?.totalItems !== undefined && (
          <Text style={styles.progressDetail}>
            {progress.itemsProcessed} / {progress.totalItems} items processed
          </Text>
        )}
      </View>
    );
  };

  const renderSuccess = () => (
    <View style={styles.resultContainer}>
      <View style={styles.successIconContainer}>
        <CheckCircle size={80} color="#4ECDC4" />
      </View>

      <Text style={styles.title}>Migration Complete!</Text>
      <Text style={styles.subtitle}>
        Your data has been successfully synced with your account.
      </Text>

      {result && (
        <View style={styles.resultSummary}>
          {result.migratedItems.profile && (
            <View style={styles.resultItem}>
              <CheckCircle size={16} color="#4ECDC4" />
              <Text style={styles.resultItemText}>Profile data migrated</Text>
            </View>
          )}
          {result.migratedItems.balance && (
            <View style={styles.resultItem}>
              <CheckCircle size={16} color="#4ECDC4" />
              <Text style={styles.resultItemText}>Wallet balance migrated</Text>
            </View>
          )}
          {result.migratedItems.transactionsCount > 0 && (
            <View style={styles.resultItem}>
              <CheckCircle size={16} color="#4ECDC4" />
              <Text style={styles.resultItemText}>
                {result.migratedItems.transactionsCount} transactions migrated
              </Text>
            </View>
          )}
          {result.migratedItems.settings && (
            <View style={styles.resultItem}>
              <CheckCircle size={16} color="#4ECDC4" />
              <Text style={styles.resultItemText}>Settings migrated</Text>
            </View>
          )}
        </View>
      )}

      {canRollback && (
        <View style={styles.rollbackInfo}>
          <RotateCcw size={14} color="#888888" />
          <Text style={styles.rollbackInfoText}>
            You can rollback this migration within 30 days from Settings.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={handleDone}>
        <Text style={styles.primaryButtonText}>Continue</Text>
        <ArrowRight size={20} color="#1A1A2E" />
      </TouchableOpacity>
    </View>
  );

  const renderFailed = () => (
    <View style={styles.resultContainer}>
      <View style={styles.errorIconContainer}>
        <AlertCircle size={80} color="#FF6B6B" />
      </View>

      <Text style={styles.title}>Migration Failed</Text>
      <Text style={styles.subtitle}>
        {result?.errors[0]?.message || "An error occurred during migration."}
      </Text>

      {result?.errors && result.errors.length > 0 && (
        <View style={styles.errorList}>
          {result.errors.slice(0, 3).map((error, index) => (
            <View key={index} style={styles.errorItem}>
              <AlertCircle size={14} color="#FF6B6B" />
              <Text style={styles.errorItemText} numberOfLines={2}>
                {error.message}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infoBox}>
        <Shield size={16} color="#4ECDC4" />
        <Text style={styles.infoText}>
          Your local data is safe. No data was lost.
        </Text>
      </View>

      <View style={styles.buttonRow}>
        {result?.canRetry && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <RefreshCw size={20} color="#1A1A2E" />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}

        {canRollback && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleRollback}
            disabled={isRollingBack}
          >
            {isRollingBack ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <>
                <RotateCcw size={20} color="#FFD700" />
                <Text style={styles.secondaryButtonText}>Rollback</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={handleDone}>
        <Text style={styles.skipButtonText}>Continue without migration</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {}}
    >
      <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {screenState !== "migrating" && (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleSkip || handleDone}
            >
              <X size={24} color="#888888" />
            </TouchableOpacity>
          )}
          {renderContent()}
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#A0A0A0",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  summaryContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888888",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  summaryItemContent: {
    marginLeft: 16,
    flex: 1,
  },
  summaryItemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  summaryItemValue: {
    fontSize: 14,
    color: "#888888",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#4ECDC4",
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1,
    borderColor: "#FFD700",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFD700",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: "#888888",
  },
  migratingContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 32,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFD700",
    borderRadius: 4,
  },
  stepsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  stepIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepIconComplete: {
    backgroundColor: "rgba(78, 205, 196, 0.2)",
  },
  stepIconFailed: {
    backgroundColor: "rgba(255, 107, 107, 0.2)",
  },
  stepIconActive: {
    backgroundColor: "rgba(255, 215, 0, 0.2)",
  },
  stepLabel: {
    fontSize: 14,
    color: "#666666",
  },
  stepLabelComplete: {
    color: "#4ECDC4",
  },
  stepLabelFailed: {
    color: "#FF6B6B",
  },
  stepLabelActive: {
    color: "#FFD700",
    fontWeight: "600",
  },
  progressDetail: {
    fontSize: 12,
    color: "#888888",
    textAlign: "center",
    marginTop: 16,
  },
  resultContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    alignItems: "center",
  },
  successIconContainer: {
    marginBottom: 24,
  },
  errorIconContainer: {
    marginBottom: 24,
  },
  resultSummary: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 12,
  },
  resultItemText: {
    fontSize: 14,
    color: "#FFFFFF",
  },
  rollbackInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  rollbackInfoText: {
    fontSize: 12,
    color: "#888888",
  },
  errorList: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  errorItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 8,
  },
  errorItemText: {
    flex: 1,
    fontSize: 14,
    color: "#FF6B6B",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  // Skeleton loading styles
  skeletonTitle: {
    width: 140,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
    marginBottom: 16,
  },
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  skeletonLabel: {
    width: 100,
    height: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonValue: {
    width: 160,
    height: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default MigrationScreen;
