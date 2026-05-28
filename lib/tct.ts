/**
 * TCT (Treasure Chess Token) canonical rate constants.
 * Single source of truth — import from here, never redefine elsewhere.
 *
 * Economic invariants:
 *   1 USDC = 25 TCT   ($0.04 per TCT)
 *   1 TCT  = $0.04    (= 1/25 USDC)
 */

export const USDC_TO_TCT_RATE = 25; // 1 USDC = 25 TCT
export const TCT_TO_USDC_RATE = 25; // alias for clarity in division contexts
export const TCT_TO_USD = 0.04;     // 1 TCT = $0.04

export function usdcToTct(usdc: number): number {
  return Math.floor(usdc * USDC_TO_TCT_RATE);
}

export function tctToUsdc(tct: number): number {
  return tct / USDC_TO_TCT_RATE;
}

export function tctToUsd(tct: number): number {
  return tct * TCT_TO_USD;
}

export function usdToTct(usd: number): number {
  return usd / TCT_TO_USD;
}
