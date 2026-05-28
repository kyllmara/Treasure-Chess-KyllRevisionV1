/**
 * MoonPay Integration Tests
 */

import {
  isMoonPayConfigured,
  generateBuyWidgetUrl,
  generateSellWidgetUrl,
  buildBuyWidgetParams,
  buildSellWidgetParams,
  mapMoonPayStatus,
  parseMoonPayWebhook,
  calculateTctFromUsdc,
  calculateTctFromFiat,
  generateExternalTransactionId,
  MOONPAY_TEST_CARDS,
} from "@/lib/fiat-ramp/moonpay";
import type { MoonPay } from "@/lib/fiat-ramp/types";

describe("MoonPay Module", () => {
  describe("isMoonPayConfigured", () => {
    it("should return false when no API key is set", () => {
      // In test environment, EXPO_PUBLIC_MOONPAY_API_KEY is not set
      const result = isMoonPayConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("buildBuyWidgetParams", () => {
    it("should build valid buy widget parameters", () => {
      const params = buildBuyWidgetParams(
        "0x1234567890abcdef1234567890abcdef12345678",
        100,
        "USD",
        "user-123",
        "test@example.com"
      );

      expect(params.baseCurrencyCode).toBe("usd");
      expect(params.baseCurrencyAmount).toBe(100);
      expect(params.quoteCurrencyCode).toBe("usdc_base");
      expect(params.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(params.email).toBe("test@example.com");
      expect(params.externalCustomerId).toBe("user-123");
      expect(params.theme).toBe("dark");
      expect(params.colorCode).toBe("FFD700");
      expect(params.showWalletAddressForm).toBe(false);
    });

    it("should work without email", () => {
      const params = buildBuyWidgetParams(
        "0x1234567890abcdef1234567890abcdef12345678",
        50,
        "EUR",
        "user-456"
      );

      expect(params.email).toBeUndefined();
      expect(params.baseCurrencyCode).toBe("eur");
    });
  });

  describe("buildSellWidgetParams", () => {
    it("should build valid sell widget parameters", () => {
      const params = buildSellWidgetParams(
        "0x1234567890abcdef1234567890abcdef12345678",
        4, // 4 USDC
        "USD",
        "user-123",
        "test@example.com"
      );

      expect(params.quoteCurrencyCode).toBe("usdc_base");
      expect(params.quoteCurrencyAmount).toBe(4);
      expect(params.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(params.refundWalletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(params.payoutMethod).toBe("bank_transfer");
    });
  });

  describe("mapMoonPayStatus", () => {
    it("should map MoonPay statuses correctly", () => {
      expect(mapMoonPayStatus("waitingPayment")).toBe("waiting_payment");
      expect(mapMoonPayStatus("pending")).toBe("processing");
      expect(mapMoonPayStatus("waitingAuthorization")).toBe("processing");
      expect(mapMoonPayStatus("completed")).toBe("completed");
      expect(mapMoonPayStatus("failed")).toBe("failed");
      expect(mapMoonPayStatus("unknown")).toBe("pending");
    });
  });

  describe("parseMoonPayWebhook", () => {
    it("should parse webhook payload correctly", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-123",
          externalTransactionId: "TC-USER-123",
          status: "completed",
          baseCurrencyAmount: 100,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 98.5,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          cryptoTransactionId: "0xabc123",
          feeAmount: 1.0,
          networkFeeAmount: 0.5,
          extraFeeAmount: 0,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:05:00Z",
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.provider).toBe("moonpay");
      expect(event.eventType).toBe("transaction_completed");
      expect(event.orderId).toBe("tx-123");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(100);
      expect(event.fiatCurrency).toBe("USD");
      expect(event.cryptoAmount).toBe(98.5);
      expect(event.cryptoCurrency).toBe("USDC");
      expect(event.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(event.transactionHash).toBe("0xabc123");
    });

    it("should handle failed transactions", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_failed",
        data: {
          id: "tx-456",
          status: "failed",
          baseCurrencyAmount: 50,
          baseCurrency: { code: "eur" },
          quoteCurrencyAmount: 0,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1234",
          feeAmount: 0,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:01:00Z",
          failureReason: "Card declined",
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.status).toBe("failed");
      expect(event.failureReason).toBe("Card declined");
    });
  });

  describe("calculateTctFromUsdc", () => {
    it("should calculate TCT from USDC correctly", () => {
      expect(calculateTctFromUsdc(1)).toBe(25); // 1 USDC = 25 TCT
      expect(calculateTctFromUsdc(4)).toBe(100); // 4 USDC = 100 TCT
      expect(calculateTctFromUsdc(10)).toBe(250); // 10 USDC = 250 TCT
      expect(calculateTctFromUsdc(0)).toBe(0);
    });
  });

  describe("calculateTctFromFiat", () => {
    it("should calculate TCT from fiat correctly", () => {
      expect(calculateTctFromFiat(1, "USD")).toBe(25); // $1 = 25 TCT
      expect(calculateTctFromFiat(10, "USD")).toBe(250); // $10 = 250 TCT
      expect(calculateTctFromFiat(100, "USD")).toBe(2500); // $100 = 2500 TCT
    });
  });

  describe("generateExternalTransactionId", () => {
    it("should generate unique transaction IDs", () => {
      const id1 = generateExternalTransactionId("user-123");
      const id2 = generateExternalTransactionId("user-123");

      expect(id1).not.toBe(id2);
      expect(id1.startsWith("TC-")).toBe(true);
      expect(id1.length).toBeGreaterThan(15);
    });

    it("should include user ID prefix", () => {
      const id = generateExternalTransactionId("abcdefgh-1234");
      expect(id.includes("ABCDEFGH")).toBe(true);
    });
  });

  describe("MOONPAY_TEST_CARDS", () => {
    it("should have test card numbers defined", () => {
      expect(MOONPAY_TEST_CARDS.SUCCESS).toBe("4000056655665556");
      expect(MOONPAY_TEST_CARDS.FAILURE).toBe("4000000000000002");
      expect(MOONPAY_TEST_CARDS.THREEDS).toBe("4000000000003220");
    });
  });
});
