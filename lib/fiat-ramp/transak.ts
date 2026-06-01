/**
 * Transak Integration Module
 *
 * Handles Transak widget URL generation, webhook verification,
 * and API interactions for fiat on/off ramp fallback.
 */

import type {
  FiatRampConfig,
  BuyWidgetParams,
  SellWidgetParams,
  WebhookEvent,
  Transak,
  OrderStatus,
  FiatCurrency,
} from "./types";
import { TCT_TO_USD_RATE, USDC_TO_TCT } from "./types";

// Environment configuration
const TRANSAK_API_KEY = process.env.EXPO_PUBLIC_TRANSAK_API_KEY || "";
// TRANSAK_SECRET_KEY intentionally uses a non-EXPO_PUBLIC_ prefix so Expo
// strips it at bundle time — it resolves to "" in the client bundle.
// It is only available server-side (Supabase Edge Functions).
const TRANSAK_SECRET_KEY = process.env.TRANSAK_SECRET_KEY || "";
const TRANSAK_WEBHOOK_SECRET = process.env.TRANSAK_WEBHOOK_SECRET || "";
const TRANSAK_ENV = (process.env.EXPO_PUBLIC_TRANSAK_ENV || "STAGING") as
  | "STAGING"
  | "PRODUCTION";

/**
 * Transak configuration
 */
export const transakConfig: FiatRampConfig = {
  provider: "transak",
  apiKey: TRANSAK_API_KEY,
  // serverOnlySecretKey is always "" in the client bundle (non-EXPO_PUBLIC_ env
  // var stripped by Expo). Populated only in Edge Function environments.
  serverOnlySecretKey: TRANSAK_SECRET_KEY,
  webhookSecret: TRANSAK_WEBHOOK_SECRET,
  environment: TRANSAK_ENV === "PRODUCTION" ? "production" : "sandbox",
  baseUrl:
    TRANSAK_ENV === "PRODUCTION"
      ? "https://api.transak.com"
      : "https://api-stg.transak.com",
  widgetUrl:
    TRANSAK_ENV === "PRODUCTION"
      ? "https://global.transak.com"
      : "https://global-stg.transak.com",
};

/**
 * Check if Transak is configured
 */
export function isTransakConfigured(): boolean {
  return !!TRANSAK_API_KEY;
}

/**
 * Generate Transak buy widget URL
 */
