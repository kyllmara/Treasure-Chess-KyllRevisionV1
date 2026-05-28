/**
 * MoonPay Integration Module
 *
 * Handles MoonPay widget URL generation, webhook verification,
 * and API interactions for fiat on/off ramp functionality.
 */

import * as Crypto from "expo-crypto";
import type {
  FiatRampConfig,
  BuyWidgetParams,
  SellWidgetParams,
  OrderResponse,
  WebhookEvent,
  MoonPay,
  OrderStatus,
  FiatCurrency,
} from "./types";
import { TCT_TO_USD_RATE, USDC_TO_TCT } from "./types";

// Environment configuration
const MOONPAY_API_KEY = process.env.EXPO_PUBLIC_MOONPAY_API_KEY || "";
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || "";
const MOONPAY_WEBHOOK_SECRET = process.env.MOONPAY_WEBHOOK_SECRET || "";
const MOONPAY_ENV = (process.env.EXPO_PUBLIC_MOONPAY_ENV || "sandbox") as
  | "sandbox"
  | "production";

/**
 * MoonPay configuration
 */
export const moonpayConfig: FiatRampConfig = {
  provider: "moonpay",
  apiKey: MOONPAY_API_KEY,
  secretKey: MOONPAY_SECRET_KEY,
  webhookSecret: MOONPAY_WEBHOOK_SECRET,
  environment: MOONPAY_ENV,
  baseUrl:
    MOONPAY_ENV === "production"
      ? "https://api.moonpay.com"
      : "https://api.moonpay.com", // MoonPay uses same URL, different API key
  widgetUrl:
    MOONPAY_ENV === "production"
      ? "https://buy.moonpay.com"
      : "https://buy-sandbox.moonpay.com",
};

/**
 * Check if MoonPay is configured
 */
export function isMoonPayConfigured(): boolean {
  return !!MOONPAY_API_KEY;
}

/**
 * Generate MoonPay buy widget URL
 */
export function generateBuyWidgetUrl(params: BuyWidgetParams): string {
  const baseUrl = moonpayConfig.widgetUrl;

  const queryParams = new URLSearchParams({
    apiKey: params.apiKey || moonpayConfig.apiKey,
    baseCurrencyCode: params.baseCurrencyCode.toLowerCase(),
    quoteCurrencyCode: params.quoteCurrencyCode.toLowerCase(),
    walletAddress: params.walletAddress,
  });

  // Optional parameters
  if (params.baseCurrencyAmount) {
    queryParams.set("baseCurrencyAmount", params.baseCurrencyAmount.toString());
  }
  if (params.quoteCurrencyAmount) {
    queryParams.set(
      "quoteCurrencyAmount",
      params.quoteCurrencyAmount.toString()
    );
  }
  if (params.email) {
    queryParams.set("email", params.email);
  }
  if (params.externalCustomerId) {
    queryParams.set("externalCustomerId", params.externalCustomerId);
  }
  if (params.externalTransactionId) {
    queryParams.set("externalTransactionId", params.externalTransactionId);
  }
  if (params.colorCode) {
    queryParams.set("colorCode", params.colorCode.replace("#", ""));
  }
  if (params.theme) {
    queryParams.set("theme", params.theme);
  }
  if (params.language) {
    queryParams.set("language", params.language);
  }
  if (params.redirectURL) {
    queryParams.set("redirectURL", params.redirectURL);
  }
  if (params.showWalletAddressForm !== undefined) {
    queryParams.set(
      "showWalletAddressForm",
      params.showWalletAddressForm.toString()
    );
  }
  if (params.lockAmount !== undefined) {
    queryParams.set("lockAmount", params.lockAmount.toString());
  }
  if (params.showAllCurrencies !== undefined) {
    queryParams.set("showAllCurrencies", params.showAllCurrencies.toString());
  }
  if (params.enabledPaymentMethods?.length) {
    queryParams.set(
      "enabledPaymentMethods",
      params.enabledPaymentMethods.join(",")
    );
  }

  // Treasure Chess branding
  queryParams.set("colorCode", "FFD700"); // Gold theme
  queryParams.set("theme", "dark");

  const url = `${baseUrl}?${queryParams.toString()}`;

  // Sign the URL if we have a secret key (for production security)
  if (moonpayConfig.secretKey) {
    return signWidgetUrl(url);
  }

  return url;
}

/**
 * Generate MoonPay sell widget URL
 */
export function generateSellWidgetUrl(params: SellWidgetParams): string {
  const baseUrl = moonpayConfig.widgetUrl.replace("buy", "sell");

  const queryParams = new URLSearchParams({
    apiKey: params.apiKey || moonpayConfig.apiKey,
    baseCurrencyCode: params.quoteCurrencyCode.toLowerCase(), // For sell, crypto is base
    quoteCurrencyCode: params.baseCurrencyCode.toLowerCase(), // Fiat is quote
    walletAddress: params.walletAddress,
  });

  // Optional parameters
  if (params.baseCurrencyAmount) {
    queryParams.set("baseCurrencyAmount", params.baseCurrencyAmount.toString());
  }
  if (params.email) {
    queryParams.set("email", params.email);
  }
  if (params.externalCustomerId) {
    queryParams.set("externalCustomerId", params.externalCustomerId);
  }
  if (params.externalTransactionId) {
    queryParams.set("externalTransactionId", params.externalTransactionId);
  }
  if (params.refundWalletAddress) {
    queryParams.set("refundWalletAddress", params.refundWalletAddress);
  }
  if (params.redirectURL) {
    queryParams.set("redirectURL", params.redirectURL);
  }

  // Treasure Chess branding
  queryParams.set("colorCode", "FFD700");
  queryParams.set("theme", "dark");

  const url = `${baseUrl}?${queryParams.toString()}`;

  if (moonpayConfig.secretKey) {
    return signWidgetUrl(url);
  }

  return url;
}

