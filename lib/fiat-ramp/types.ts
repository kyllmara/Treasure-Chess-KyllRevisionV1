/**
 * Fiat Ramp Types
 *
 * Shared type definitions for MoonPay and Transak integrations.
 */

export type FiatRampProvider = "moonpay" | "transak";

export type FiatCurrency = "USD" | "EUR" | "GBP" | "CAD" | "AUD";

export type OrderType = "buy" | "sell";

export type OrderStatus =
  | "pending"
  | "waiting_payment"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded";

export type KycStatus = "not_started" | "pending" | "approved" | "rejected";

/**
 * Configuration for a fiat ramp provider
 */
export interface FiatRampConfig {
  provider: FiatRampProvider;
  apiKey: string;
  /**
   * Server-only secret key used by webhook verification Edge Functions.
   * This field is intentionally loaded from a non-EXPO_PUBLIC_ env var
   * (MOONPAY_SECRET_KEY / TRANSAK_SECRET_KEY), which Expo strips at
   * bundle time so the value is always `""` in the client bundle.
   * Never read this field in client-side code paths — use it only in
   * Supabase Edge Functions where the env var is injected server-side.
   */
  serverOnlySecretKey?: string;
  webhookSecret?: string;
  environment: "sandbox" | "production";
  baseUrl: string;
  widgetUrl: string;
}

/**
 * User context for fiat ramp operations
 */
export interface FiatRampUserContext {
  userId: string;
  email?: string;
  walletAddress: string;
  kycStatus: KycStatus;
  region?: UserRegion;
}

/**
 * Detected user region for provider selection
 */
export interface UserRegion {
  countryCode: string;
  countryName: string;
  regionCode?: string; // State/Province code
  regionName?: string;
  isRestricted: boolean;
  restrictedProvider?: FiatRampProvider;
  detectedAt: string;
}

/**
 * Widget parameters for buy/sell flows
 */
export interface WidgetParams {
  // Common params
  apiKey: string;
  environment: "sandbox" | "production";

  // Order details
  baseCurrencyCode: string; // e.g., "usd"
  baseCurrencyAmount?: number;
  quoteCurrencyCode: string; // e.g., "usdc_base"
  quoteCurrencyAmount?: number;

  // User context
  walletAddress: string;
  email?: string;
  externalCustomerId?: string;
  externalTransactionId?: string;

  // Customization
  colorCode?: string;
  theme?: "light" | "dark";
  language?: string;

  // Callbacks
  redirectURL?: string;
  showWalletAddressForm?: boolean;
  lockAmount?: boolean;
}

/**
 * Buy widget specific params
 */
export interface BuyWidgetParams extends WidgetParams {
  defaultCurrencyCode?: string;
  showAllCurrencies?: boolean;
  enabledPaymentMethods?: string[];
}

/**
 * Sell widget specific params
 */
export interface SellWidgetParams extends WidgetParams {
  refundWalletAddress?: string;
  payoutMethod?: "bank_transfer" | "credit_debit_card";
}

/**
 * Order creation request
 */
export interface CreateOrderRequest {
  userId: string;
  orderType: OrderType;
  fiatCurrency: FiatCurrency;
  fiatAmount: number;
  walletAddress: string;
  externalOrderId?: string;
}

/**
 * Order response from provider
 */
export interface OrderResponse {
  provider: FiatRampProvider;
  providerOrderId: string;
  status: OrderStatus;
  fiatCurrency: string;
  fiatAmount: number;
  cryptoCurrency: string;
  cryptoAmount?: number;
  exchangeRate?: number;
  fees: {
    providerFee: number;
    networkFee: number;
  };
  widgetUrl: string;
  createdAt: string;
}

/**
 * Webhook event from provider
 */
export interface WebhookEvent {
  provider: FiatRampProvider;
  eventType: string;
  orderId: string;
  status: OrderStatus;
  fiatAmount: number;
  fiatCurrency: string;
  cryptoAmount?: number;
  cryptoCurrency?: string;
  walletAddress?: string;
  transactionHash?: string;
  failureReason?: string;
  timestamp: string;
  rawPayload: unknown;
}

/**
 * Withdrawal eligibility check result
 */
export interface WithdrawalEligibility {
  eligible: boolean;
  reason: string;
  dailyRemaining: number;
  weeklyRemaining: number;
  cooldownEndsAt?: string;
}

/**
 * Provider availability for a region
 */
export interface ProviderAvailability {
  moonpay: {
    available: boolean;
    reason?: string;
  };
  transak: {
    available: boolean;
    reason?: string;
  };
  recommendedProvider: FiatRampProvider | null;
}

/**
 * MoonPay-specific types
 */
export namespace MoonPay {
  export interface Transaction {
    id: string;
    externalTransactionId?: string;
    status:
      | "waitingPayment"
      | "pending"
      | "waitingAuthorization"
      | "completed"
      | "failed";
    baseCurrencyAmount: number;
    baseCurrency: { code: string };
    quoteCurrencyAmount: number;
    quoteCurrency: { code: string };
    walletAddress: string;
    cryptoTransactionId?: string;
    feeAmount: number;
    networkFeeAmount: number;
    extraFeeAmount: number;
    createdAt: string;
    updatedAt: string;
    failureReason?: string;
  }

  export interface WebhookPayload {
    type: string;
    data: Transaction;
  }

  export interface CustomerToken {
    customerId: string;
    token: string;
    expiresAt: string;
  }
}

/**
 * Transak-specific types
 */
export namespace Transak {
  export interface Order {
    id: string;
    partnerOrderId?: string;
    status:
      | "AWAITING_PAYMENT_FROM_USER"
      | "PAYMENT_DONE_MARKED_BY_USER"
      | "PROCESSING"
      | "PENDING_DELIVERY_FROM_TRANSAK"
      | "ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK"
      | "COMPLETED"
      | "CANCELLED"
      | "FAILED"
      | "REFUNDED"
      | "EXPIRED";
    fiatCurrency: string;
    fiatAmount: number;
    cryptoCurrency: string;
    cryptoAmount: number;
    walletAddress: string;
    transactionHash?: string;
    totalFeeInFiat: number;
    createdAt: string;
    completedAt?: string;
    statusReason?: string;
  }

  export interface WebhookPayload {
    eventID: string;
    webhookData: Order;
  }
}

/**
 * Constants — canonical values live in lib/tct.ts
 */
export { TCT_TO_USD as TCT_TO_USD_RATE, USDC_TO_TCT_RATE as USDC_TO_TCT } from "../tct";

export const WITHDRAWAL_LIMITS = {
  DAILY_USD: 500,
  WEEKLY_USD: 2000,
  NEW_ACCOUNT_COOLDOWN_HOURS: 24,
} as const;

export const SUPPORTED_FIAT_CURRENCIES: FiatCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
];

/**
 * US states where MoonPay is not available (use Transak instead)
 */
export const MOONPAY_RESTRICTED_US_STATES = [
  "NY", // New York
  "TX", // Texas
  "HI", // Hawaii
  "VT", // Vermont
  "LA", // Louisiana
] as const;

/**
 * Countries where Transak is not available (use MoonPay instead)
 */
export const TRANSAK_RESTRICTED_COUNTRIES = [
  // Add as needed based on Transak's actual restrictions
] as const;
