/**
 * Fiat Ramp Module
 *
 * Unified fiat on/off ramp functionality using MoonPay (primary)
 * and Transak (fallback for restricted regions).
 *
 * @example
 * ```typescript
 * import { getFiatRampService, usdToTct } from '@/lib/fiat-ramp';
 *
 * const service = getFiatRampService();
 * await service.initialize();
 *
 * // Get buy widget URL
 * const result = await service.getBuyWidgetUrl({
 *   userId: 'user-123',
 *   walletAddress: '0x...',
 *   orderType: 'buy',
 *   fiatAmount: 100,
 *   fiatCurrency: 'USD',
 * });
 *
 * // Open the widget URL in a WebView or browser
 * if (result) {
 *   openUrl(result.url);
 * }
 * ```
 */

// Types
export type {
  FiatRampProvider,
  FiatCurrency,
  OrderType,
  OrderStatus,
  KycStatus,
  FiatRampConfig,
  FiatRampUserContext,
  UserRegion,
  WidgetParams,
  BuyWidgetParams,
  SellWidgetParams,
  CreateOrderRequest,
  OrderResponse,
  WebhookEvent,
  WithdrawalEligibility,
  ProviderAvailability,
} from "./types";

// Constants
export {
  TCT_TO_USD_RATE,
  USDC_TO_TCT,
  WITHDRAWAL_LIMITS,
  SUPPORTED_FIAT_CURRENCIES,
  MOONPAY_RESTRICTED_US_STATES,
} from "./types";

// MoonPay
export {
  moonpayConfig,
  isMoonPayConfigured,
  generateBuyWidgetUrl as generateMoonPayBuyUrl,
  generateSellWidgetUrl as generateMoonPaySellUrl,
  buildBuyWidgetParams as buildMoonPayBuyParams,
  buildSellWidgetParams as buildMoonPaySellParams,
  parseMoonPayWebhook,
  verifyMoonPayWebhookSignature,
  MOONPAY_TEST_CARDS,
} from "./moonpay";

// Transak
export {
  transakConfig,
  isTransakConfigured,
  generateTransakBuyWidgetUrl,
  generateTransakSellWidgetUrl,
  buildTransakBuyWidgetParams,
  buildTransakSellWidgetParams,
  parseTransakWebhook,
  verifyTransakWebhookSignature,
  isTransakAvailable,
  TRANSAK_TEST_VALUES,
} from "./transak";

// Region Detection
export {
  detectUserRegion,
  isRestrictedRegion,
  getRestrictedProvider,
  getProviderAvailability,
  getRecommendedProvider,
  clearRegionCache,
  getRestrictionDescription,
  requestLocationPermission,
} from "./region";

// Provider Service
export {
  FiatRampService,
  getFiatRampService,
  usdToTct,
  usdcToTct,
  tctToUsd,
  tctToUsdc,
} from "./provider";

export type { CreateOrderParams, OrderResult, WidgetUrlResult, KycVerificationResult } from "./provider";
