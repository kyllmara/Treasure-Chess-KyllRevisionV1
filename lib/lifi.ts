/**
 * LI.FI API Integration for Cross-Chain USDC Bridging
 *
 * Uses LI.FI REST API directly (no SDK) to keep bundle size small.
 * Handles quote fetching, route execution info, and status polling.
 *
 * API docs: https://docs.li.fi/li.fi-api/li.fi-api
 */

import { SOURCE_CHAIN_ID, getChainById } from "./chains";

const LIFI_API_BASE = "https://li.quest/v1";

// USDC token address on Polygon (source chain)
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

// ============================================================================
// Types
// ============================================================================

export interface LiFiQuote {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: LiFiToken;
    toToken: LiFiToken;
    fromAmount: string;
    toAmount: string;
    fromAddress: string;
    toAddress: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    gasCosts: LiFiGasCost[];
    feeCosts: LiFiFeeCost[];
    executionDuration: number;
  };
  transactionRequest?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
    gasPrice?: string;
    chainId: number;
  };
  includedSteps?: LiFiStep[];
}

export interface LiFiToken {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name: string;
}

export interface LiFiGasCost {
  type: string;
  estimate: string;
  limit: string;
  amount: string;
  amountUSD: string;
  token: LiFiToken;
}

export interface LiFiFeeCost {
  name: string;
  description: string;
  percentage: string;
  amount: string;
  amountUSD: string;
  token: LiFiToken;
  included: boolean;
}

export interface LiFiStep {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: LiFiToken;
    toToken: LiFiToken;
    fromAmount: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    gasCosts: LiFiGasCost[];
    feeCosts: LiFiFeeCost[];
    executionDuration: number;
  };
}

export interface LiFiStatus {
  transactionId: string;
  sending: {
    txHash: string;
    txLink: string;
    amount: string;
    token: LiFiToken;
    chainId: number;
  };
  receiving?: {
    txHash: string;
    txLink: string;
    amount: string;
    token: LiFiToken;
    chainId: number;
  };
  status: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  substatusMessage?: string;
}

export interface QuoteFeeBreakdown {
  bridgeFeeUsd: number;
  gasFeeUsd: number;
  totalBridgeAndGasFeeUsd: number;
  estimatedReceiveAmount: string;
  estimatedReceiveAmountMin: string;
  estimatedDurationSeconds: number;
  approvalAddress: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get a bridge quote from LI.FI for cross-chain USDC transfer.
 *
 * @param toChainId - Destination chain ID
 * @param toToken - USDC address on destination chain
 * @param amountUsdc - Amount in USDC (human-readable, e.g. "10.50")
 * @param fromAddress - Sender address on Polygon
 * @param toAddress - Recipient address on destination chain
 */
export async function getQuote(
  toChainId: number,
  toToken: string,
  amountUsdc: string,
  fromAddress: string,
  toAddress: string
): Promise<LiFiQuote> {
  // Convert USDC amount to smallest unit (6 decimals)
  const amountWei = BigInt(Math.floor(parseFloat(amountUsdc) * 1e6)).toString();

  const params = new URLSearchParams({
    fromChain: SOURCE_CHAIN_ID.toString(),
    toChain: toChainId.toString(),
    fromToken: POLYGON_USDC,
    toToken: toToken,
    fromAmount: amountWei,
    fromAddress: fromAddress,
    toAddress: toAddress,
    slippage: "0.005", // 0.5% slippage
    allowExchanges: "true",
  });

  const response = await fetch(`${LIFI_API_BASE}/quote?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LI.FI quote failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Extract fee breakdown from a LI.FI quote.
 */
export function extractFees(quote: LiFiQuote): QuoteFeeBreakdown {
  let gasFeeUsd = 0;
  let bridgeFeeUsd = 0;

  // Sum gas costs
  if (quote.estimate.gasCosts) {
    for (const gc of quote.estimate.gasCosts) {
      gasFeeUsd += parseFloat(gc.amountUSD || "0");
    }
  }

  // Sum fee costs (bridge fees, protocol fees, etc.)
  if (quote.estimate.feeCosts) {
    for (const fc of quote.estimate.feeCosts) {
      if (!fc.included) {
        bridgeFeeUsd += parseFloat(fc.amountUSD || "0");
      }
    }
  }

  // Also check included steps for additional fees
  if (quote.includedSteps) {
    for (const step of quote.includedSteps) {
      if (step.estimate.gasCosts) {
        for (const gc of step.estimate.gasCosts) {
          gasFeeUsd += parseFloat(gc.amountUSD || "0");
        }
      }
      if (step.estimate.feeCosts) {
        for (const fc of step.estimate.feeCosts) {
          if (!fc.included) {
            bridgeFeeUsd += parseFloat(fc.amountUSD || "0");
          }
        }
      }
    }
  }

  // toAmount is in smallest unit (6 decimals for USDC)
  const toAmount = quote.estimate.toAmount;
  const toAmountMin = quote.estimate.toAmountMin;

  return {
    bridgeFeeUsd,
    gasFeeUsd,
    totalBridgeAndGasFeeUsd: bridgeFeeUsd + gasFeeUsd,
    estimatedReceiveAmount: (parseInt(toAmount) / 1e6).toFixed(2),
    estimatedReceiveAmountMin: (parseInt(toAmountMin) / 1e6).toFixed(2),
    estimatedDurationSeconds: quote.estimate.executionDuration,
    approvalAddress: quote.estimate.approvalAddress,
  };
}

/**
 * Poll LI.FI for bridge transaction status.
 *
 * @param txHash - The sending transaction hash
 * @param fromChainId - Source chain ID (default: Polygon 137)
 * @param toChainId - Destination chain ID
 */
export async function getRouteStatus(
  txHash: string,
  fromChainId: number = SOURCE_CHAIN_ID,
  toChainId: number
): Promise<LiFiStatus> {
  const params = new URLSearchParams({
    txHash,
    bridge: "", // Let LI.FI auto-detect
    fromChain: fromChainId.toString(),
    toChain: toChainId.toString(),
  });

  const response = await fetch(
    `${LIFI_API_BASE}/status?${params.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`LI.FI status check failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

/**
 * Poll for bridge completion. Resolves when bridge is DONE or FAILED.
 *
 * @param txHash - The sending transaction hash
 * @param toChainId - Destination chain ID
 * @param onStatusUpdate - Callback for status updates
 * @param maxAttempts - Maximum polling attempts (default 120 = ~10 minutes)
 * @param intervalMs - Polling interval in ms (default 5000)
 */
export async function waitForBridgeCompletion(
  txHash: string,
  toChainId: number,
  onStatusUpdate?: (status: LiFiStatus) => void,
  maxAttempts: number = 120,
  intervalMs: number = 5000
): Promise<LiFiStatus> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await getRouteStatus(txHash, SOURCE_CHAIN_ID, toChainId);

      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      if (status.status === "DONE" || status.status === "FAILED") {
        return status;
      }
    } catch (err) {
      // Ignore transient errors during polling
      console.warn("[LI.FI] Status poll error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Bridge status polling timed out");
}

/**
 * Fetch supported chains from LI.FI API.
 * Can be used to dynamically update the chain list.
 */
export async function getSupportedChains(): Promise<any> {
  const response = await fetch(`${LIFI_API_BASE}/chains`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`LI.FI chains fetch failed (${response.status})`);
  }

  return response.json();
}
