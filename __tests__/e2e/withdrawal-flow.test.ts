/**
 * E2E Test: Withdrawal Flow
 *
 * Tests the complete withdrawal flow from UI initiation to balance debit.
 * Includes KYC verification checks and withdrawal limit enforcement.
 */

// Set environment variables before imports
process.env.EXPO_PUBLIC_MOONPAY_API_KEY = "pk_test_moonpay_123";
process.env.EXPO_PUBLIC_MOONPAY_ENVIRONMENT = "sandbox";
process.env.EXPO_PUBLIC_TRANSAK_API_KEY = "pk_test_transak_456";
process.env.EXPO_PUBLIC_TRANSAK_ENVIRONMENT = "staging";

import {
  getFiatRampService,
  FiatRampService,
  tctToUsd,
  tctToUsdc,
  parseMoonPayWebhook,
  parseTransakWebhook,
  WITHDRAWAL_LIMITS,
  type FiatCurrency,
} from "@/lib/fiat-ramp";
import type { MoonPay, Transak } from "@/lib/fiat-ramp/types";
import type { KycVerificationResult } from "@/lib/fiat-ramp/provider";

// Mock Supabase with configurable responses
const mockSupabaseResponses = {
  kycStatus: null as any,
  withdrawalEligibility: {
    eligible: true,
    reason: "Withdrawal eligible",
    daily_remaining: 500,
    weekly_remaining: 2000,
    cooldown_ends_at: null as string | null,
  },
};

jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === "user_kyc_status") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() =>
                Promise.resolve({ data: mockSupabaseResponses.kycStatus, error: null })
              ),
            })),
          })),
          upsert: jest.fn(() => Promise.resolve({ error: null })),
        };
      }
      if (table === "payment_orders") {
        return {
          insert: jest.fn(() => Promise.resolve({ error: null })),
          update: jest.fn(() => ({
            eq: jest.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    }),
    rpc: jest.fn(() =>
      Promise.resolve({
        data: [mockSupabaseResponses.withdrawalEligibility],
        error: null,
      })
    ),
  },
  isSupabaseConfigured: true,
}));

beforeEach(() => {
  jest.clearAllMocks();

  // Reset mock responses
  mockSupabaseResponses.kycStatus = null;
  mockSupabaseResponses.withdrawalEligibility = {
    eligible: true,
    reason: "Withdrawal eligible",
    daily_remaining: 500,
    weekly_remaining: 2000,
    cooldown_ends_at: null,
  };
});

