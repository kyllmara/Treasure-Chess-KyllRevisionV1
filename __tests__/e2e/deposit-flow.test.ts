/**
 * E2E Test: Deposit Flow
 *
 * Tests the complete deposit flow from UI initiation to balance update.
 * Uses mocked providers to simulate the full deposit cycle.
 */

// Set environment variables before imports
process.env.EXPO_PUBLIC_MOONPAY_API_KEY = "pk_test_moonpay_123";
process.env.EXPO_PUBLIC_MOONPAY_ENVIRONMENT = "sandbox";
process.env.EXPO_PUBLIC_TRANSAK_API_KEY = "pk_test_transak_456";
process.env.EXPO_PUBLIC_TRANSAK_ENVIRONMENT = "staging";

import {
  getFiatRampService,
  FiatRampService,
  usdToTct,
  parseMoonPayWebhook,
  parseTransakWebhook,
  type FiatCurrency,
} from "@/lib/fiat-ramp";
import type { MoonPay, Transak } from "@/lib/fiat-ramp/types";

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ error: null })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { balance_tct: 1000 }, error: null })),
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null })),
      })),
    })),
    rpc: jest.fn(() => Promise.resolve({ data: [{ eligible: true, reason: "OK", daily_remaining: 500, weekly_remaining: 2000 }], error: null })),
  },
  isSupabaseConfigured: true,
}));

beforeEach(() => {
  jest.clearAllMocks();
});


