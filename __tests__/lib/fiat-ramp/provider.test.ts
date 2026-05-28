/**
 * FiatRamp Provider Service Tests
 */

import {
  FiatRampService,
  getFiatRampService,
  usdToTct,
  usdcToTct,
  tctToUsd,
  tctToUsdc,
} from "@/lib/fiat-ramp/provider";
import {
  TCT_TO_USD_RATE,
  USDC_TO_TCT,
  WITHDRAWAL_LIMITS,
} from "@/lib/fiat-ramp/types";

describe("FiatRamp Provider Service", () => {
  describe("Utility Functions", () => {
    describe("usdToTct", () => {
      it("should convert USD to TCT correctly", () => {
        // 1 TCT = $0.04, so $1 = 25 TCT
        expect(usdToTct(1)).toBe(25);
        expect(usdToTct(10)).toBe(250);
        expect(usdToTct(100)).toBe(2500);
        expect(usdToTct(0)).toBe(0);
        expect(usdToTct(0.04)).toBe(1);
      });

      it("should handle decimal amounts", () => {
        expect(usdToTct(2.5)).toBe(62.5);
        expect(usdToTct(0.5)).toBe(12.5);
      });
    });

    describe("tctToUsd", () => {
      it("should convert TCT to USD correctly", () => {
        expect(tctToUsd(25)).toBe(1);
        expect(tctToUsd(100)).toBe(4);
        expect(tctToUsd(250)).toBe(10);
        expect(tctToUsd(1)).toBe(0.04);
        expect(tctToUsd(0)).toBe(0);
      });
    });

    describe("usdcToTct", () => {
      it("should convert USDC to TCT correctly", () => {
        // 1 USDC = 25 TCT
        expect(usdcToTct(1)).toBe(25);
        expect(usdcToTct(4)).toBe(100);
        expect(usdcToTct(10)).toBe(250);
        expect(usdcToTct(0)).toBe(0);
      });
    });

    describe("tctToUsdc", () => {
      it("should convert TCT to USDC correctly", () => {
        expect(tctToUsdc(25)).toBe(1);
        expect(tctToUsdc(100)).toBe(4);
        expect(tctToUsdc(250)).toBe(10);
        expect(tctToUsdc(0)).toBe(0);
      });
    });

    describe("Conversion consistency", () => {
      it("should maintain consistency in round-trip conversions", () => {
        const originalTct = 1000;
        const usd = tctToUsd(originalTct);
        const backToTct = usdToTct(usd);
        expect(backToTct).toBe(originalTct);

        const originalUsdc = 40;
        const tct = usdcToTct(originalUsdc);
        const backToUsdc = tctToUsdc(tct);
        expect(backToUsdc).toBe(originalUsdc);
      });
    });
  });

  describe("Constants", () => {
    describe("TCT_TO_USD_RATE", () => {
      it("should have correct value", () => {
        expect(TCT_TO_USD_RATE).toBe(0.04);
      });
    });

    describe("USDC_TO_TCT", () => {
      it("should have correct value", () => {
        expect(USDC_TO_TCT).toBe(25);
      });
    });

    describe("WITHDRAWAL_LIMITS", () => {
      it("should have daily and weekly limits", () => {
        expect(WITHDRAWAL_LIMITS.DAILY_USD).toBe(500);
        expect(WITHDRAWAL_LIMITS.WEEKLY_USD).toBe(2000);
        expect(WITHDRAWAL_LIMITS.NEW_ACCOUNT_COOLDOWN_HOURS).toBe(24);
      });
    });
  });

  describe("getFiatRampService", () => {
    it("should return a singleton instance", () => {
      const service1 = getFiatRampService();
      const service2 = getFiatRampService();
      expect(service1).toBe(service2);
    });
  });

  describe("FiatRampService", () => {
    let service: FiatRampService;

    beforeEach(() => {
      service = new FiatRampService();
    });

    describe("isConfigured", () => {
      it("should return a boolean", () => {
        expect(typeof service.isConfigured()).toBe("boolean");
      });
    });

    describe("getRegion", () => {
      it("should return null before initialization", () => {
        expect(service.getRegion()).toBeNull();
      });
    });

    describe("isInRestrictedRegion", () => {
      it("should return false before initialization", () => {
        expect(service.isInRestrictedRegion()).toBe(false);
      });
    });

    describe("getRestrictionMessage", () => {
      it("should return null before initialization", () => {
        expect(service.getRestrictionMessage()).toBeNull();
      });
    });
  });
});

describe("Type Exports", () => {
  it("should export all required types", () => {
    // These imports will fail at compile time if types are missing
    const typeChecks = {
      FiatRampService,
      getFiatRampService,
      usdToTct,
      usdcToTct,
      tctToUsd,
      tctToUsdc,
    };
    expect(Object.keys(typeChecks).length).toBe(6);
  });
});
