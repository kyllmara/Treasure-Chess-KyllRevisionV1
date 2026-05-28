/**
 * Unity Bridge
 *
 * Communication bridge between React Native and Unity game engine.
 * Handles message passing, event handling, and state synchronization.
 *
 * Architecture:
 * - React Native sends commands to Unity via postMessage
 * - Unity sends events back via a callback interface
 * - Message queue handles async communication
 * - Automatic reconnection on failure
 *
 * @module lib/chess3d/unityBridge
 */

import { Platform } from "react-native";
import type {
  UnityMessage,
  UnityEvent,
  UnityMessageType,
  UnityEventType,
  UnityBridgeConfig,
  ChessBoard3DConfig,
  Square,
} from "./types";
import { logger } from "../security";

// ============================================================================
// Types
// ============================================================================

/** Unity bridge state */
export type UnityBridgeState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "not_available";

/** Event listener callback */
type EventListener = (event: UnityEvent) => void;

/** Unity view reference (from react-native-unity) */
interface UnityViewRef {
  postMessage: (gameObject: string, method: string, message: string) => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: UnityBridgeConfig = {
  enableDebugMode: __DEV__,
  messageQueueSize: 100,
  reconnectAttempts: 3,
  reconnectDelay: 1000,
  performanceMonitoring: true,
};

// ============================================================================
// Unity Bridge Class
// ============================================================================

/**
 * Unity Bridge - handles communication with Unity game engine
 *
 * Usage:
 * ```typescript
 * const bridge = new UnityBridge();
 * bridge.addEventListener("SQUARE_PRESSED", (event) => {
 *   console.log("Square pressed:", event.payload);
 * });
 * await bridge.connect(unityViewRef);
 * bridge.sendPosition(fen);
 * ```
 */
export class UnityBridge {
  private config: UnityBridgeConfig;
  private state: UnityBridgeState = "disconnected";
  private unityRef: UnityViewRef | null = null;
  private messageQueue: UnityMessage[] = [];
  private eventListeners: Map<UnityEventType, Set<EventListener>> = new Map();
  private messageCounter = 0;
  private reconnectCount = 0;
  private isUnityAvailable = false;
  private lastPerformanceMetrics: {
    fps: number;
    drawCalls: number;
    triangles: number;
    memoryUsage: number;
  } | null = null;

  constructor(config: Partial<UnityBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.checkUnityAvailability();
  }

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  /**
   * Check if Unity is available on this platform/build
   */
  private checkUnityAvailability(): void {
    // Unity integration requires native modules
    // Check if react-native-unity is available
    try {
      // This would be the actual check for Unity availability
      // For now, we mark it as not available since it requires native setup
      this.isUnityAvailable = false;
      this.state = "not_available";

      if (this.config.enableDebugMode) {
        logger.debug("UnityBridge", "Unity not available - native module not installed");
      }
    } catch (e) {
      this.isUnityAvailable = false;
      this.state = "not_available";
    }
  }

