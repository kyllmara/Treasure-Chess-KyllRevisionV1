/**
 * Region Detection Tests
 */

import {
  isRestrictedRegion,
  getRestrictedProvider,
  getProviderAvailability,
  getRestrictionDescription,
} from "@/lib/fiat-ramp/region";
import type { UserRegion } from "@/lib/fiat-ramp/types";
import { MOONPAY_RESTRICTED_US_STATES } from "@/lib/fiat-ramp/types";

describe("Region Detection Module", () => {
  describe("isRestrictedRegion", () => {
    it("should identify restricted US states", () => {
      expect(isRestrictedRegion("US", "NY")).toBe(true);
      expect(isRestrictedRegion("US", "TX")).toBe(true);
      expect(isRestrictedRegion("US", "HI")).toBe(true);
      expect(isRestrictedRegion("US", "VT")).toBe(true);
      expect(isRestrictedRegion("US", "LA")).toBe(true);
    });

    it("should not restrict other US states", () => {
      expect(isRestrictedRegion("US", "CA")).toBe(false);
      expect(isRestrictedRegion("US", "FL")).toBe(false);
      expect(isRestrictedRegion("US", "WA")).toBe(false);
    });

    it("should not restrict non-US countries", () => {
      expect(isRestrictedRegion("GB", undefined)).toBe(false);
      expect(isRestrictedRegion("DE", undefined)).toBe(false);
      expect(isRestrictedRegion("FR", undefined)).toBe(false);
    });

    it("should handle case insensitivity", () => {
      expect(isRestrictedRegion("US", "ny")).toBe(true);
      expect(isRestrictedRegion("us", "NY")).toBe(false); // Country case matters
    });
  });

  describe("getRestrictedProvider", () => {
    it("should return moonpay for restricted US states", () => {
      expect(getRestrictedProvider("US", "NY")).toBe("moonpay");
      expect(getRestrictedProvider("US", "TX")).toBe("moonpay");
    });

    it("should return undefined for unrestricted regions", () => {
      expect(getRestrictedProvider("US", "CA")).toBeUndefined();
      expect(getRestrictedProvider("GB", undefined)).toBeUndefined();
    });
  });

  describe("getProviderAvailability", () => {
    it("should show both providers available for unrestricted regions", () => {
      const region: UserRegion = {
        countryCode: "US",
        countryName: "United States",
        regionCode: "CA",
        regionName: "California",
        isRestricted: false,
        detectedAt: new Date().toISOString(),
      };

      const availability = getProviderAvailability(region);

      expect(availability.moonpay.available).toBe(true);
      expect(availability.transak.available).toBe(true);
      expect(availability.recommendedProvider).toBe("moonpay");
    });

    it("should show MoonPay unavailable for NY", () => {
      const region: UserRegion = {
        countryCode: "US",
        countryName: "United States",
        regionCode: "NY",
        regionName: "New York",
        isRestricted: true,
        restrictedProvider: "moonpay",
        detectedAt: new Date().toISOString(),
      };

      const availability = getProviderAvailability(region);

      expect(availability.moonpay.available).toBe(false);
      expect(availability.moonpay.reason).toContain("New York");
      expect(availability.transak.available).toBe(true);
      expect(availability.recommendedProvider).toBe("transak");
    });

    it("should handle null region", () => {
      const availability = getProviderAvailability(null);

      expect(availability.moonpay.available).toBe(true);
      expect(availability.transak.available).toBe(true);
      expect(availability.recommendedProvider).toBe("moonpay");
    });
  });

  describe("getRestrictionDescription", () => {
    it("should return description for restricted MoonPay regions", () => {
      const region: UserRegion = {
        countryCode: "US",
        countryName: "United States",
        regionCode: "TX",
        regionName: "Texas",
        isRestricted: true,
        restrictedProvider: "moonpay",
        detectedAt: new Date().toISOString(),
      };

      const description = getRestrictionDescription(region);

      expect(description).toContain("MoonPay");
      expect(description).toContain("Texas");
      expect(description).toContain("Transak");
    });

    it("should return null for unrestricted regions", () => {
      const region: UserRegion = {
        countryCode: "GB",
        countryName: "United Kingdom",
        isRestricted: false,
        detectedAt: new Date().toISOString(),
      };

      expect(getRestrictionDescription(region)).toBeNull();
    });

    it("should return null for null region", () => {
      expect(getRestrictionDescription(null)).toBeNull();
    });
  });

  describe("MOONPAY_RESTRICTED_US_STATES", () => {
    it("should contain known restricted states", () => {
      const states = MOONPAY_RESTRICTED_US_STATES;
      expect(states).toContain("NY");
      expect(states).toContain("TX");
      expect(states).toContain("HI");
      expect(states).toContain("VT");
      expect(states).toContain("LA");
      expect(states.length).toBe(5);
    });
  });
});
