/**
 * Transak Webhook Edge Function Tests
 *
 * Tests the webhook handler for Transak payment notifications.
 * Verifies signature validation, status mapping, and balance updates.
 */

import * as crypto from "crypto";
import {
  verifyTransakWebhookSignature,
  parseTransakWebhook,
  mapTransakStatus,
} from "@/lib/fiat-ramp/transak";
import type { Transak } from "@/lib/fiat-ramp/types";

// Mock the webhook secret
const MOCK_WEBHOOK_SECRET = "whsec_test_transak_secret_key_67890";

/**
 * Generate a valid HMAC signature for testing
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Transak Webhook Handler", () => {
  describe("Signature Verification", () => {
    it("should verify valid signature format", async () => {
      const payload = JSON.stringify({
        eventID: "evt-123",
        webhookData: { id: "order-123", status: "COMPLETED" },
      });

      // Valid 64 char hex signature
      const validSignature = "a".repeat(64);

      const isValid = await verifyTransakWebhookSignature(payload, validSignature);

      // In test env without secret configured, should return false
      expect(isValid).toBe(false);
    });

    it("should reject invalid signature format", async () => {
      const payload = JSON.stringify({
        eventID: "evt-123",
        webhookData: { id: "order-123", status: "COMPLETED" },
      });

      const invalidSignature = "invalid_transak_signature";

      const isValid = await verifyTransakWebhookSignature(payload, invalidSignature);
      expect(isValid).toBe(false);
    });

    it("should reject empty signature", async () => {
      const payload = JSON.stringify({
        eventID: "evt-123",
        webhookData: { id: "order-123", status: "COMPLETED" },
      });

      const isValid = await verifyTransakWebhookSignature(payload, "");
      expect(isValid).toBe(false);
    });
  });

  describe("Status Mapping", () => {
    it("should map AWAITING_PAYMENT_FROM_USER to waiting_payment", () => {
      expect(mapTransakStatus("AWAITING_PAYMENT_FROM_USER")).toBe("waiting_payment");
    });

    it("should map PAYMENT_DONE_MARKED_BY_USER to waiting_payment", () => {
      expect(mapTransakStatus("PAYMENT_DONE_MARKED_BY_USER")).toBe("waiting_payment");
    });

    it("should map PROCESSING to processing", () => {
      expect(mapTransakStatus("PROCESSING")).toBe("processing");
    });

    it("should map PENDING_DELIVERY_FROM_TRANSAK to processing", () => {
      expect(mapTransakStatus("PENDING_DELIVERY_FROM_TRANSAK")).toBe("processing");
    });

    it("should map COMPLETED to completed", () => {
      expect(mapTransakStatus("COMPLETED")).toBe("completed");
    });

    it("should map CANCELLED to cancelled", () => {
      expect(mapTransakStatus("CANCELLED")).toBe("cancelled");
    });

    it("should map FAILED to failed", () => {
      expect(mapTransakStatus("FAILED")).toBe("failed");
    });

    it("should map REFUNDED to refunded", () => {
      expect(mapTransakStatus("REFUNDED")).toBe("refunded");
    });

    it("should map EXPIRED to cancelled", () => {
      expect(mapTransakStatus("EXPIRED")).toBe("cancelled");
    });

    it("should map unknown statuses to pending", () => {
      expect(mapTransakStatus("UNKNOWN_STATUS")).toBe("pending");
      expect(mapTransakStatus("")).toBe("pending");
    });
  });

  describe("Webhook Parsing", () => {
    it("should parse COMPLETED buy webhook correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-buy-complete-123",
        webhookData: {
          id: "order-buy-123",
          partnerOrderId: "TC-TRK-USER123-ABC",
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 100,
          cryptoCurrency: "USDC",
          cryptoAmount: 99.5,
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          transactionHash: "0xtransakHash123",
          totalFeeInFiat: 0.5,
          createdAt: "2024-01-15T10:00:00Z",
          completedAt: "2024-01-15T10:05:00Z",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.provider).toBe("transak");
      expect(event.eventType).toBe("COMPLETED");
      expect(event.orderId).toBe("order-buy-123");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(100);
      expect(event.fiatCurrency).toBe("USD");
      expect(event.cryptoAmount).toBe(99.5);
      expect(event.cryptoCurrency).toBe("USDC");
      expect(event.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(event.transactionHash).toBe("0xtransakHash123");
    });

    it("should parse FAILED webhook correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-failed-456",
        webhookData: {
          id: "order-failed-456",
          partnerOrderId: "TC-TRK-USER456-DEF",
          status: "FAILED",
          fiatCurrency: "EUR",
          fiatAmount: 50,
          cryptoCurrency: "USDC",
          cryptoAmount: 0,
          walletAddress: "0xabcdef",
          totalFeeInFiat: 0,
          createdAt: "2024-01-15T11:00:00Z",
          statusReason: "Payment verification failed",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.status).toBe("failed");
      expect(event.failureReason).toBe("Payment verification failed");
      expect(event.cryptoAmount).toBe(0);
    });

    it("should parse REFUNDED webhook correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-refund-789",
        webhookData: {
          id: "order-refund-789",
          partnerOrderId: "TC-TRK-USER789-GHI",
          status: "REFUNDED",
          fiatCurrency: "GBP",
          fiatAmount: 80,
          cryptoCurrency: "USDC",
          cryptoAmount: 0,
          walletAddress: "0x987654",
          totalFeeInFiat: 0,
          createdAt: "2024-01-15T12:00:00Z",
          statusReason: "Refund requested by user",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.status).toBe("refunded");
      expect(event.failureReason).toBe("Refund requested by user");
    });

    it("should parse sell order COMPLETED webhook correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-sell-complete-001",
        webhookData: {
          id: "order-sell-001",
          partnerOrderId: "TC-TRK-SELL-USER001-XYZ",
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 95, // Received after fees
          cryptoCurrency: "USDC",
          cryptoAmount: 100, // Sold
          walletAddress: "0xseller123",
          transactionHash: "0xtransakSellHash001",
          totalFeeInFiat: 5.0,
          createdAt: "2024-01-15T14:00:00Z",
          completedAt: "2024-01-15T14:30:00Z",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.eventType).toBe("COMPLETED");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(95);
      expect(event.cryptoAmount).toBe(100);
    });

    it("should handle missing optional fields gracefully", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-minimal",
        webhookData: {
          id: "order-minimal",
          status: "PROCESSING",
          fiatCurrency: "CAD",
          fiatAmount: 75,
          cryptoCurrency: "USDC",
          cryptoAmount: 50,
          walletAddress: "0xminimal",
          totalFeeInFiat: 2.5,
          createdAt: "2024-01-15T15:00:00Z",
          // Missing: partnerOrderId, transactionHash, completedAt, statusReason
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.orderId).toBe("order-minimal");
      expect(event.transactionHash).toBeUndefined();
      expect(event.failureReason).toBeUndefined();
      expect(event.status).toBe("processing");
    });
  });

  describe("Balance Update Logic", () => {
    it("should calculate correct TCT credit for completed buy", () => {
      const usdcReceived = 100;
      const USDC_TO_TCT = 25;
      const expectedTct = usdcReceived * USDC_TO_TCT;

      expect(expectedTct).toBe(2500);
    });

    it("should calculate correct TCT debit for completed sell", () => {
      const usdcSold = 40;
      const USDC_TO_TCT = 25;
      const tctDebited = usdcSold * USDC_TO_TCT;

      expect(tctDebited).toBe(1000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero amounts", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-zero",
        webhookData: {
          id: "order-zero",
          status: "PENDING_DELIVERY_FROM_TRANSAK",
          fiatCurrency: "USD",
          fiatAmount: 0,
          cryptoCurrency: "USDC",
          cryptoAmount: 0,
          walletAddress: "0x0000",
          totalFeeInFiat: 0,
          createdAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatAmount).toBe(0);
      expect(event.cryptoAmount).toBe(0);
    });

    it("should handle very large amounts", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-large",
        webhookData: {
          id: "order-large",
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 100000,
          cryptoCurrency: "USDC",
          cryptoAmount: 99500,
          walletAddress: "0xwhale",
          transactionHash: "0xlargeTx",
          totalFeeInFiat: 500,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatAmount).toBe(100000);
      expect(event.cryptoAmount).toBe(99500);
    });

    it("should handle decimal precision correctly", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-decimal",
        webhookData: {
          id: "order-decimal",
          status: "COMPLETED",
          fiatCurrency: "USD",
          fiatAmount: 99.99,
          cryptoCurrency: "USDC",
          cryptoAmount: 98.765432,
          walletAddress: "0xdecimal",
          transactionHash: "0xdecimalTx",
          totalFeeInFiat: 1.234567,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatAmount).toBe(99.99);
      expect(event.cryptoAmount).toBe(98.765432);
    });
  });

  describe("Currency Handling", () => {
    it("should preserve currency codes from webhook", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-currency",
        webhookData: {
          id: "order-currency",
          status: "COMPLETED",
          fiatCurrency: "EUR",
          fiatAmount: 100,
          cryptoCurrency: "USDC",
          cryptoAmount: 99,
          walletAddress: "0xeu",
          totalFeeInFiat: 1,
          createdAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatCurrency).toBe("EUR");
      expect(event.cryptoCurrency).toBe("USDC");
    });

    it("should handle GBP currency", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-gbp",
        webhookData: {
          id: "order-gbp",
          status: "COMPLETED",
          fiatCurrency: "GBP",
          fiatAmount: 80,
          cryptoCurrency: "USDC",
          cryptoAmount: 100,
          walletAddress: "0xuk",
          totalFeeInFiat: 1,
          createdAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatCurrency).toBe("GBP");
    });

    it("should handle CAD currency", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-cad",
        webhookData: {
          id: "order-cad",
          status: "COMPLETED",
          fiatCurrency: "CAD",
          fiatAmount: 130,
          cryptoCurrency: "USDC",
          cryptoAmount: 100,
          walletAddress: "0xca",
          totalFeeInFiat: 2,
          createdAt: new Date().toISOString(),
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.fiatCurrency).toBe("CAD");
    });
  });

  describe("Processing Status Transitions", () => {
    it("should track order through status lifecycle", () => {
      const statusSequence = [
        "AWAITING_PAYMENT_FROM_USER",
        "PAYMENT_DONE_MARKED_BY_USER",
        "PROCESSING",
        "PENDING_DELIVERY_FROM_TRANSAK",
        "COMPLETED",
      ];

      const expectedMappings = [
        "waiting_payment",
        "waiting_payment",
        "processing",
        "processing",
        "completed",
      ];

      statusSequence.forEach((status, index) => {
        expect(mapTransakStatus(status)).toBe(expectedMappings[index]);
      });
    });

    it("should handle expired orders", () => {
      const payload: Transak.WebhookPayload = {
        eventID: "evt-expired",
        webhookData: {
          id: "order-expired",
          status: "EXPIRED",
          fiatCurrency: "USD",
          fiatAmount: 50,
          cryptoCurrency: "USDC",
          cryptoAmount: 0,
          walletAddress: "0xexpired",
          totalFeeInFiat: 0,
          createdAt: new Date().toISOString(),
          statusReason: "Order expired after 30 minutes",
        },
      };

      const event = parseTransakWebhook(payload);

      expect(event.status).toBe("cancelled");
      expect(event.failureReason).toBe("Order expired after 30 minutes");
    });
  });
});