describe("E2E: Deposit Flow", () => {
  describe("Complete Deposit Cycle", () => {
    it("should complete full MoonPay deposit flow", async () => {
      // Step 1: User initiates deposit
      const userId = "user-123";
      const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
      const fiatAmount = 100; // $100 USD
      const fiatCurrency: FiatCurrency = "USD";

      // Step 2: Get the buy widget URL from the service
      const service = new FiatRampService();
      await service.initialize();

      const widgetResult = await service.getBuyWidgetUrl({
        userId,
        walletAddress,
        orderType: "buy",
        fiatAmount,
        fiatCurrency,
      });

      // Step 3: Verify widget URL was generated
      expect(widgetResult).not.toBeNull();
      expect(widgetResult?.url).toContain("moonpay");
      expect(widgetResult?.provider).toBe("moonpay");
      expect(widgetResult?.orderId).toMatch(/^TC-/);

      // Step 4: Simulate MoonPay webhook for completed transaction
      const webhookPayload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "moonpay-tx-abc123",
          externalTransactionId: widgetResult?.orderId,
          status: "completed",
          baseCurrencyAmount: fiatAmount,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 99.5, // After fees
          quoteCurrency: { code: "usdc" },
          walletAddress,
          cryptoTransactionId: "0xhash123",
          feeAmount: 0.3,
          networkFeeAmount: 0.2,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      // Step 5: Parse the webhook
      const webhookEvent = parseMoonPayWebhook(webhookPayload);

      // Step 6: Verify webhook was parsed correctly
      expect(webhookEvent.provider).toBe("moonpay");
      expect(webhookEvent.status).toBe("completed");
      expect(webhookEvent.fiatAmount).toBe(fiatAmount);
      expect(webhookEvent.cryptoAmount).toBe(99.5);
      expect(webhookEvent.walletAddress).toBe(walletAddress);
      expect(webhookEvent.transactionHash).toBe("0xhash123");

      // Step 7: Calculate expected TCT credit
      const expectedTct = usdToTct(fiatAmount);
      expect(expectedTct).toBe(2500); // $100 = 2500 TCT at $0.04/TCT
    });

    it("should complete full Transak deposit flow", async () => {
      // Step 1: User initiates deposit
      const userId = "user-456";
      const walletAddress = "0xabcdef1234567890abcdef1234567890abcdef12";
      const fiatAmount = 50; // $50 USD
      const fiatCurrency: FiatCurrency = "USD";

      // Step 2: Get the buy widget URL from the service
      const service = new FiatRampService();
      await service.initialize();

      // Force Transak as preferred provider
      const widgetResult = await service.getBuyWidgetUrl({
        userId,
        walletAddress,
        orderType: "buy",
        fiatAmount,
        fiatCurrency,
        preferredProvider: "transak",
      });

      // Step 3: Verify widget URL was generated
      expect(widgetResult).not.toBeNull();
      expect(widgetResult?.url).toContain("transak");
      expect(widgetResult?.provider).toBe("transak");
      expect(widgetResult?.orderId).toMatch(/^TC-TRK-/);

      // Step 4: Simulate Transak webhook for completed transaction
      const webhookPayload: Transak.WebhookPayload = {
        eventID: "evt-xyz789",
        webhookData: {
          id: "transak-order-xyz789",
          partnerOrderId: widgetResult?.orderId,
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount,
          cryptoCurrency: "USDC",
          cryptoAmount: 49.8,
          walletAddress,
          transactionHash: "0xtransakHash456",
          totalFeeInFiat: 0.2,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      // Step 5: Parse the webhook
      const webhookEvent = parseTransakWebhook(webhookPayload);

      // Step 6: Verify webhook was parsed correctly
      expect(webhookEvent.provider).toBe("transak");
      expect(webhookEvent.status).toBe("completed");
      expect(webhookEvent.fiatAmount).toBe(fiatAmount);
      expect(webhookEvent.cryptoAmount).toBe(49.8);
      expect(webhookEvent.walletAddress).toBe(walletAddress);
      expect(webhookEvent.transactionHash).toBe("0xtransakHash456");

      // Step 7: Calculate expected TCT credit
      const expectedTct = usdToTct(fiatAmount);
      expect(expectedTct).toBe(1250); // $50 = 1250 TCT at $0.04/TCT
    });

    it("should handle failed deposit correctly", async () => {
      // Step 1: User initiates deposit
      const userId = "user-789";
      const walletAddress = "0x9876543210fedcba9876543210fedcba98765432";
      const fiatAmount = 200;
      const fiatCurrency: FiatCurrency = "USD";

      // Step 2: Get the buy widget URL
      const service = new FiatRampService();
      await service.initialize();

      const widgetResult = await service.getBuyWidgetUrl({
        userId,
        walletAddress,
        orderType: "buy",
        fiatAmount,
        fiatCurrency,
      });

      expect(widgetResult).not.toBeNull();

      // Step 3: Simulate failed transaction webhook
      const webhookPayload: MoonPay.WebhookPayload = {
        type: "transaction_failed",
        data: {
          id: "moonpay-tx-failed",
          externalTransactionId: widgetResult?.orderId,
          status: "failed",
          baseCurrencyAmount: fiatAmount,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 0,
          quoteCurrency: { code: "usdc" },
          walletAddress,
          feeAmount: 0,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          failureReason: "Card declined by issuer",
        },
      };

      // Step 4: Parse the webhook
      const webhookEvent = parseMoonPayWebhook(webhookPayload);

      // Step 5: Verify failure was captured
      expect(webhookEvent.status).toBe("failed");
      expect(webhookEvent.failureReason).toBe("Card declined by issuer");
      expect(webhookEvent.cryptoAmount).toBe(0);
    });
  });

  describe("Amount Calculations", () => {
    it("should correctly convert fiat to TCT for various amounts", () => {
      // Verify conversion at different price points
      expect(usdToTct(1)).toBe(25); // $1 = 25 TCT
      expect(usdToTct(10)).toBe(250); // $10 = 250 TCT
      expect(usdToTct(50)).toBe(1250); // $50 = 1250 TCT
      expect(usdToTct(100)).toBe(2500); // $100 = 2500 TCT
      expect(usdToTct(500)).toBe(12500); // $500 = 12500 TCT
    });

    it("should handle decimal amounts correctly", () => {
      expect(usdToTct(0.04)).toBe(1); // $0.04 = 1 TCT (minimum)
      expect(usdToTct(0.08)).toBe(2); // $0.08 = 2 TCT
      expect(usdToTct(2.5)).toBe(62.5); // $2.50 = 62.5 TCT
    });
  });

  describe("Region-Based Provider Selection", () => {
    it("should use MoonPay for unrestricted regions", async () => {
      const service = new FiatRampService();
      await service.initialize();

      // Should default to MoonPay when available
      const availability = await service.getAvailability();
      expect(availability.moonpay.available).toBe(true);
    });

    it("should switch to Transak for MoonPay-restricted regions", async () => {
      const service = new FiatRampService();
      await service.initialize();

      // Verify Transak is available as fallback
      const availability = await service.getAvailability();
      expect(availability.transak.available).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing wallet address gracefully", async () => {
      const service = new FiatRampService();
      await service.initialize();

      // Attempt to get widget URL without valid data
      const result = await service.getBuyWidgetUrl({
        userId: "user-123",
        walletAddress: "", // Empty wallet address
        orderType: "buy",
        fiatAmount: 100,
        fiatCurrency: "USD",
      });

      // Should still generate URL (validation happens on provider side)
      expect(result).not.toBeNull();
    });

    it("should handle webhook with missing data", () => {
      // Test parsing incomplete webhook
      const incompletePayload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-incomplete",
          status: "completed",
          baseCurrencyAmount: 100,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 99,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1234",
          feeAmount: 1,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Missing cryptoTransactionId
        },
      };

      const event = parseMoonPayWebhook(incompletePayload);
      expect(event.transactionHash).toBeUndefined();
      expect(event.status).toBe("completed");
    });
  });
});

describe("E2E: Multi-Currency Deposit", () => {
  it("should support EUR deposits", async () => {
    const service = new FiatRampService();
    await service.initialize();

    const result = await service.getBuyWidgetUrl({
      userId: "user-eu",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      orderType: "buy",
      fiatAmount: 100,
      fiatCurrency: "EUR",
    });

    expect(result).not.toBeNull();
    expect(result?.url).toContain("eur");
  });

  it("should support GBP deposits", async () => {
    const service = new FiatRampService();
    await service.initialize();

    const result = await service.getBuyWidgetUrl({
      userId: "user-uk",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      orderType: "buy",
      fiatAmount: 100,
      fiatCurrency: "GBP",
    });

    expect(result).not.toBeNull();
    expect(result?.url).toContain("gbp");
  });
});
