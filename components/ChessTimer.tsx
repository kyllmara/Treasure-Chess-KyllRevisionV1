import React, { useEffect, useRef, useState, useCallback, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AppState,
  AppStateStatus,
} from "react-native";
import { Audio } from "expo-av";

export interface TimeControl {
  initial: number; // seconds
  increment: number; // seconds per move
  name: string;
}

// Standard time controls
export const TIME_CONTROLS: TimeControl[] = [
  { initial: 60, increment: 0, name: "1+0 Bullet" },
  { initial: 180, increment: 0, name: "3+0 Blitz" },
  { initial: 180, increment: 2, name: "3+2 Blitz" },
  { initial: 300, increment: 0, name: "5+0 Blitz" },
  { initial: 300, increment: 3, name: "5+3 Blitz" },
  { initial: 600, increment: 0, name: "10+0 Rapid" },
  { initial: 900, increment: 10, name: "15+10 Rapid" },
  { initial: 1800, increment: 0, name: "30+0 Classical" },
];

export interface ChessTimerProps {
  timeMs: number; // Time in milliseconds
  isActive: boolean;
  isPlayerTimer?: boolean;
  onTimeout?: () => void;
  onTick?: (timeMs: number) => void;
  showMilliseconds?: boolean;
  size?: "small" | "medium" | "large";
  lowTimeThresholdMs?: number; // When to show warning (default 30s)
  criticalTimeThresholdMs?: number; // When to flash (default 10s)
  enableLowTimeSound?: boolean;
  soundEnabled?: boolean;
}

const formatTime = (ms: number, showMs: boolean = false): string => {
  if (ms <= 0) return "0:00";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 100);

  if (showMs && totalSeconds < 20) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const ChessTimer = memo(function ChessTimer({
  timeMs,
  isActive,
  isPlayerTimer = true,
  onTimeout,
  onTick,
  showMilliseconds = true,
  size = "medium",
  lowTimeThresholdMs = 30000,
  criticalTimeThresholdMs = 10000,
  enableLowTimeSound = true,
  soundEnabled = true,
}: ChessTimerProps) {
  const [internalTime, setInternalTime] = useState(timeMs);
  const [hasPlayedLowTimeSound, setHasPlayedLowTimeSound] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const soundRef = useRef<Audio.Sound | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pausedTimeRef = useRef<number | null>(null);

  // Flashing animation for critical time
  const flashAnim = useRef(new Animated.Value(1)).current;
  const isFlashing = useRef(false);

  // Sync with prop when not active
  useEffect(() => {
    if (!isActive) {
      setInternalTime(timeMs);
      setHasPlayedLowTimeSound(false);
    }
  }, [timeMs, isActive]);

  // Load low time sound
  useEffect(() => {
    const loadSound = async () => {
      if (!enableLowTimeSound) return;

      try {
        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/clock.mp3"),
          { shouldPlay: false }
        );
        soundRef.current = sound;
      } catch (e) {
        // Sound file might not exist, continue without it
        console.log("Low time sound not available");
      }
    };

    loadSound();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [enableLowTimeSound]);

  // Handle app state changes (pause when backgrounded)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - save current time
        if (isActive) {
          pausedTimeRef.current = internalTime;
        }
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App coming back - restore time (server will sync actual time)
        if (pausedTimeRef.current !== null) {
          setInternalTime(pausedTimeRef.current);
          pausedTimeRef.current = null;
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isActive, internalTime]);

  // Timer countdown
  useEffect(() => {
    if (isActive && internalTime > 0) {
      lastTickRef.current = Date.now();

      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - lastTickRef.current;
        lastTickRef.current = now;

        setInternalTime((prev) => {
          const newTime = Math.max(0, prev - elapsed);

          // Report tick to parent
          if (onTick) {
            onTick(newTime);
          }

          // Check for timeout
          if (newTime === 0 && onTimeout) {
            onTimeout();
          }

          return newTime;
        });
      }, 100); // Update every 100ms for smooth display

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [isActive, onTimeout, onTick]);

  // Play low time sound
  useEffect(() => {
    const playLowTimeSound = async () => {
      if (
        enableLowTimeSound &&
        soundEnabled &&
        soundRef.current &&
        internalTime <= criticalTimeThresholdMs &&
        internalTime > 0 &&
        isActive &&
        !hasPlayedLowTimeSound
      ) {
        try {
          await soundRef.current.setPositionAsync(0);
          await soundRef.current.playAsync();
          setHasPlayedLowTimeSound(true);
        } catch (e) {
          // Ignore sound errors
        }
      }
    };

    playLowTimeSound();
  }, [
    internalTime,
    criticalTimeThresholdMs,
    enableLowTimeSound,
    soundEnabled,
    isActive,
    hasPlayedLowTimeSound,
  ]);

  // Flash animation for critical time
  useEffect(() => {
    if (internalTime <= criticalTimeThresholdMs && internalTime > 0 && isActive) {
      if (!isFlashing.current) {
        isFlashing.current = true;
        Animated.loop(
          Animated.sequence([
            Animated.timing(flashAnim, {
              toValue: 0.3,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(flashAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    } else {
      isFlashing.current = false;
      flashAnim.stopAnimation();
      flashAnim.setValue(1);
    }
  }, [internalTime, criticalTimeThresholdMs, isActive, flashAnim]);

  // Determine colors based on time
  const getTimerColors = useCallback(() => {
    if (internalTime <= criticalTimeThresholdMs) {
      return {
        background: "#FF3B30",
        text: "#FFFFFF",
      };
    }
    if (internalTime <= lowTimeThresholdMs) {
      return {
        background: "#FF9500",
        text: "#FFFFFF",
      };
    }
    if (isActive) {
      return {
        background: "#4ECDC4",
        text: "#0F0F1E",
      };
    }
    return {
      background: "rgba(255, 255, 255, 0.1)",
      text: "#FFFFFF",
    };
  }, [internalTime, lowTimeThresholdMs, criticalTimeThresholdMs, isActive]);

  const colors = getTimerColors();
  const showMs = showMilliseconds && internalTime < 20000;

  const sizeStyles = {
    small: { container: styles.containerSmall, text: styles.textSmall },
    medium: { container: styles.containerMedium, text: styles.textMedium },
    large: { container: styles.containerLarge, text: styles.textLarge },
  };

  return (
    <Animated.View
      style={[
        styles.container,
        sizeStyles[size].container,
        { backgroundColor: colors.background, opacity: flashAnim },
        isActive && styles.activeContainer,
      ]}
    >
      <Text style={[styles.timeText, sizeStyles[size].text, { color: colors.text }]}>
        {formatTime(internalTime, showMs)}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  activeContainer: {
    shadowColor: "#4ECDC4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  containerSmall: {
    paddingVertical: 6,
    minWidth: 70,
  },
  containerMedium: {
    paddingVertical: 10,
    minWidth: 90,
  },
  containerLarge: {
    paddingVertical: 14,
    minWidth: 120,
  },
  timeText: {
    fontFamily: "monospace",
    fontWeight: "700",
  },
  textSmall: {
    fontSize: 16,
  },
  textMedium: {
    fontSize: 22,
  },
  textLarge: {
    fontSize: 32,
  },
});

export default ChessTimer;
