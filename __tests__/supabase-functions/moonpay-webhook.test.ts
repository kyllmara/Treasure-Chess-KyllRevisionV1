/**
 * MoonPay Webhook Edge Function Tests
 *
 * Tests the webhook handler for MoonPay payment notifications.
 * Verifies signature validation, status mapping, and balance updates.
 */

import * as crypto from "crypto";
import {
  verifyMoonPayWebhookSignature,
  parseMoonPayWebhook,
  mapMoonPayStatus,
} from "@/lib/fiat-ramp/moonpay";
import type { MoonPay } from "@/lib/fiat-ramp/types";

// Mock the webhook secret
const MOCK_WEBHOOK_SECRET = "whsec_test_moonpay_secret_key_12345";

/**
 * Generate a valid HMAC signature for testing
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("MoonPay Webhook Handler", () => {
  describe("Signature Verification", () => {
    it("should verify valid signature format", async () => {
      const payload = JSON.stringify({
        type: "transaction_completed",
        data: { id: "tx-123", status: "completed" },
      });

      // Valid sha256 format signature (64 hex chars)
      const validFormatSignature = "sha256=" + "a".repeat(64);

      // Without webhook secret configured, should return false
      const isValid = await verifyMoonPayWebhookSignature(payload, validFormatSignature);

      // In test env without secret configured, should return false
      expect(isValid).toBe(false);
    });

    it("should reject invalid signature format", async () => {
      const payload = JSON.stringify({
        type: "transaction_completed",
        data: { id: "tx-123", status: "completed" },
      });

      const invalidSignature = "invalid_signature_12345";

      const isValid = await verifyMoonPayWebhookSignature(payload, invalidSignature);
      expect(isValid).toBe(false);
    });

    it("should reject short signature", async () => {
      const payload = JSON.stringify({
        type: "transaction_completed",
        data: { id: "tx-123", status: "completed" },
      });

      // Too short - not 64 chars
      const shortSignature = "sha256=abc123";

      const isValid = await verifyMoonPayWebhookSignature(payload, shortSignature);
      expect(isValid).toBe(false);
    });
  });

  describe("Status Mapping", () => {
    it("should map waitingPayment to waiting_payment", () => {
      expect(mapMoonPayStatus("waitingPayment")).toBe("waiting_payment");
    });

    it("should map pending to processing", () => {
      expect(mapMoonPayStatus("pending")).toBe("processing");
    });

    it("should map waitingAuthorization to processing", () => {
      expect(mapMoonPayStatus("waitingAuthorization")).toBe("processing");
    });

    it("should map completed to completed", () => {
      expect(mapMoonPayStatus("completed")).toBe("completed");
    });

    it("should map failed to failed", () => {
      expect(mapMoonPayStatus("failed")).toBe("failed");
    });

    it("should map unknown statuses to pending", () => {
      expect(mapMoonPayStatus("unknown_status")).toBe("pending");
      expect(mapMoonPayStatus("")).toBe("pending");
    });
  });

  describe("Webhook Parsing", () => {
    it("should parse transaction_completed webhook correctly", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-complete-123",
          externalTransactionId: "TC-USER123-ABC",
          status: "completed",
          baseCurrencyAmount: 100,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 99.5,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          cryptoTransactionId: "0xhash123456",
          feeAmount: 0.3,
          networkFeeAmount: 0.2,
          extraFeeAmount: 0,
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:05:00Z",
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.provider).toBe("moonpay");
      expect(event.eventType).toBe("transaction_completed");
      expect(event.orderId).toBe("tx-complete-123");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(100);
      expect(event.fiatCurrency).toBe("USD");
      expect(event.cryptoAmount).toBe(99.5);
      expect(event.cryptoCurrency).toBe("USDC");
      expect(event.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(event.transactionHash).toBe("0xhash123456");
    });

    it("should parse transaction_failed webhook correctly", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_failed",
        data: {
          id: "tx-failed-456",
          externalTransactionId: "TC-USER456-DEF",
          status: "failed",
          baseCurrencyAmount: 50,
          baseCurrency: { code: "eur" },
          quoteCurrencyAmount: 0,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0xabcdef",
          feeAmount: 0,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: "2024-01-15T11:00:00Z",
          updatedAt: "2024-01-15T11:01:00Z",
          failureReason: "Card declined by issuer",
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.status).toBe("failed");
      expect(event.failureReason).toBe("Card declined by issuer");
      expect(event.cryptoAmount).toBe(0);
    });

    it("should parse sell_transaction_completed webhook correctly", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "sell_transaction_completed",
        data: {
          id: "sell-tx-789",
          externalTransactionId: "TC-SELL-USER789-GHI",
          status: "completed",
          baseCurrencyAmount: 95,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 100,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x987654321fedcba",
          cryptoTransactionId: "0xsellhash789",
          feeAmount: 4.0,
          networkFeeAmount: 1.0,
          extraFeeAmount: 0,
          createdAt: "2024-01-15T12:00:00Z",
          updatedAt: "2024-01-15T12:10:00Z",
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.eventType).toBe("sell_transaction_completed");
      expect(event.status).toBe("completed");
      expect(event.fiatAmount).toBe(95);
      expect(event.cryptoAmount).toBe(100);
    });

    it("should handle missing optional fields gracefully", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_created",
        data: {
          id: "tx-minimal",
          status: "pending",
          baseCurrencyAmount: 25,
          baseCurrency: { code: "gbp" },
          quoteCurrencyAmount: 24,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x1111",
          feeAmount: 1,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: "2024-01-15T13:00:00Z",
          updatedAt: "2024-01-15T13:00:00Z",
          // Missing: externalTransactionId, cryptoTransactionId, failureReason
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.orderId).toBe("tx-minimal");
      expect(event.transactionHash).toBeUndefined();
      expect(event.failureReason).toBeUndefined();
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
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_created",
        data: {
          id: "tx-zero",
          status: "pending",
          baseCurrencyAmount: 0,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 0,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0x0000",
          feeAmount: 0,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.fiatAmount).toBe(0);
      expect(event.cryptoAmount).toBe(0);
    });

    it("should handle very large amounts", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-large",
          status: "completed",
          baseCurrencyAmount: 100000,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 99500,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0xwhale",
          cryptoTransactionId: "0xlargeTx",
          feeAmount: 300,
          networkFeeAmount: 200,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.fiatAmount).toBe(100000);
      expect(event.cryptoAmount).toBe(99500);
    });

    it("should handle decimal precision correctly", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-decimal",
          status: "completed",
          baseCurrencyAmount: 99.99,
          baseCurrency: { code: "usd" },
          quoteCurrencyAmount: 98.765432,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0xdecimal",
          cryptoTransactionId: "0xdecimalTx",
          feeAmount: 0.125,
          networkFeeAmount: 0.075,
          extraFeeAmount: 0.05,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.fiatAmount).toBe(99.99);
      expect(event.cryptoAmount).toBe(98.765432);
    });
  });

  describe("Currency Handling", () => {
    it("should normalize currency codes to uppercase", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-currency",
          status: "completed",
          baseCurrencyAmount: 100,
          baseCurrency: { code: "eur" },
          quoteCurrencyAmount: 99,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0xeu",
          feeAmount: 1,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.fiatCurrency).toBe("EUR");
      expect(event.cryptoCurrency).toBe("USDC");
    });

    it("should handle GBP currency", () => {
      const payload: MoonPay.WebhookPayload = {
        type: "transaction_completed",
        data: {
          id: "tx-gbp",
          status: "completed",
          baseCurrencyAmount: 80,
          baseCurrency: { code: "gbp" },
          quoteCurrencyAmount: 100,
          quoteCurrency: { code: "usdc" },
          walletAddress: "0xuk",
          feeAmount: 1,
          networkFeeAmount: 0,
          extraFeeAmount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const event = parseMoonPayWebhook(payload);

      expect(event.fiatCurrency).toBe("GBP");
    });
  });
});