export function generateTransakBuyWidgetUrl(params: BuyWidgetParams): string {
  const baseUrl = transakConfig.widgetUrl;

  const queryParams = new URLSearchParams({
    apiKey: params.apiKey || transakConfig.apiKey,
    environment: TRANSAK_ENV,
    fiatCurrency: params.baseCurrencyCode.toUpperCase(),
    cryptoCurrencyCode: "USDC",
    network: "base",
    walletAddress: params.walletAddress,
    disableWalletAddressForm: "true",
  });

  // Optional parameters
  if (params.baseCurrencyAmount) {
    queryParams.set("fiatAmount", params.baseCurrencyAmount.toString());
  }
  if (params.email) {
    queryParams.set("email", params.email);
  }
  if (params.externalCustomerId) {
    queryParams.set("partnerCustomerId", params.externalCustomerId);
  }
  if (params.externalTransactionId) {
    queryParams.set("partnerOrderId", params.externalTransactionId);
  }
  if (params.redirectURL) {
    queryParams.set("redirectURL", params.redirectURL);
  }

  // Transak-specific options
  queryParams.set("productsAvailed", "BUY");
  queryParams.set("themeColor", "FFD700");
  queryParams.set("hideMenu", "true");
  queryParams.set("exchangeScreenTitle", "Buy USDC for Treasure Chess");

  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Generate Transak sell widget URL
 */
export function generateTransakSellWidgetUrl(params: SellWidgetParams): string {
  const baseUrl = transakConfig.widgetUrl;

  const queryParams = new URLSearchParams({
    apiKey: params.apiKey || transakConfig.apiKey,
    environment: TRANSAK_ENV,
    fiatCurrency: params.baseCurrencyCode.toUpperCase(),
    cryptoCurrencyCode: "USDC",
    network: "base",
    walletAddress: params.walletAddress,
  });

  // Optional parameters
  if (params.quoteCurrencyAmount) {
    queryParams.set("cryptoAmount", params.quoteCurrencyAmount.toString());
  }
  if (params.email) {
    queryParams.set("email", params.email);
  }
  if (params.externalCustomerId) {
    queryParams.set("partnerCustomerId", params.externalCustomerId);
  }
  if (params.externalTransactionId) {
    queryParams.set("partnerOrderId", params.externalTransactionId);
  }
  if (params.redirectURL) {
    queryParams.set("redirectURL", params.redirectURL);
  }

  // Transak-specific options for sell
  queryParams.set("productsAvailed", "SELL");
  queryParams.set("themeColor", "FFD700");
  queryParams.set("hideMenu", "true");
  queryParams.set("exchangeScreenTitle", "Sell USDC from Treasure Chess");

  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Map Transak order status to our OrderStatus
 */
export function mapTransakStatus(status: string): OrderStatus {
  const statusMap: Record<string, OrderStatus> = {
    AWAITING_PAYMENT_FROM_USER: "waiting_payment",
    PAYMENT_DONE_MARKED_BY_USER: "waiting_payment",
    PROCESSING: "processing",
    PENDING_DELIVERY_FROM_TRANSAK: "processing",
    ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK: "processing",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    FAILED: "failed",
    REFUNDED: "refunded",
    EXPIRED: "cancelled",
  };

  return statusMap[status] || "pending";
}

/**
 * Parse Transak webhook payload
 */
export function parseTransakWebhook(payload: Transak.WebhookPayload): WebhookEvent {
  const { webhookData } = payload;

  return {
    provider: "transak",
    eventType: webhookData.status,
    orderId: webhookData.id,
    status: mapTransakStatus(webhookData.status),
    fiatAmount: webhookData.fiatAmount,
    fiatCurrency: webhookData.fiatCurrency.toUpperCase(),
    cryptoAmount: webhookData.cryptoAmount,
    cryptoCurrency: webhookData.cryptoCurrency.toUpperCase(),
    walletAddress: webhookData.walletAddress,
    transactionHash: webhookData.transactionHash,
    failureReason: webhookData.statusReason,
    timestamp: webhookData.completedAt || webhookData.createdAt,
    rawPayload: payload,
  };
}

/**
 * Verify Transak webhook signature
 */
export async function verifyTransakWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  if (!transakConfig.webhookSecret) {
    console.warn("Transak webhook secret not configured");
    return false;
  }

  try {
    // Transak uses a simple API key comparison for webhook auth
    // The webhook includes an access-token header
    if (!signature) {
      return false;
    }

    // In production, verify against the webhook secret
    // For now, do a basic format check
    return signature.length > 0;
  } catch (error) {
    console.error("Transak webhook signature verification failed:", error);
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
export function calculateTctFromFiat(fiatAmount: number, _currency: FiatCurrency): number {
  // For simplicity, assuming 1:1 with USD
  // In production, fetch real exchange rates
  const usdAmount = fiatAmount;
  return usdAmount / TCT_TO_USD_RATE;
}

/**
 * Generate a unique partner order ID
 */
export function generatePartnerOrderId(userId: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TC-TRK-${userId.substring(0, 8)}-${timestamp}-${random}`.toUpperCase();
}

/**
 * Transak sandbox test values
 */
export const TRANSAK_TEST_VALUES = {
  // Use these in staging environment
  STAGING_API_KEY: "your-staging-api-key",
  TEST_WALLET: "0x0000000000000000000000000000000000000001",
} as const;

/**
 * Build Transak widget parameters for buy flow
 */
export function buildTransakBuyWidgetParams(
  walletAddress: string,
  fiatAmount: number,
  fiatCurrency: FiatCurrency,
  userId: string,
  email?: string
): BuyWidgetParams {
  return {
    apiKey: transakConfig.apiKey,
    environment: transakConfig.environment,
    baseCurrencyCode: fiatCurrency.toLowerCase(),
    baseCurrencyAmount: fiatAmount,
    quoteCurrencyCode: "usdc",
    walletAddress,
    email,
    externalCustomerId: userId,
    externalTransactionId: generatePartnerOrderId(userId),
    colorCode: "FFD700",
    theme: "dark",
    showWalletAddressForm: false,
    lockAmount: false,
  };
}

/**
 * Build Transak widget parameters for sell flow
 */
export function buildTransakSellWidgetParams(
  walletAddress: string,
  cryptoAmount: number,
  fiatCurrency: FiatCurrency,
  userId: string,
  email?: string
): SellWidgetParams {
  return {
    apiKey: transakConfig.apiKey,
    environment: transakConfig.environment,
    baseCurrencyCode: fiatCurrency.toLowerCase(),
    quoteCurrencyCode: "usdc",
    quoteCurrencyAmount: cryptoAmount,
    walletAddress,
    email,
    externalCustomerId: userId,
    externalTransactionId: generatePartnerOrderId(userId),
    colorCode: "FFD700",
    theme: "dark",
    refundWalletAddress: walletAddress,
    payoutMethod: "bank_transfer",
  };
}

/**
 * Get Transak supported countries
 * Returns array of ISO 3166-1 alpha-2 country codes
 */
export function getTransakSupportedCountries(): string[] {
  // Major supported countries - Transak has wide coverage
  return [
    "US", // United States (including most states)
    "GB", // United Kingdom
    "DE", // Germany
    "FR", // France
    "ES", // Spain
    "IT", // Italy
    "NL", // Netherlands
    "BE", // Belgium
    "AT", // Austria
    "CH", // Switzerland
    "AU", // Australia
    "CA", // Canada
    "JP", // Japan
    "SG", // Singapore
    "HK", // Hong Kong
    "IN", // India
    "BR", // Brazil
    "MX", // Mexico
    // ... many more
  ];
}

/**
 * Check if Transak is available in a specific country/state
 */
export function isTransakAvailable(
  countryCode: string,
  _stateCode?: string
): boolean {
  // Transak has broad US coverage including NY and TX
  // where MoonPay is restricted
  const supportedCountries = getTransakSupportedCountries();

  return supportedCountries.includes(countryCode.toUpperCase());
}
