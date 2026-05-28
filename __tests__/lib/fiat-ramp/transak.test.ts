/**
 * Transak Integration Tests
 */

import {
  isTransakConfigured,
  buildTransakBuyWidgetParams,
  buildTransakSellWidgetParams,
  mapTransakStatus,
  parseTransakWebhook,
  calculateTctFromUsdc,
  calculateTctFromFiat,
  generatePartnerOrderId,
  isTransakAvailable,
} from "@/lib/fiat-ramp/transak";
import type { Transak } from "@/lib/fiat-ramp/types";

describe("Transak Module", () => {
  describe("isTransakConfigured", () => {
    it("should return false when no API key is set", () => {
      const result = isTransakConfigured();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("buildTransakBuyWidgetParams", () => {
    it("should build valid buy widget parameters", () => {
      const params = buildTransakBuyWidgetParams(
        "0x1234567890abcdef1234567890abcdef12345678",
        100,
        "USD",
        "user-123",
        "test@example.com"
      );

      expect(params.baseCurrencyCode).toBe("usd");
      expect(params.baseCurrencyAmount).toBe(100);
      expect(params.quoteCurrencyCode).toBe("usdc");
      expect(params.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(params.email).toBe("test@example.com");
      expect(params.externalCustomerId).toBe("user-123");
      expect(params.theme).toBe("dark");
      expect(params.colorCode).toBe("FFD700");
    });
  });

  describe("buildTransakSellWidgetParams", () => {
    it("should build valid sell widget parameters", () => {
      const params = buildTransakSellWidgetParams(
        "0x1234567890abcdef1234567890abcdef12345678",
        4, // 4 USDC
        "USD",
        "user-123"
      );

      expect(params.quoteCurrencyCode).toBe("usdc");
      expect(params.quoteCurrencyAmount).toBe(4);
      expect(params.refundWalletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(params.payoutMethod).toBe("bank_transfer");
    });
  });

  describe("mapTransakStatus", () => {
    it("should map Transak statuses correctly", () => {
      expect(mapTransakStatus("AWAITING_PAYMENT_FROM_USER")).toBe("waiting_payment");
      expect(mapTransakStatus("PAYMENT_DONE_MARKED_BY_USER")).toBe("waiting_payment");
      expect(mapTransakStatus("PROCESSING")).toBe("processing");
      expect(mapTransakStatus("PENDING_DELIVERY_FROM_TRANSAK")).toBe("processing");
      expect(mapTransakStatus("COMPLETED")).toBe("completed");
      expect(mapTransakStatus("CANCELLED")).toBe("cancelled");
      expect(mapTransakStatus("FAILED")).toBe("failed");
      expect(mapTransakStatus("REFUNDED")).toBe("refunded");
      expect(mapTransakStatus("EXPIRED")).toBe("cancelled");
      expect(mapTransakStatus("UNKNOWN")).toBe("pending");
    });
  });

  describe("parseTransakWebhook", () => {
    it("should parse webhook payload correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-123",
        webhookData: {
          id: "order-123",
          partnerOrderId: "TC-TRK-USER-123",
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 100,
          cryptoCurrency: "USDC",
          cryptoAmount: 98.5,
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          transactionHash: "0xabc123",
          totalFeeInFiat: 1.5,
          createdAt: "2024-01-01T00:00:00Z",
          completedAt: "2024-01-01T00:05:00Z",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.provider).toBe("transak");
      expect(event.eventType).toBe("COMPLETED");
      expect(event.orderId).toBe("order-123");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(100);
      expect(event.fiatCurrency).toBe("USD");
      expect(event.cryptoAmount).toBe(98.5);
      expect(event.cryptoCurrency).toBe("USDC");
      expect(event.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(event.transactionHash).toBe("0xabc123");
    });

    it("should handle failed orders", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-456",
        webhookData: {
          id: "order-456",
          status: "FAILED",
          fiatCurrency: "EUR",
          fiatAmount: 50,
          cryptoCurrency: "USDC",
          cryptoAmount: 0,
          walletAddress: "0x1234",
          totalFeeInFiat: 0,
          createdAt: "2024-01-01T00:00:00Z",
          statusReason: "Payment verification failed",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.status).toBe("failed");
      expect(event.failureReason).toBe("Payment verification failed");
    });
  });

  describe("calculateTctFromUsdc", () => {
    it("should calculate TCT from USDC correctly", () => {
      expect(calculateTctFromUsdc(1)).toBe(25);
      expect(calculateTctFromUsdc(4)).toBe(100);
      expect(calculateTctFromUsdc(10)).toBe(250);
    });
  });

  describe("calculateTctFromFiat", () => {
    it("should calculate TCT from fiat correctly", () => {
      expect(calculateTctFromFiat(1, "USD")).toBe(25);
      expect(calculateTctFromFiat(10, "USD")).toBe(250);
    });
  });

  describe("generatePartnerOrderId", () => {
    it("should generate unique partner order IDs", () => {
      const id1 = generatePartnerOrderId("user-123");
      const id2 = generatePartnerOrderId("user-123");

      expect(id1).not.toBe(id2);
      expect(id1.startsWith("TC-TRK-")).toBe(true);
      expect(id1.length).toBeGreaterThan(20);
    });
  });

  describe("isTransakAvailable", () => {
    it("should return true for supported countries", () => {
      expect(isTransakAvailable("US")).toBe(true);
      expect(isTransakAvailable("GB")).toBe(true);
      expect(isTransakAvailable("DE")).toBe(true);
      expect(isTransakAvailable("FR")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(isTransakAvailable("us")).toBe(true);
      expect(isTransakAvailable("Gb")).toBe(true);
    });
  });
});
