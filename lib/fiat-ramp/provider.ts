/**
 * Fiat Ramp Provider Service
 *
 * Unified interface for MoonPay and Transak that handles:
 * - Automatic provider selection based on region
 * - Widget URL generation
 * - Order tracking
 * - Webhook processing
 */

import type {
  FiatRampProvider,
  FiatCurrency,
  BuyWidgetParams,
  SellWidgetParams,
  OrderType,
  UserRegion,
  ProviderAvailability,
  WithdrawalEligibility,
  KycStatus,
} from "./types";
import {
  USDC_TO_TCT,
  TCT_TO_USD_RATE,
  WITHDRAWAL_LIMITS,
} from "./types";

/**
 * KYC verification result
 */
export interface KycVerificationResult {
  verified: boolean;
  status: KycStatus;
  provider: FiatRampProvider | null;
  reason?: string;
  verificationUrl?: string;
}
import {
  isMoonPayConfigured,
  generateBuyWidgetUrl as moonpayBuyUrl,
  generateSellWidgetUrl as moonpaySellUrl,
  buildBuyWidgetParams as moonpayBuyParams,
  buildSellWidgetParams as moonpaySellParams,
  generateExternalTransactionId as moonpayOrderId,
} from "./moonpay";
import {
  isTransakConfigured,
  generateTransakBuyWidgetUrl,
  generateTransakSellWidgetUrl,
  buildTransakBuyWidgetParams,
  buildTransakSellWidgetParams,
  generatePartnerOrderId as transakOrderId,
} from "./transak";
import {
  detectUserRegion,
  getProviderAvailability,
  getRecommendedProvider,
} from "./region";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface CreateOrderParams {
  userId: string;
  walletAddress: string;
  orderType: OrderType;
  fiatAmount: number;
  fiatCurrency: FiatCurrency;
  email?: string;
  preferredProvider?: FiatRampProvider;
}

export interface OrderResult {
  success: boolean;
  provider: FiatRampProvider;
  orderId: string;
  widgetUrl: string;
  error?: string;
}

export interface WidgetUrlResult {
  url: string;
  provider: FiatRampProvider;
  orderId: string;
}

/**
 * FiatRampService - Main service class for fiat on/off ramp operations
 */
export class FiatRampService {
  private region: UserRegion | null = null;
  private availability: ProviderAvailability | null = null;

  /**
   * Initialize the service by detecting user region
   */
  async initialize(): Promise<void> {
    this.region = await detectUserRegion();
    this.availability = getProviderAvailability(this.region);
  }

  /**
   * Get the recommended provider for the current user
   */
  async getRecommendedProvider(): Promise<FiatRampProvider | null> {
    if (!this.availability) {
      await this.initialize();
    }
    return this.availability?.recommendedProvider || null;
  }

  /**
   * Get provider availability status
   */
  async getAvailability(): Promise<ProviderAvailability> {
    if (!this.availability) {
      await this.initialize();
    }
    return (
      this.availability || {
        moonpay: { available: false },
        transak: { available: false },
        recommendedProvider: null,
      }
    );
  }

  /**
   * Check if any fiat ramp provider is configured
   */
  isConfigured(): boolean {
    return isMoonPayConfigured() || isTransakConfigured();
  }

  /**
   * Select the appropriate provider based on availability and preference
   */
  private selectProvider(
    preferredProvider?: FiatRampProvider
  ): FiatRampProvider | null {
    // If preferred provider is specified and available, use it
    if (preferredProvider) {
      if (
        preferredProvider === "moonpay" &&
        this.availability?.moonpay.available &&
        isMoonPayConfigured()
      ) {
        return "moonpay";
      }
      if (
        preferredProvider === "transak" &&
        this.availability?.transak.available &&
        isTransakConfigured()
      ) {
        return "transak";
      }
    }

    // Otherwise use recommended provider
    const recommended = this.availability?.recommendedProvider;
    if (recommended === "moonpay" && isMoonPayConfigured()) {
      return "moonpay";
    }
    if (recommended === "transak" && isTransakConfigured()) {
      return "transak";
    }

    // Fallback: try any configured provider
    if (isMoonPayConfigured() && this.availability?.moonpay.available) {
      return "moonpay";
    }
    if (isTransakConfigured() && this.availability?.transak.available) {
      return "transak";
    }

    return null;
  }

