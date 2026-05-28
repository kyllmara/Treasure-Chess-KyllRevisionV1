import { useState, useCallback, useRef, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { Audio } from "expo-av";

export interface TimeControl {
  initial: number; // seconds
  increment: number; // seconds per move
}

export interface GameTimerState {
  whiteTimeMs: number;
  blackTimeMs: number;
  activeColor: "w" | "b" | null;
  isRunning: boolean;
  timeoutColor: "w" | "b" | null;
}

export interface UseGameTimerOptions {
  timeControl: TimeControl;
  onTimeout?: (color: "w" | "b") => void;
  onTick?: (whiteMs: number, blackMs: number) => void;
  soundEnabled?: boolean;
}

export interface UseGameTimerReturn extends GameTimerState {
  start: (startColor?: "w" | "b") => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  switchTurn: () => void; // Switch active timer and add increment
  setTime: (color: "w" | "b", timeMs: number) => void;
  addTime: (color: "w" | "b", timeMs: number) => void;
  reset: (newTimeControl?: TimeControl) => void;
  getFormattedTime: (color: "w" | "b") => string;
  isLowTime: (color: "w" | "b", thresholdMs?: number) => boolean;
  isCriticalTime: (color: "w" | "b", thresholdMs?: number) => boolean;
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

export function useGameTimer({
  timeControl,
  onTimeout,
  onTick,
  soundEnabled = true,
}: UseGameTimerOptions): UseGameTimerReturn {
  const [whiteTimeMs, setWhiteTimeMs] = useState(timeControl.initial * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(timeControl.initial * 1000);
  const [activeColor, setActiveColor] = useState<"w" | "b" | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [timeoutColor, setTimeoutColor] = useState<"w" | "b" | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const incrementMs = useRef(timeControl.increment * 1000);
  const soundRef = useRef<Audio.Sound | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const pausedStateRef = useRef<{
    whiteMs: number;
    blackMs: number;
    activeColor: "w" | "b" | null;
  } | null>(null);

  // Update increment when timeControl changes
  useEffect(() => {
    incrementMs.current = timeControl.increment * 1000;
  }, [timeControl.increment]);

  // Load low time sound
  useEffect(() => {
    const loadSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("@/assets/sounds/clock.mp3"),
          { shouldPlay: false }
        );
        soundRef.current = sound;
      } catch (e) {
        // Sound file might not exist
      }
    };

    loadSound();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current === "active" &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background - pause timer
        if (isRunning && activeColor) {
          pausedStateRef.current = {
            whiteMs: whiteTimeMs,
            blackMs: blackTimeMs,
            activeColor,
          };
          // Stop interval but keep state
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } else if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // App coming back - resume if was running
        if (pausedStateRef.current && isRunning) {
          lastTickRef.current = Date.now();
          startInterval();
        }
        pausedStateRef.current = null;
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isRunning, activeColor, whiteTimeMs, blackTimeMs]);

  const startInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      setWhiteTimeMs((prevWhite) => {
        setBlackTimeMs((prevBlack) => {
          let newWhite = prevWhite;
          let newBlack = prevBlack;

          setActiveColor((currentActive) => {
            if (currentActive === "w") {
              newWhite = Math.max(0, prevWhite - elapsed);
              if (newWhite === 0) {
                setTimeoutColor("w");
                setIsRunning(false);
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                onTimeout?.("w");
              }
            } else if (currentActive === "b") {
              newBlack = Math.max(0, prevBlack - elapsed);
              if (newBlack === 0) {
                setTimeoutColor("b");
                setIsRunning(false);
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                onTimeout?.("b");
              }
            }

            return currentActive;
          });

          onTick?.(newWhite, newBlack);
          return newBlack;
        });

        return prevWhite;
      });
    }, 100);
  }, [onTimeout, onTick]);

  // Start timer
  const start = useCallback(
    (startColor: "w" | "b" = "w") => {
      setActiveColor(startColor);
      setIsRunning(true);
      setTimeoutColor(null);
      lastTickRef.current = Date.now();
      startInterval();
    },
    [startInterval]
  );

  // Stop timer completely
  const stop = useCallback(() => {
    setIsRunning(false);
    setActiveColor(null);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Pause timer (keeps active color)
  const pause = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Resume timer
  const resume = useCallback(() => {
    if (activeColor) {
      setIsRunning(true);
      lastTickRef.current = Date.now();
      startInterval();
    }
  }, [activeColor, startInterval]);

  // Switch turn and add increment
  const switchTurn = useCallback(() => {
    setActiveColor((current) => {
      if (!current) return null;

      // Add increment to the player who just moved
      if (current === "w") {
        setWhiteTimeMs((prev) => prev + incrementMs.current);
      } else {
        setBlackTimeMs((prev) => prev + incrementMs.current);
      }

      return current === "w" ? "b" : "w";
    });
    lastTickRef.current = Date.now();
  }, []);

  // Set time for a specific color
  const setTime = useCallback((color: "w" | "b", timeMs: number) => {
    if (color === "w") {
      setWhiteTimeMs(timeMs);
    } else {
      setBlackTimeMs(timeMs);
    }
  }, []);

  // Add time to a specific color
  const addTime = useCallback((color: "w" | "b", timeMs: number) => {
    if (color === "w") {
      setWhiteTimeMs((prev) => prev + timeMs);
    } else {
      setBlackTimeMs((prev) => prev + timeMs);
    }
  }, []);

  // Reset timers
  const reset = useCallback(
    (newTimeControl?: TimeControl) => {
      stop();
      const tc = newTimeControl || timeControl;
      setWhiteTimeMs(tc.initial * 1000);
      setBlackTimeMs(tc.initial * 1000);
      incrementMs.current = tc.increment * 1000;
      setTimeoutColor(null);
    },
    [stop, timeControl]
  );

  // Get formatted time string
  const getFormattedTime = useCallback(
    (color: "w" | "b"): string => {
      const timeMs = color === "w" ? whiteTimeMs : blackTimeMs;
      return formatTime(timeMs, timeMs < 20000);
    },
    [whiteTimeMs, blackTimeMs]
  );

  // Check if time is low
  const isLowTime = useCallback(
    (color: "w" | "b", thresholdMs: number = 30000): boolean => {
      const timeMs = color === "w" ? whiteTimeMs : blackTimeMs;
      return timeMs <= thresholdMs && timeMs > 0;
    },
    [whiteTimeMs, blackTimeMs]
  );

  // Check if time is critical
  const isCriticalTime = useCallback(
    (color: "w" | "b", thresholdMs: number = 10000): boolean => {
      const timeMs = color === "w" ? whiteTimeMs : blackTimeMs;
      return timeMs <= thresholdMs && timeMs > 0;
    },
    [whiteTimeMs, blackTimeMs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    whiteTimeMs,
    blackTimeMs,
    activeColor,
    isRunning,
    timeoutColor,
    start,
    stop,
    pause,
    resume,
    switchTurn,
    setTime,
    addTime,
    reset,
    getFormattedTime,
    isLowTime,
    isCriticalTime,
  };
}

export default useGameTimer;