  /**
   * Connect to Unity instance
   */
  async connect(unityRef: UnityViewRef): Promise<boolean> {
    if (!this.isUnityAvailable) {
      logger.warn("UnityBridge", "Cannot connect - Unity not available");
      return false;
    }

    this.state = "connecting";
    this.unityRef = unityRef;

    try {
      // Send initialization message
      this.sendMessage("INIT", {
        platform: Platform.OS,
        debugMode: this.config.enableDebugMode,
        performanceMonitoring: this.config.performanceMonitoring,
      });

      // Wait for READY event from Unity
      const ready = await this.waitForEvent("READY", 5000);

      if (ready) {
        this.state = "connected";
        this.reconnectCount = 0;
        this.flushMessageQueue();
        logger.info("UnityBridge", "Connected to Unity");
        return true;
      } else {
        throw new Error("Unity did not respond with READY event");
      }
    } catch (error) {
      this.state = "error";
      logger.error("UnityBridge", "Connection failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Attempt reconnection
      if (this.reconnectCount < this.config.reconnectAttempts) {
        this.reconnectCount++;
        await this.delay(this.config.reconnectDelay * this.reconnectCount);
        return this.connect(unityRef);
      }

      return false;
    }
  }

  /**
   * Disconnect from Unity
   */
  disconnect(): void {
    this.state = "disconnected";
    this.unityRef = null;
    this.messageQueue = [];
    logger.debug("UnityBridge", "Disconnected from Unity");
  }

  /**
   * Get current connection state
   */
  getState(): UnityBridgeState {
    return this.state;
  }

  /**
   * Check if connected and ready
   */
  isConnected(): boolean {
    return this.state === "connected" && this.unityRef !== null;
  }

  /**
   * Check if Unity is available (native module installed)
   */
  isAvailable(): boolean {
    return this.isUnityAvailable;
  }

  // ==========================================================================
  // Message Sending
  // ==========================================================================

  /**
   * Send a message to Unity
   */
  private sendMessage(type: UnityMessageType, payload: unknown): string {
    const message: UnityMessage = {
      type,
      payload,
      timestamp: Date.now(),
      messageId: `msg_${++this.messageCounter}_${Date.now()}`,
    };

    if (this.state === "connected" && this.unityRef) {
      this.dispatchToUnity(message);
    } else if (this.state === "connecting") {
      // Queue message for later
      this.queueMessage(message);
    } else {
      if (this.config.enableDebugMode) {
        logger.debug("UnityBridge", "Message not sent - not connected", { type });
      }
    }

    return message.messageId;
  }

  /**
   * Dispatch message to Unity via native bridge
   */
  private dispatchToUnity(message: UnityMessage): void {
    if (!this.unityRef) return;

    try {
      const serialized = JSON.stringify(message);
      this.unityRef.postMessage("ChessBridge", "OnMessage", serialized);

      if (this.config.enableDebugMode) {
        logger.debug("UnityBridge", "Message sent", { type: message.type });
      }
    } catch (error) {
      logger.error("UnityBridge", "Failed to send message", {
        type: message.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Queue message for sending when connected
   */
  private queueMessage(message: UnityMessage): void {
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      // Remove oldest message
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  /**
   * Flush queued messages after connection
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.dispatchToUnity(message);
      }
    }
  }

  // ==========================================================================
  // Chess-Specific Commands
  // ==========================================================================

  /**
   * Set the board configuration (theme, effects, etc.)
   */
  setConfig(config: Partial<ChessBoard3DConfig>): void {
    this.sendMessage("SET_CONFIG", config);
  }

  /**
   * Set the board position from FEN
   */
  setPosition(fen: string): void {
    this.sendMessage("SET_POSITION", { fen });
  }

  /**
   * Execute a move animation
   */
  makeMove(from: Square, to: Square, promotion?: string): void {
    this.sendMessage("MAKE_MOVE", { from, to, promotion });
  }

  /**
   * Select a square (highlight it)
   */
  selectSquare(square: Square): void {
    this.sendMessage("SELECT_SQUARE", { square });
  }

  /**
   * Deselect all squares
   */
  deselect(): void {
    this.sendMessage("DESELECT", {});
  }

  /**
   * Set possible move indicators
   */
  setPossibleMoves(moves: Square[], captures: Square[] = []): void {
    this.sendMessage("SET_POSSIBLE_MOVES", { moves, captures });
  }

  /**
   * Highlight the last move
   */
  highlightLastMove(from: Square, to: Square): void {
    this.sendMessage("HIGHLIGHT_LAST_MOVE", { from, to });
  }

  /**
   * Set check indicator on king
   */
  setCheck(kingSquare: Square | null): void {
    this.sendMessage("SET_CHECK", { square: kingSquare });
  }

  /**
   * Trigger checkmate animation
   */
  setCheckmate(winnerColor: "w" | "b"): void {
    this.sendMessage("SET_CHECKMATE", { winner: winnerColor });
  }

  /**
   * Trigger draw animation
   */
  setDraw(): void {
    this.sendMessage("SET_DRAW", {});
  }

  /**
   * Play a custom animation
   */
  playAnimation(animationName: string, options?: Record<string, unknown>): void {
    this.sendMessage("PLAY_ANIMATION", { name: animationName, options });
  }

  /**
   * Set camera position/preset
   */
  setCamera(
    preset: string,
    options?: { animate?: boolean; duration?: number }
  ): void {
    this.sendMessage("SET_CAMERA", { preset, ...options });
  }

  /**
   * Reset board to initial position
   */
  resetBoard(): void {
    this.sendMessage("RESET_BOARD", {});
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Add event listener for Unity events
   */
  addEventListener(type: UnityEventType, listener: EventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: UnityEventType, listener: EventListener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  /**
   * Handle incoming event from Unity
   * Called by the native Unity view component
   */
  handleUnityEvent(eventJson: string): void {
    try {
      const event: UnityEvent = JSON.parse(eventJson);

      if (this.config.enableDebugMode) {
        logger.debug("UnityBridge", "Event received", { type: event.type });
      }

      // Update performance metrics if available
      if (event.type === "PERFORMANCE_METRICS") {
        this.lastPerformanceMetrics = event.payload as typeof this.lastPerformanceMetrics;
      }

      // Notify listeners
      const listeners = this.eventListeners.get(event.type);
      if (listeners) {
        listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error) {
            logger.error("UnityBridge", "Event listener error", {
              type: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }
    } catch (error) {
      logger.error("UnityBridge", "Failed to parse Unity event", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Wait for a specific event type
   */
  private waitForEvent(
    type: UnityEventType,
    timeout: number
  ): Promise<UnityEvent | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, timeout);

      const unsubscribe = this.addEventListener(type, (event) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });
  }

  // ==========================================================================
  // Performance Monitoring
  // ==========================================================================

  /**
   * Get last performance metrics from Unity
   */
  getPerformanceMetrics(): typeof this.lastPerformanceMetrics {
    return this.lastPerformanceMetrics;
  }

  /**
   * Request performance metrics from Unity
   */
  requestPerformanceMetrics(): void {
    if (this.config.performanceMonitoring) {
      this.sendMessage("PLAY_ANIMATION", { name: "REQUEST_METRICS" });
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Global Unity bridge instance */
let bridgeInstance: UnityBridge | null = null;

/**
 * Get the global Unity bridge instance
 */
export function getUnityBridge(config?: Partial<UnityBridgeConfig>): UnityBridge {
  if (!bridgeInstance) {
    bridgeInstance = new UnityBridge(config);
  }
  return bridgeInstance;
}

/**
 * Reset the Unity bridge (for testing or reconnection)
 */
export function resetUnityBridge(): void {
  if (bridgeInstance) {
    bridgeInstance.disconnect();
    bridgeInstance = null;
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook to use Unity bridge in React components
 * Returns null if Unity is not available
 */
export function useUnityBridge(): UnityBridge | null {
  const bridge = getUnityBridge();
  return bridge.isAvailable() ? bridge : null;
}

// ============================================================================
// Native Event Handler
// ============================================================================

/**
 * Global handler for Unity events
 * This should be called from the native Unity view component
 */
export function handleUnityMessage(message: string): void {
  const bridge = getUnityBridge();
  bridge.handleUnityEvent(message);
}
