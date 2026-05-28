/**
 * Input Sanitization and XSS Prevention
 *
 * Comprehensive sanitization for user-generated content.
 * Prevents XSS attacks and malicious input injection.
 *
 * @module lib/security/sanitization
 */

// ============================================================================
// HTML Entity Encoding Map
// ============================================================================

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

const HTML_ENTITY_REGEX = /[&<>"'`=/]/g;

// ============================================================================
// Dangerous Patterns
// ============================================================================

/** Patterns that indicate potential XSS or injection attacks */
const DANGEROUS_PATTERNS = [
  // Script tags
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  // Event handlers
  /\bon\w+\s*=/gi,
  // JavaScript URLs
  /javascript:/gi,
  // Data URLs with executable content
  /data:\s*(?:text\/html|application\/javascript)/gi,
  // VBScript (legacy but still checked)
  /vbscript:/gi,
  // Expression() CSS
  /expression\s*\(/gi,
  // Import statements
  /@import/gi,
  // Encoded script tags
  /&#x3C;script/gi,
  /&#60;script/gi,
  // SVG handlers
  /<svg[^>]*onload/gi,
  // Iframe injection
  /<iframe/gi,
  // Object/embed tags
  /<object/gi,
  /<embed/gi,
  // Form injection
  /<form/gi,
  // Link injection with JS
  /<a[^>]*href\s*=\s*["']?javascript:/gi,
];

/** SQL injection patterns */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
  /--/g,
  /;/g,
  /\/\*/g,
  /\*\//g,
  /xp_/gi,
  /sp_/gi,
];

/** Command injection patterns */
const COMMAND_INJECTION_PATTERNS = [
  /[|;&`$(){}[\]<>]/g,
  /\$\(/g,
  /`/g,
];

// ============================================================================
// Core Sanitization Functions
// ============================================================================

/**
 * Encode HTML entities to prevent XSS
 */
export function encodeHtmlEntities(input: string): string {
  if (typeof input !== "string") return "";
  return input.replace(HTML_ENTITY_REGEX, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Strip all HTML tags from a string
 */
export function stripHtml(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, "")
    .trim();
}

/**
 * Remove potentially dangerous patterns from input
 */
export function removeDangerousPatterns(input: string): string {
  if (typeof input !== "string") return "";

  let sanitized = input;

  // Remove dangerous HTML/JS patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  return sanitized;
}

/**
 * Comprehensive XSS sanitization for display names
 * Returns safe string for rendering in UI
 */
export function sanitizeDisplayName(input: string): string {
  if (typeof input !== "string") return "";

  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");

  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Strip HTML tags
  sanitized = stripHtml(sanitized);

  // Remove dangerous patterns
  sanitized = removeDangerousPatterns(sanitized);

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  // Limit length
  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 50);
  }

  // Encode remaining special characters
  sanitized = encodeHtmlEntities(sanitized);

  return sanitized;
}

/**
 * Sanitize username (strict alphanumeric only)
 */
export function sanitizeUsername(input: string): string {
  if (typeof input !== "string") return "";

  // Only allow alphanumeric and underscores
  return input
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase()
    .substring(0, 30);
}

/**
 * Sanitize message/chat content
 */
export function sanitizeMessage(input: string): string {
  if (typeof input !== "string") return "";

  // Remove null bytes
  let sanitized = input.replace(/\0/g, "");

  // Remove control characters except newlines
  sanitized = sanitized.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Strip HTML
  sanitized = stripHtml(sanitized);

  // Remove dangerous patterns
  sanitized = removeDangerousPatterns(sanitized);

  // Normalize excessive newlines
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  // Normalize spaces
  sanitized = sanitized.replace(/[ \t]+/g, " ");

  // Trim
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
}

/**
 * Sanitize URL (only allow safe protocols)
 */
export function sanitizeUrl(input: string): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim().toLowerCase();

  // Only allow http and https protocols
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return null;
  }

  // Check for dangerous patterns
  if (
    trimmed.includes("javascript:") ||
    trimmed.includes("vbscript:") ||
    trimmed.includes("data:")
  ) {
    return null;
  }

  try {
    const url = new URL(input);
    // Only allow http(s)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "")
    .substring(0, 255);
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect potential XSS attack in input
 */
export function detectXss(input: string): {
  isClean: boolean;
  threats: string[];
} {
  if (typeof input !== "string") {
    return { isClean: true, threats: [] };
  }

  const threats: string[] = [];

  // Check for script tags
  if (/<script/i.test(input)) {
    threats.push("Script tag detected");
  }

  // Check for event handlers
  if (/\bon\w+\s*=/i.test(input)) {
    threats.push("Event handler detected");
  }

  // Check for javascript: protocol
  if (/javascript:/i.test(input)) {
    threats.push("JavaScript protocol detected");
  }

  // Check for data: with executable content
  if (/data:\s*(?:text\/html|application\/javascript)/i.test(input)) {
    threats.push("Executable data URL detected");
  }

  // Check for HTML tags
  if (/<[a-z][^>]*>/i.test(input)) {
    threats.push("HTML tag detected");
  }

  // Check for encoded attacks
  if (/&#x?[0-9a-f]+;/i.test(input)) {
    threats.push("HTML entity encoding detected");
  }

  return {
    isClean: threats.length === 0,
    threats,
  };
}

/**
 * Detect potential SQL injection
 */
export function detectSqlInjection(input: string): {
  isClean: boolean;
  threats: string[];
} {
  if (typeof input !== "string") {
    return { isClean: true, threats: [] };
  }

  const threats: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(`SQL injection pattern detected: ${pattern.source}`);
    }
  }

  return {
    isClean: threats.length === 0,
    threats,
  };
}

