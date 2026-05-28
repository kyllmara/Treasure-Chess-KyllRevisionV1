/**
 * Region Detection Service
 *
 * Detects user's geographic region to determine which fiat ramp provider
 * to use (MoonPay vs Transak) based on regulatory restrictions.
 */

import * as Location from "expo-location";
import type {
  UserRegion,
  ProviderAvailability,
  FiatRampProvider,
} from "./types";
import { MOONPAY_RESTRICTED_US_STATES } from "./types";

// Cache for region detection
let cachedRegion: UserRegion | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
let cacheTimestamp: number = 0;

/**
 * IP-based geolocation API (free tier)
 */
const IP_GEOLOCATION_API = "https://ipapi.co/json/";

/**
 * Backup geolocation API
 */
const BACKUP_GEOLOCATION_API = "https://ip-api.com/json/?fields=status,country,countryCode,region,regionName";

interface IpApiResponse {
  country_code?: string;
  country_name?: string;
  region_code?: string;
  region?: string;
  error?: boolean;
}

interface IpApiBackupResponse {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
}

/**
 * Detect user region via IP geolocation
 */
async function detectRegionByIp(): Promise<UserRegion | null> {
  try {
    // Try primary API
    const response = await fetch(IP_GEOLOCATION_API, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data: IpApiResponse = await response.json();

      if (!data.error && data.country_code) {
        return {
          countryCode: data.country_code,
          countryName: data.country_name || data.country_code,
          regionCode: data.region_code,
          regionName: data.region,
          isRestricted: false, // Will be determined later
          detectedAt: new Date().toISOString(),
        };
      }
    }

    // Try backup API
    const backupResponse = await fetch(BACKUP_GEOLOCATION_API);
    if (backupResponse.ok) {
      const backupData: IpApiBackupResponse = await backupResponse.json();

      if (backupData.status === "success") {
        return {
          countryCode: backupData.countryCode,
          countryName: backupData.country,
          regionCode: backupData.region,
          regionName: backupData.regionName,
          isRestricted: false,
          detectedAt: new Date().toISOString(),
        };
      }
    }

    return null;
  } catch (error) {
    console.warn("IP geolocation failed:", error);
    return null;
  }
}

/**
 * Detect user region via device location (requires permission)
 */
async function detectRegionByLocation(): Promise<UserRegion | null> {
  try {
    // Check if we have permission
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status !== "granted") {
      // Don't request permission automatically - let the UI handle this
      return null;
    }

    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low, // We only need rough location
    });

    // Reverse geocode to get country/region
    const [address] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (address) {
      return {
        countryCode: address.isoCountryCode || "",
        countryName: address.country || "",
        regionCode: address.region || undefined,
        regionName: address.region || undefined,
        isRestricted: false,
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  } catch (error) {
    console.warn("Device location detection failed:", error);
    return null;
  }
}

/**
 * Detect user's geographic region
 * Uses IP geolocation first, falls back to device location if available
 */
export async function detectUserRegion(
  forceRefresh: boolean = false
): Promise<UserRegion | null> {
  // Return cached result if valid
  if (
    !forceRefresh &&
    cachedRegion &&
    Date.now() - cacheTimestamp < CACHE_DURATION_MS
  ) {
    return cachedRegion;
  }

  // Try IP-based detection first (doesn't require permissions)
  let region = await detectRegionByIp();

  // If IP detection fails, try device location
  if (!region) {
    region = await detectRegionByLocation();
  }

  // If we got a region, determine if it's restricted
  if (region) {
    region.isRestricted = isRestrictedRegion(
      region.countryCode,
      region.regionCode
    );

    if (region.isRestricted) {
      region.restrictedProvider = getRestrictedProvider(
        region.countryCode,
        region.regionCode
      );
    }

    // Cache the result
    cachedRegion = region;
    cacheTimestamp = Date.now();
  }

  return region;
}

/**
 * Check if a region has provider restrictions
 */
export function isRestrictedRegion(
  countryCode: string,
  stateCode?: string
): boolean {
  // Check US state restrictions for MoonPay
  if (countryCode === "US" && stateCode) {
    const restrictedStates = MOONPAY_RESTRICTED_US_STATES as readonly string[];
    return restrictedStates.includes(stateCode.toUpperCase());
  }

  return false;
}

/**
 * Get which provider is restricted in a region
 */
export function getRestrictedProvider(
  countryCode: string,
  stateCode?: string
): FiatRampProvider | undefined {
  // US state restrictions affect MoonPay
  if (countryCode === "US" && stateCode) {
    const restrictedStates = MOONPAY_RESTRICTED_US_STATES as readonly string[];
    if (restrictedStates.includes(stateCode.toUpperCase())) {
      return "moonpay";
    }
  }

  return undefined;
}

/**
 * Get provider availability for a region
 */
export function getProviderAvailability(
  region: UserRegion | null
): ProviderAvailability {
  // Default: both available
  const availability: ProviderAvailability = {
    moonpay: { available: true },
    transak: { available: true },
    recommendedProvider: "moonpay", // MoonPay is primary
  };

  if (!region) {
    // If we can't detect region, default to MoonPay
    return availability;
  }

  // Check MoonPay restrictions
  if (region.countryCode === "US" && region.regionCode) {
    const restrictedStates = MOONPAY_RESTRICTED_US_STATES as readonly string[];
    if (restrictedStates.includes(region.regionCode.toUpperCase())) {
      availability.moonpay = {
        available: false,
        reason: `MoonPay is not available in ${region.regionName || region.regionCode}`,
      };
      availability.recommendedProvider = "transak";
    }
  }

  // If MoonPay is unavailable and Transak is available, recommend Transak
  if (!availability.moonpay.available && availability.transak.available) {
    availability.recommendedProvider = "transak";
  }

  // If both are unavailable, set to null
  if (!availability.moonpay.available && !availability.transak.available) {
    availability.recommendedProvider = null;
  }

  return availability;
}

/**
 * Get the recommended provider for a user's region
 */
export async function getRecommendedProvider(): Promise<FiatRampProvider | null> {
  const region = await detectUserRegion();
  const availability = getProviderAvailability(region);
  return availability.recommendedProvider;
}

/**
 * Clear the cached region (for testing or when user changes location)
 */
export function clearRegionCache(): void {
  cachedRegion = null;
  cacheTimestamp = 0;
}

/**
 * Get human-readable description of provider restrictions
 */
export function getRestrictionDescription(region: UserRegion | null): string | null {
  if (!region || !region.isRestricted) {
    return null;
  }

  if (region.restrictedProvider === "moonpay") {
    return `MoonPay is not available in ${region.regionName || region.countryName}. Using Transak instead.`;
  }

  if (region.restrictedProvider === "transak") {
    return `Transak is not available in ${region.regionName || region.countryName}. Using MoonPay instead.`;
  }

  return null;
}

/**
 * Request location permission from user
 * Call this when user explicitly wants to use location for better accuracy
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}
