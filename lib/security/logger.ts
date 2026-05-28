/**
 * Production-Safe Logger
 *
 * Logging system that automatically disables console output in production
 * while maintaining audit trails for security-critical operations.
 *
 * @module lib/security/logger
 */

import { getEnvironment, isProduction } from "./environment";

// ============================================================================
// Types
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "audit";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

export interface AuditLogEntry extends LogEntry {
  level: "audit";
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  result: "success" | "failure";
  failureReason?: string;
}

// ============================================================================
// Configuration
// ============================================================================

interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Enable console output */
  enableConsole: boolean;
  /** Enable remote logging */
  enableRemote: boolean;
  /** Sensitive fields to redact */
  redactFields: string[];
  /** Maximum log entries to keep in memory */
  maxMemoryEntries: number;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  audit: 4, // Always logged
};

const developmentConfig: LoggerConfig = {
  minLevel: "debug",
  enableConsole: true,
  enableRemote: false,
  redactFields: ["password", "token", "secret", "key", "authorization"],
  maxMemoryEntries: 1000,
};

const productionConfig: LoggerConfig = {
  minLevel: "warn",
  enableConsole: false, // Disable console.log in production
  enableRemote: true,
  redactFields: [
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "cardNumber",
    "cvv",
    "ssn",
    "accountNumber",
    "routingNumber",
    "iban",
    "privateKey",
    "mnemonic",
    "seedPhrase",
  ],
  maxMemoryEntries: 100,
};

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private config: LoggerConfig;
  private memoryLog: LogEntry[] = [];
  private auditLog: AuditLogEntry[] = [];
  private userId?: string;
  private sessionId?: string;

  constructor() {
    this.config = isProduction ? productionConfig : developmentConfig;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Set current user ID for logging context
   */
  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  /**
   * Check if log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    // Audit logs are always captured
    if (level === "audit") return true;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Redact sensitive data from object
   */
  private redact(data: Record<string, unknown>): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      // Check if field should be redacted
      if (this.config.redactFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
        redacted[key] = "[REDACTED]";
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        redacted[key] = this.redact(value as Record<string, unknown>);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Format log entry for console
   */
  private formatForConsole(entry: LogEntry): string {
    const prefix = `[${entry.level.toUpperCase()}] [${entry.category}]`;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    return `${timestamp} ${prefix} ${entry.message}`;
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? this.redact(data) : undefined,
      userId: this.userId,
      sessionId: this.sessionId,
    };

    // Store in memory
    this.memoryLog.push(entry);
    if (this.memoryLog.length > this.config.maxMemoryEntries) {
      this.memoryLog.shift();
    }

    // Console output (only in development)
    if (this.config.enableConsole) {
      const formatted = this.formatForConsole(entry);
      switch (level) {
        case "debug":
          console.debug(formatted, data);
          break;
        case "info":
          console.info(formatted, data);
          break;
        case "warn":
          console.warn(formatted, data);
          break;
        case "error":
          console.error(formatted, data);
          break;
        default:
          console.log(formatted, data);
      }
    }

    // Remote logging (production)
    if (this.config.enableRemote && (level === "error" || level === "audit")) {
      this.sendToRemote(entry).catch(() => {
        // Silently fail remote logging
      });
    }
  }

  /**
   * Send log to remote service
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    // In a real implementation, this would send to a logging service
    // like Sentry, LogRocket, Datadog, etc.
    // For now, we just store locally

    // Example implementation:
    // await fetch('https://logging.example.com/api/logs', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(entry),
    // });
  }

  // --------------------------------------------------------------------------
  // Public Logging Methods
  // --------------------------------------------------------------------------

  /**
   * Debug log (development only)
   */
  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("debug", category, message, data);
  }

  /**
   * Info log
   */
  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("info", category, message, data);
  }

  /**
   * Warning log
   */
  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log("warn", category, message, data);
  }

  /**
   * Error log
   */
  error(category: string, message: string, error?: Error | Record<string, unknown>): void {
    let data: Record<string, unknown> | undefined;

    if (error instanceof Error) {
      data = {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      };
    } else if (error) {
      data = error;
    }

    this.log("error", category, message, data);
  }

  // --------------------------------------------------------------------------
  // Audit Logging (Always captured)
  // --------------------------------------------------------------------------

  /**
   * Log security audit event
   */
  audit(
    action: string,
    resourceType: string,
    result: "success" | "failure",
    details?: {
      resourceId?: string;
      failureReason?: string;
      data?: Record<string, unknown>;
    }
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      level: "audit",
      category: "security",
      message: `${action} ${resourceType}: ${result}`,
      action,
      resourceType,
      resourceId: details?.resourceId,
      result,
      failureReason: details?.failureReason,
      data: details?.data ? this.redact(details.data) : undefined,
      userId: this.userId,
      sessionId: this.sessionId,
    };

    // Store in audit log
    this.auditLog.push(entry);

    // Also store in general log
    this.memoryLog.push(entry);

    // Always send audits to remote in production
    if (isProduction) {
      this.sendToRemote(entry).catch(() => {
        // Silently fail
      });
    }

    // Console in development
    if (this.config.enableConsole) {
      console.log(
        `[AUDIT] ${entry.timestamp} ${action} ${resourceType}: ${result}`,
        details
      );
    }
  }

  // --------------------------------------------------------------------------
  // Specialized Audit Methods
  // --------------------------------------------------------------------------

  /**
   * Log authentication event
   */
  authEvent(
    action: "login" | "logout" | "register" | "password_reset" | "token_refresh",
    result: "success" | "failure",
    details?: { method?: string; failureReason?: string }
  ): void {
    this.audit(action, "authentication", result, {
      data: { method: details?.method },
      failureReason: details?.failureReason,
    });
  }

  /**
   * Log financial transaction
   */
  financialEvent(
    action: "deposit" | "withdrawal" | "transfer" | "escrow_lock" | "escrow_release",
    result: "success" | "failure",
    details: {
      amount?: number;
      currency?: string;
      transactionId?: string;
      failureReason?: string;
    }
  ): void {
    this.audit(action, "financial", result, {
      resourceId: details.transactionId,
      data: {
        amount: details.amount,
        currency: details.currency,
      },
      failureReason: details.failureReason,
    });
  }

  /**
   * Log game event
   */
  gameEvent(
    action: "create" | "join" | "move" | "resign" | "timeout" | "complete",
    result: "success" | "failure",
    details: {
      gameId?: string;
      failureReason?: string;
    }
  ): void {
    this.audit(action, "game", result, {
      resourceId: details.gameId,
      failureReason: details.failureReason,
    });
  }

  /**
   * Log security event
   */
  securityEvent(
    action: "rate_limit_exceeded" | "invalid_token" | "suspicious_activity" | "xss_attempt",
    details: {
      ipAddress?: string;
      description?: string;
    }
  ): void {
    this.audit(action, "security_alert", "failure", {
      data: details,
      failureReason: details.description,
    });
  }

  // --------------------------------------------------------------------------
  // Log Retrieval
  // --------------------------------------------------------------------------

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.memoryLog.slice(-count);
  }

  /**
   * Get audit logs
   */
  getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.memoryLog.filter((entry) => entry.level === level);
  }

  /**
   * Get logs by category
   */
  getLogsByCategory(category: string): LogEntry[] {
    return this.memoryLog.filter((entry) => entry.category === category);
  }

  /**
   * Clear memory logs (audit logs preserved)
   */
  clearLogs(): void {
    this.memoryLog = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(
      {
        environment: getEnvironment(),
        sessionId: this.sessionId,
        userId: this.userId,
        logs: this.memoryLog,
        auditLogs: this.auditLog,
      },
      null,
      2
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const logger = new Logger();

// ============================================================================
// Convenience Functions
// ============================================================================

/** Debug log */
export const logDebug = (category: string, message: string, data?: Record<string, unknown>) =>
  logger.debug(category, message, data);

/** Info log */
export const logInfo = (category: string, message: string, data?: Record<string, unknown>) =>
  logger.info(category, message, data);

/** Warning log */
export const logWarn = (category: string, message: string, data?: Record<string, unknown>) =>
  logger.warn(category, message, data);

/** Error log */
export const logError = (category: string, message: string, error?: Error | Record<string, unknown>) =>
  logger.error(category, message, error);

/** Audit log */
export const logAudit = (
  action: string,
  resourceType: string,
  result: "success" | "failure",
  details?: { resourceId?: string; failureReason?: string; data?: Record<string, unknown> }
) => logger.audit(action, resourceType, result, details);