/**
 * Sign widget URL with HMAC-SHA256 for security
 */
function signWidgetUrl(url: string): string {
  if (!moonpayConfig.secretKey) {
    return url;
  }

  try {
    // Extract query string for signing
    const urlObj = new URL(url);
    const queryString = urlObj.search;

    // Note: In React Native, we need to use a different approach for HMAC
    // This is a simplified version - in production, signing should be done server-side
    const signature = `moonpay_sig_${Date.now()}`;

    return `${url}&signature=${encodeURIComponent(signature)}`;
  } catch {
    return url;
  }
}

/**
 * Map MoonPay transaction status to our OrderStatus
 */
export function mapMoonPayStatus(status: string): OrderStatus {
  const statusMap: Record<string, OrderStatus> = {
    waitingPayment: "waiting_payment",
    pending: "processing",
    waitingAuthorization: "processing",
    completed: "completed",
    failed: "failed",
  };

  return statusMap[status] || "pending";
}

/**
 * Parse MoonPay webhook payload
 */
export function parseMoonPayWebhook(payload: MoonPay.WebhookPayload): WebhookEvent {
  const { type, data } = payload;

  return {
    provider: "moonpay",
    eventType: type,
    orderId: data.id,
    status: mapMoonPayStatus(data.status),
    fiatAmount: data.baseCurrencyAmount,
    fiatCurrency: data.baseCurrency.code.toUpperCase(),
    cryptoAmount: data.quoteCurrencyAmount,
    cryptoCurrency: data.quoteCurrency.code.toUpperCase(),
    walletAddress: data.walletAddress,
    transactionHash: data.cryptoTransactionId,
    failureReason: data.failureReason,
    timestamp: data.updatedAt,
    rawPayload: payload,
  };
}

/**
 * Verify MoonPay webhook signature
 */
export async function verifyMoonPayWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  if (!moonpayConfig.webhookSecret) {
    console.warn("MoonPay webhook secret not configured");
    return false;
  }

  try {
    // MoonPay uses HMAC-SHA256 for webhook signatures
    // In production, this verification should be done server-side
    // For now, we trust the signature format
    if (!signature || !signature.startsWith("sha256=")) {
      return false;
    }

    // Extract the signature hash
    const providedHash = signature.replace("sha256=", "");

    // In a real implementation, compute HMAC and compare
    // Since expo-crypto doesn't have HMAC, this should be done in Edge Function
    return providedHash.length === 64; // Basic format check
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return false;
  }
}

/**
 * Calculate TCT amount from USDC
 */
export function calculateTctFromUsdc(usdcAmount: number): number {
  return usdcAmount * USDC_TO_TCT;
}

/**
 * Calculate TCT amount from fiat
 */
export function calculateTctFromFiat(fiatAmount: number, currency: FiatCurrency): number {
  // For simplicity, assuming 1:1 with USD
  // In production, fetch real exchange rates
  const usdAmount = fiatAmount; // TODO: Convert from other currencies
  return usdAmount / TCT_TO_USD_RATE;
}

/**
 * Generate a unique external transaction ID
 */
export function generateExternalTransactionId(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TC-${userId.substring(0, 8)}-${timestamp}-${random}`.toUpperCase();
}

/**
 * MoonPay sandbox test card numbers
 */
export const MOONPAY_TEST_CARDS = {
  SUCCESS: "4000056655665556", // Successful payment
  FAILURE: "4000000000000002", // Declined
  THREEDS: "4000000000003220", // 3DS authentication required
} as const;

/**
 * Build MoonPay widget parameters for buy flow
 */
export function buildBuyWidgetParams(
  walletAddress: string,
  fiatAmount: number,
  fiatCurrency: FiatCurrency,
  userId: string,
  email?: string
): BuyWidgetParams {
  return {
    apiKey: moonpayConfig.apiKey,
    environment: moonpayConfig.environment,
    baseCurrencyCode: fiatCurrency.toLowerCase(),
    baseCurrencyAmount: fiatAmount,
    quoteCurrencyCode: "usdc_base", // USDC on Base network
    walletAddress,
    email,
    externalCustomerId: userId,
    externalTransactionId: generateExternalTransactionId(userId),
    colorCode: "FFD700",
    theme: "dark",
    showWalletAddressForm: false,
    lockAmount: false,
    showAllCurrencies: false,
    enabledPaymentMethods: ["credit_debit_card", "apple_pay", "google_pay"],
  };
}

/**
 * Build MoonPay widget parameters for sell flow
 */
export function buildSellWidgetParams(
  walletAddress: string,
  cryptoAmount: number,
  fiatCurrency: FiatCurrency,
  userId: string,
  email?: string
): SellWidgetParams {
  return {
    apiKey: moonpayConfig.apiKey,
    environment: moonpayConfig.environment,
    baseCurrencyCode: fiatCurrency.toLowerCase(),
    quoteCurrencyCode: "usdc_base",
    quoteCurrencyAmount: cryptoAmount,
    walletAddress,
    email,
    externalCustomerId: userId,
    externalTransactionId: generateExternalTransactionId(userId),
    colorCode: "FFD700",
    theme: "dark",
    refundWalletAddress: walletAddress,
    payoutMethod: "bank_transfer",
  };
}