  /**
   * Generate buy widget URL for depositing fiat
   */
  async getBuyWidgetUrl(params: CreateOrderParams): Promise<WidgetUrlResult | null> {
    await this.initialize();

    const provider = this.selectProvider(params.preferredProvider);
    if (!provider) {
      console.error("No fiat ramp provider available");
      return null;
    }

    const orderId =
      provider === "moonpay"
        ? moonpayOrderId(params.userId)
        : transakOrderId(params.userId);

    let url: string;

    if (provider === "moonpay") {
      const widgetParams = moonpayBuyParams(
        params.walletAddress,
        params.fiatAmount,
        params.fiatCurrency,
        params.userId,
        params.email
      );
      widgetParams.externalTransactionId = orderId;
      url = moonpayBuyUrl(widgetParams);
    } else {
      const widgetParams = buildTransakBuyWidgetParams(
        params.walletAddress,
        params.fiatAmount,
        params.fiatCurrency,
        params.userId,
        params.email
      );
      widgetParams.externalTransactionId = orderId;
      url = generateTransakBuyWidgetUrl(widgetParams);
    }

    // Record the order in database
    await this.recordOrder({
      userId: params.userId,
      provider,
      orderId,
      orderType: "buy",
      fiatAmount: params.fiatAmount,
      fiatCurrency: params.fiatCurrency,
      walletAddress: params.walletAddress,
    });

    return { url, provider, orderId };
  }

  /**
   * Generate sell widget URL for withdrawing to fiat
   */
  async getSellWidgetUrl(params: CreateOrderParams): Promise<WidgetUrlResult | null> {
    await this.initialize();

    const provider = this.selectProvider(params.preferredProvider);
    if (!provider) {
      console.error("No fiat ramp provider available");
      return null;
    }

    // Check withdrawal eligibility first
    const eligibility = await this.checkWithdrawalEligibility(
      params.userId,
      params.fiatAmount
    );
    if (!eligibility.eligible) {
      console.error("Withdrawal not eligible:", eligibility.reason);
      return null;
    }

    const orderId =
      provider === "moonpay"
        ? moonpayOrderId(params.userId)
        : transakOrderId(params.userId);

    // Calculate crypto amount from fiat
    const cryptoAmount = params.fiatAmount; // 1:1 for USDC

    let url: string;

    if (provider === "moonpay") {
      const widgetParams = moonpaySellParams(
        params.walletAddress,
        cryptoAmount,
        params.fiatCurrency,
        params.userId,
        params.email
      );
      widgetParams.externalTransactionId = orderId;
      url = moonpaySellUrl(widgetParams);
    } else {
      const widgetParams = buildTransakSellWidgetParams(
        params.walletAddress,
        cryptoAmount,
        params.fiatCurrency,
        params.userId,
        params.email
      );
      widgetParams.externalTransactionId = orderId;
      url = generateTransakSellWidgetUrl(widgetParams);
    }

    // Record the order in database
    await this.recordOrder({
      userId: params.userId,
      provider,
      orderId,
      orderType: "sell",
      fiatAmount: params.fiatAmount,
      fiatCurrency: params.fiatCurrency,
      walletAddress: params.walletAddress,
    });

    return { url, provider, orderId };
  }

  /**
   * Record an order in the database
   */
  private async recordOrder(params: {
    userId: string;
    provider: FiatRampProvider;
    orderId: string;
    orderType: OrderType;
    fiatAmount: number;
    fiatCurrency: FiatCurrency;
    walletAddress: string;
  }): Promise<void> {
    if (!isSupabaseConfigured) {
      console.log("Supabase not configured, skipping order recording");
      return;
    }

    try {
      // Using type assertion since payment_orders table is defined in migration 008
      // but not yet in the generated types
      const { error } = await (supabase as any).from("payment_orders").insert({
        user_id: params.userId,
        provider: params.provider,
        provider_order_id: params.orderId,
        order_type: params.orderType,
        status: "pending",
        fiat_currency: params.fiatCurrency,
        fiat_amount: params.fiatAmount,
        crypto_currency: "USDC",
        destination_wallet_address: params.walletAddress,
      });

      if (error) {
        console.error("Failed to record order:", error);
      }
    } catch (error) {
      console.error("Error recording order:", error);
    }
  }