/**
 * Detect potential command injection
 */
export function detectCommandInjection(input: string): {
  isClean: boolean;
  threats: string[];
} {
  if (typeof input !== "string") {
    return { isClean: true, threats: [] };
  }

  const threats: string[] = [];

  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      threats.push(`Command injection character detected: ${pattern.source}`);
    }
  }

  return {
    isClean: threats.length === 0,
    threats,
  };
}

/**
 * Comprehensive security check for user input
 */
export function securityCheck(input: string): {
  isClean: boolean;
  sanitized: string;
  threats: string[];
  severity: "none" | "low" | "medium" | "high";
} {
  const xssResult = detectXss(input);
  const sqlResult = detectSqlInjection(input);
  const cmdResult = detectCommandInjection(input);

  const allThreats = [
    ...xssResult.threats,
    ...sqlResult.threats,
    ...cmdResult.threats,
  ];

  let severity: "none" | "low" | "medium" | "high" = "none";
  if (allThreats.length > 5) {
    severity = "high";
  } else if (allThreats.length > 2) {
    severity = "medium";
  } else if (allThreats.length > 0) {
    severity = "low";
  }

  return {
    isClean: allThreats.length === 0,
    sanitized: sanitizeDisplayName(input),
    threats: allThreats,
    severity,
  };
}

// ============================================================================
// JSON Sanitization
// ============================================================================

/**
 * Sanitize JSON object recursively
 */
export function sanitizeJsonObject<T extends Record<string, any>>(
  obj: T,
  options: {
    maxDepth?: number;
    sanitizeStrings?: boolean;
  } = {}
): T {
  const { maxDepth = 10, sanitizeStrings = true } = options;

  function sanitizeValue(value: any, depth: number): any {
    if (depth > maxDepth) {
      return null;
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return sanitizeStrings ? sanitizeMessage(value) : value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, depth + 1));
    }

    if (typeof value === "object") {
      const sanitized: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitize keys too
        const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "");
        sanitized[safeKey] = sanitizeValue(val, depth + 1);
      }
      return sanitized;
    }

    // Unknown types are stripped
    return null;
  }

  return sanitizeValue(obj, 0) as T;
}

// ============================================================================
// React Native Specific
// ============================================================================

/**
 * Sanitize for React Native Text component
 * Ensures content is safe for display
 */
export function sanitizeForDisplay(input: string | null | undefined): string {
  if (input == null) return "";
  return sanitizeDisplayName(String(input));
}

/**
 * Create a safe props object for Text components
 */
export function safeTextProps(text: string | null | undefined): { children: string } {
  return {
    children: sanitizeForDisplay(text),
  };
}

// ============================================================================
// Constants Export
// ============================================================================

export const SECURITY_PATTERNS = {
  DANGEROUS_PATTERNS,
  SQL_INJECTION_PATTERNS,
  COMMAND_INJECTION_PATTERNS,
};