describe("E2E: Withdrawal Flow", () => {
  describe("Complete Withdrawal Cycle", () => {
    it("should complete full MoonPay withdrawal flow with KYC approved", async () => {
      // Setup: User has approved KYC
      mockSupabaseResponses.kycStatus = {
        user_id: "user-123",
        moonpay_kyc_status: "approved",
        transak_kyc_status: "not_started",
        moonpay_customer_id: "mp-customer-123",
      };

      const userId = "user-123";
      const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
      const tctAmount = 1000; // 1000 TCT = $40 USD

      // Step 1: Initialize service and check KYC
      const service = new FiatRampService();
      await service.initialize();

      const kycResult = await service.checkKycStatus(userId);
      expect(kycResult.verified).toBe(true);
      expect(kycResult.status).toBe("approved");

      // Step 2: Check withdrawal eligibility
      const usdAmount = tctToUsd(tctAmount);
      expect(usdAmount).toBe(40); // 1000 TCT = $40

      const eligibility = await service.checkWithdrawalEligibility(userId, usdAmount);
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.dailyRemaining).toBe(500);

      // Step 3: Get sell widget URL
      const widgetResult = await service.getSellWidgetUrl({
        userId,
        walletAddress,
        orderType: "sell",
        fiatAmount: usdAmount,
        fiatCurrency: "USD",
      });

      expect(widgetResult).not.toBeNull();
      expect(widgetResult?.provider).toBe("moonpay");
      expect(widgetResult?.orderId).toMatch(/^TC-/);

      // Step 4: Simulate completed withdrawal webhook
      const webhookPayload: MoonPay.WebhookPayload = {
        type: "sell_transaction_completed",
        data: {
          id: "moonpay-sell-abc123",
          externalTransactionId: widgetResult?.orderId,
          status: "completed",
          baseCurrencyAmount: usdAmount,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: tctToUsdc(tctAmount),
          quoteCurrency: { code: "usdc" },
          walletAddress,
          cryptoTransactionId: "0xwithdrawHash123",
          feeAmount: 0.5,
          networkFeeAmount: 0.1,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const webhookEvent = parseMoonPayWebhook(webhookPayload);

      // Step 5: Verify withdrawal completed
      expect(webhookEvent.status).toBe("completed");
      expect(webhookEvent.fiatAmount).toBe(usdAmount);
    });

    it("should complete full Transak withdrawal flow", async () => {
      // Setup: User has approved KYC on Transak
      mockSupabaseResponses.kycStatus = {
        user_id: "user-456",
        moonpay_kyc_status: "not_started",
        transak_kyc_status: "approved",
        transak_customer_id: "trk-customer-456",
      };

      const userId = "user-456";
      const walletAddress = "0xabcdef1234567890abcdef1234567890abcdef12";
      const tctAmount = 2500; // 2500 TCT = $100 USD

      // Step 1: Initialize and check KYC (force Transak)
      const service = new FiatRampService();
      await service.initialize();

      const kycResult = await service.checkKycStatus(userId, "transak");
      expect(kycResult.verified).toBe(true);

      // Step 2: Get sell widget URL for Transak
      const widgetResult = await service.getSellWidgetUrl({
        userId,
        walletAddress,
        orderType: "sell",
        fiatAmount: tctToUsd(tctAmount),
        fiatCurrency: "USD",
        preferredProvider: "transak",
      });

      expect(widgetResult).not.toBeNull();
      expect(widgetResult?.provider).toBe("transak");
      expect(widgetResult?.orderId).toMatch(/^TC-TRK-/);

      // Step 3: Simulate Transak webhook
      const webhookPayload: Transak.WebhookPayload = {
        eventID: "evt-sell-789",
        webhookData: {
          id: "transak-sell-xyz789",
          partnerOrderId: widgetResult?.orderId,
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 100,
          cryptoCurrency: "USDC",
          cryptoAmount: 100,
          walletAddress,
          transactionHash: "0xtransakSellHash",
          totalFeeInFiat: 1.0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      const webhookEvent = parseTransakWebhook(webhookPayload);
      expect(webhookEvent.status).toBe("completed");
    });
  });

  describe("KYC Verification Checks", () => {
    it("should block withdrawal when KYC not started", async () => {
      // No KYC record exists
      mockSupabaseResponses.kycStatus = null;

      const service = new FiatRampService();
      await service.initialize();

      const kycResult = await service.checkKycStatus("user-new");

      expect(kycResult.verified).toBe(false);
      expect(kycResult.status).toBe("not_started");
      expect(kycResult.reason).toContain("KYC verification required");
      expect(kycResult.verificationUrl).toBeDefined();
    });

    it("should show pending status when KYC is being reviewed", async () => {
      mockSupabaseResponses.kycStatus = {
        user_id: "user-pending",
        moonpay_kyc_status: "pending",
        transak_kyc_status: "not_started",
      };

      const service = new FiatRampService();
      await service.initialize();

      const kycResult = await service.checkKycStatus("user-pending");

      expect(kycResult.verified).toBe(false);
      expect(kycResult.status).toBe("pending");
      expect(kycResult.reason).toContain("pending");
    });

    it("should fallback to alternate provider when primary KYC rejected", async () => {
      mockSupabaseResponses.kycStatus = {
        user_id: "user-rejected",
        moonpay_kyc_status: "rejected",
        transak_kyc_status: "approved",
      };

      const service = new FiatRampService();
      await service.initialize();

      const kycResult = await service.checkKycStatus("user-rejected", "moonpay");

      // Should fallback to Transak since MoonPay was rejected
      expect(kycResult.verified).toBe(true);
      expect(kycResult.provider).toBe("transak");
      expect(kycResult.reason).toContain("Using transak");
    });
  });

  describe("Withdrawal Limits", () => {
    it("should enforce daily withdrawal limit", async () => {
      mockSupabaseResponses.withdrawalEligibility = {
        eligible: false,
        reason: "Daily withdrawal limit exceeded",
        daily_remaining: 0,
        weekly_remaining: 1500,
        cooldown_ends_at: null,
      };

      const service = new FiatRampService();
      await service.initialize();

      const eligibility = await service.checkWithdrawalEligibility("user-123", 100);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain("Daily");
      expect(eligibility.dailyRemaining).toBe(0);
    });

    it("should enforce weekly withdrawal limit", async () => {
      mockSupabaseResponses.withdrawalEligibility = {
        eligible: false,
        reason: "Weekly withdrawal limit exceeded",
        daily_remaining: 500,
        weekly_remaining: 0,
        cooldown_ends_at: null,
      };

      const service = new FiatRampService();
      await service.initialize();

      const eligibility = await service.checkWithdrawalEligibility("user-123", 100);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain("Weekly");
      expect(eligibility.weeklyRemaining).toBe(0);
    });

    it("should enforce 24h cooldown for new accounts", async () => {
      const cooldownEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      mockSupabaseResponses.withdrawalEligibility = {
        eligible: false,
        reason: "New account cooldown period active",
        daily_remaining: 500,
        weekly_remaining: 2000,
        cooldown_ends_at: cooldownEnd,
      };

      const service = new FiatRampService();
      await service.initialize();

      const eligibility = await service.checkWithdrawalEligibility("user-new", 50);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.cooldownEndsAt).toBe(cooldownEnd);
    });

    it("should have correct default limits", () => {
      expect(WITHDRAWAL_LIMITS.DAILY_USD).toBe(500);
      expect(WITHDRAWAL_LIMITS.WEEKLY_USD).toBe(2000);
      expect(WITHDRAWAL_LIMITS.NEW_ACCOUNT_COOLDOWN_HOURS).toBe(24);
    });
  });

  describe("Amount Calculations", () => {
    it("should correctly convert TCT to USD", () => {
      expect(tctToUsd(25)).toBe(1); // 25 TCT = $1
      expect(tctToUsd(100)).toBe(4); // 100 TCT = $4
      expect(tctToUsd(250)).toBe(10); // 250 TCT = $10
      expect(tctToUsd(1000)).toBe(40); // 1000 TCT = $40
      expect(tctToUsd(2500)).toBe(100); // 2500 TCT = $100
    });

    it("should correctly convert TCT to USDC", () => {
      expect(tctToUsdc(25)).toBe(1); // 25 TCT = 1 USDC
      expect(tctToUsdc(100)).toBe(4); // 100 TCT = 4 USDC
      expect(tctToUsdc(250)).toBe(10); // 250 TCT = 10 USDC
      expect(tctToUsdc(1000)).toBe(40); // 1000 TCT = 40 USDC
    });
  });

  describe("Error Handling", () => {
    it("should handle withdrawal eligibility check failure gracefully", async () => {
      // Simulate RPC error
      const { supabase } = require("@/lib/supabase");
      supabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Database connection failed" },
      });

      const service = new FiatRampService();
      await service.initialize();

      const eligibility = await service.checkWithdrawalEligibility("user-123", 100);

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain("Unable to verify");
    });

    it("should reject sell widget URL when not eligible", async () => {
      mockSupabaseResponses.withdrawalEligibility = {
        eligible: false,
        reason: "Insufficient balance",
        daily_remaining: 500,
        weekly_remaining: 2000,
        cooldown_ends_at: null,
      };

      const service = new FiatRampService();
      await service.initialize();

      const result = await service.getSellWidgetUrl({
        userId: "user-123",
        walletAddress: "0x1234",
        orderType: "sell",
        fiatAmount: 100,
        fiatCurrency: "USD",
      });

      // Should return null when not eligible
      expect(result).toBeNull();
    });

    it("should handle failed withdrawal webhook", () => {
      const webhookPayload: MoonPay.WebhookPayload = {
        type: "sell_transaction_failed",
        data: {
          id: "moonpay-sell-failed",
          status: "failed",
          baseCurrencyAmount: 100,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 0,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1234",
          feeAmount: 0,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          failureReason: "Bank account verification failed",
        },
      };

      const event = parseMoonPayWebhook(webhookPayload);

      expect(event.status).toBe("failed");
      expect(event.failureReason).toBe("Bank account verification failed");
    });
  });

  describe("Multi-Currency Withdrawals", () => {
    it("should support EUR withdrawals", async () => {
      mockSupabaseResponses.kycStatus = {
        user_id: "user-eu",
        moonpay_kyc_status: "approved",
        transak_kyc_status: "not_started",
      };

      const service = new FiatRampService();
      await service.initialize();

      const result = await service.getSellWidgetUrl({
        userId: "user-eu",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        orderType: "sell",
        fiatAmount: 100,
        fiatCurrency: "EUR",
      });

      expect(result).not.toBeNull();
      expect(result?.url).toContain("eur");
    });

    it("should support GBP withdrawals", async () => {
      mockSupabaseResponses.kycStatus = {
        user_id: "user-uk",
        moonpay_kyc_status: "approved",
        transak_kyc_status: "not_started",
      };

      const service = new FiatRampService();
      await service.initialize();

      const result = await service.getSellWidgetUrl({
        userId: "user-uk",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        orderType: "sell",
        fiatAmount: 100,
        fiatCurrency: "GBP",
      });

      expect(result).not.toBeNull();
      expect(result?.url).toContain("gbp");
    });
  });
});