  /**
   * Check if user is eligible for withdrawal
   */
  async checkWithdrawalEligibility(
    userId: string,
    amountUsd: number
  ): Promise<WithdrawalEligibility> {
    if (!isSupabaseConfigured) {
      // In demo mode, always allow
      return {
        eligible: true,
        reason: "Demo mode - withdrawals allowed",
        dailyRemaining: WITHDRAWAL_LIMITS.DAILY_USD,
        weeklyRemaining: WITHDRAWAL_LIMITS.WEEKLY_USD,
      };
    }

    try {
      // Using type assertion since check_withdrawal_eligibility RPC is defined in migration 008
      // but not yet in the generated types
      const { data, error } = await (supabase as any).rpc("check_withdrawal_eligibility", {
        p_user_id: userId,
        p_amount_usd: amountUsd,
      });

      if (error) {
        console.error("Withdrawal eligibility check failed:", error);
        return {
          eligible: false,
          reason: "Unable to verify withdrawal eligibility",
          dailyRemaining: 0,
          weeklyRemaining: 0,
        };
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const result = data[0] as {
          eligible: boolean;
          reason: string;
          daily_remaining: number;
          weekly_remaining: number;
          cooldown_ends_at?: string;
        };
        return {
          eligible: result.eligible,
          reason: result.reason,
          dailyRemaining: result.daily_remaining,
          weeklyRemaining: result.weekly_remaining,
          cooldownEndsAt: result.cooldown_ends_at,
        };
      }

      return {
        eligible: true,
        reason: "Withdrawal eligible",
        dailyRemaining: WITHDRAWAL_LIMITS.DAILY_USD,
        weeklyRemaining: WITHDRAWAL_LIMITS.WEEKLY_USD,
      };
    } catch (error) {
      console.error("Error checking withdrawal eligibility:", error);
      return {
        eligible: false,
        reason: "Error checking withdrawal eligibility",
        dailyRemaining: 0,
        weeklyRemaining: 0,
      };
    }
  }

  /**
   * Get user's current region
   */
  getRegion(): UserRegion | null {
    return this.region;
  }

  /**
   * Check if user is in a restricted region
   */
  isInRestrictedRegion(): boolean {
    return this.region?.isRestricted || false;
  }

  /**
   * Get restriction message if applicable
   */
  getRestrictionMessage(): string | null {
    if (!this.region?.isRestricted) {
      return null;
    }

    if (this.region.restrictedProvider === "moonpay") {
      return `MoonPay is not available in ${this.region.regionName || this.region.countryName}. Using Transak for fiat transactions.`;
    }

    if (this.region.restrictedProvider === "transak") {
      return `Transak is not available in ${this.region.regionName || this.region.countryName}. Using MoonPay for fiat transactions.`;
    }

    return null;
  }

  /**
   * Check KYC verification status for a user before allowing off-ramp
   * Returns verification status and optionally a URL to complete verification
   */
  async checkKycStatus(
    userId: string,
    provider?: FiatRampProvider
  ): Promise<KycVerificationResult> {
    if (!isSupabaseConfigured) {
      // In demo mode, assume KYC is verified
      return {
        verified: true,
        status: "approved",
        provider: provider || null,
        reason: "Demo mode - KYC verification bypassed",
      };
    }

    try {
      // Get the user's KYC status from the database
      const { data, error } = await (supabase as any)
        .from("user_kyc_status")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch KYC status:", error);
        return {
          verified: false,
          status: "not_started",
          provider: provider || null,
          reason: "Unable to verify KYC status",
        };
      }

      // If no KYC record exists, user needs to start verification
      if (!data) {
        return {
          verified: false,
          status: "not_started",
          provider: provider || null,
          reason: "KYC verification required for withdrawals",
          verificationUrl: this.getKycVerificationUrl(provider || "moonpay"),
        };
      }

      // Determine which provider to check
      const selectedProvider = provider || this.availability?.recommendedProvider || "moonpay";
      const kycStatus: KycStatus =
        selectedProvider === "moonpay"
          ? data.moonpay_kyc_status
          : data.transak_kyc_status;

      // Check the status
      if (kycStatus === "approved") {
        return {
          verified: true,
          status: kycStatus,
          provider: selectedProvider,
          reason: "KYC verification complete",
        };
      }

      if (kycStatus === "pending") {
        return {
          verified: false,
          status: kycStatus,
          provider: selectedProvider,
          reason: "KYC verification is pending. Please wait for approval.",
        };
      }

      if (kycStatus === "rejected") {
        // Try the other provider if available
        const alternateProvider = selectedProvider === "moonpay" ? "transak" : "moonpay";
        const alternateStatus: KycStatus =
          alternateProvider === "moonpay"
            ? data.moonpay_kyc_status
            : data.transak_kyc_status;

        if (alternateStatus === "approved") {
          return {
            verified: true,
            status: alternateStatus,
            provider: alternateProvider,
            reason: `Using ${alternateProvider} for withdrawal (${selectedProvider} verification rejected)`,
          };
        }

        return {
          verified: false,
          status: kycStatus,
          provider: selectedProvider,
          reason: "KYC verification was rejected. Please contact support or try another provider.",
          verificationUrl: this.getKycVerificationUrl(alternateProvider),
        };
      }

      // Default: not started
      return {
        verified: false,
        status: "not_started",
        provider: selectedProvider,
        reason: "KYC verification required for withdrawals",
        verificationUrl: this.getKycVerificationUrl(selectedProvider),
      };
    } catch (error) {
      console.error("Error checking KYC status:", error);
      return {
        verified: false,
        status: "not_started",
        provider: provider || null,
        reason: "Error checking KYC status",
      };
    }
  }

  /**
   * Get the KYC verification URL for a provider
   */
  private getKycVerificationUrl(provider: FiatRampProvider): string {
    const apiKey =
      provider === "moonpay"
        ? process.env.EXPO_PUBLIC_MOONPAY_API_KEY
        : process.env.EXPO_PUBLIC_TRANSAK_API_KEY;

    if (provider === "moonpay") {
      const baseUrl =
        process.env.EXPO_PUBLIC_MOONPAY_ENVIRONMENT === "production"
          ? "https://buy.moonpay.com"
          : "https://buy-sandbox.moonpay.com";
      return `${baseUrl}?apiKey=${apiKey}&showOnlyKycFlow=true`;
    } else {
      const baseUrl =
        process.env.EXPO_PUBLIC_TRANSAK_ENVIRONMENT === "production"
          ? "https://global.transak.com"
          : "https://global-stg.transak.com";
      return `${baseUrl}?apiKey=${apiKey}&productsAvailed=BUY`;
    }
  }

  /**
   * Record KYC status update from webhook
   */
  async updateKycStatus(
    userId: string,
    provider: FiatRampProvider,
    status: KycStatus,
    customerId?: string
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      console.log("Supabase not configured, skipping KYC status update");
      return;
    }

    try {
      const updateData: Record<string, any> = {
        user_id: userId,
        [`${provider}_kyc_status`]: status,
        updated_at: new Date().toISOString(),
      };

      if (customerId) {
        updateData[`${provider}_customer_id`] = customerId;
      }

      const { error } = await (supabase as any)
        .from("user_kyc_status")
        .upsert(updateData, { onConflict: "user_id" });

      if (error) {
        console.error("Failed to update KYC status:", error);
      }
    } catch (error) {
      console.error("Error updating KYC status:", error);
    }
  }
}

// Singleton instance
let fiatRampServiceInstance: FiatRampService | null = null;

/**
 * Get the FiatRampService singleton instance
 */
export function getFiatRampService(): FiatRampService {
  if (!fiatRampServiceInstance) {
    fiatRampServiceInstance = new FiatRampService();
  }
  return fiatRampServiceInstance;
}

/**
 * Utility function to calculate TCT from USD
 */
export function usdToTct(usd: number): number {
  return usd / TCT_TO_USD_RATE;
}

/**
 * Utility function to calculate TCT from USDC
 */
export function usdcToTct(usdc: number): number {
  return usdc * USDC_TO_TCT;
}

/**
 * Utility function to calculate USD from TCT
 */
export function tctToUsd(tct: number): number {
  return tct * TCT_TO_USD_RATE;
}

/**
 * Utility function to calculate USDC from TCT
 */
export function tctToUsdc(tct: number): number {
  return tct / USDC_TO_TCT;
}
