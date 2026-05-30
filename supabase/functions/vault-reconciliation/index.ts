/**
 * Vault Reconciliation Edge Function
 *
 * Runs daily reconciliation to ensure vault solvency:
 * 1. Fetches on-chain USDC balance of the vault
 * 2. Calculates sum of all user TCT balances
 * 3. Compares and records any discrepancy
 * 4. Updates vault state
 *
 * Should be run via cron job daily (e.g., 00:00 UTC)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Constants
// ============================================================================

const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const USDC_DECIMALS = 6;
const BASE_RPC_URL = "https://mainnet.base.org";

// Acceptable discrepancy threshold (in USDC)
const DISCREPANCY_THRESHOLD = 1.0;

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    const cronHeader = req.headers.get("X-Cron-Secret");
    const authorized =
      authHeader === `Bearer ${supabaseServiceKey}` ||
      (!!cronSecret && cronHeader === cronSecret);

    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine
    }

    if (body.mode === "status") {
      return await getReconciliationHistory(supabase);
    } else if (body.mode === "verify") {
      return await verifyVaultBalance(supabase);
    } else {
      return await runReconciliation(supabase);
    }
  } catch (error) {
    console.error("Reconciliation error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ============================================================================
// Run Full Reconciliation
// ============================================================================

async function runReconciliation(supabase: any): Promise<Response> {
  const today = new Date().toISOString().split("T")[0];

  // Get vault address
  const { data: vaultAddress, error: vaultError } = await supabase.rpc("get_vault_address");

  if (vaultError || !vaultAddress) {
    return jsonResponse({ error: "No vault address configured" }, 500);
  }

  // Fetch on-chain USDC balance
  const onchainBalance = await getOnchainUsdcBalance(vaultAddress);

  // Calculate total user TCT
  const { data: balances, error: balanceError } = await supabase
    .from("balances")
    .select("available_tct, locked_tct");

  if (balanceError) {
    return jsonResponse({ error: "Failed to fetch user balances" }, 500);
  }

  let totalUserTct = 0;
  for (const balance of balances || []) {
    totalUserTct += Number(balance.available_tct || 0);
    totalUserTct += Number(balance.locked_tct || 0);
  }

  // Calculate expected USDC using DB-driven sell rate
  const { data: tctRates } = await supabase.rpc("get_tct_rates");
  const tctSellRate = Number(tctRates?.tct_sell_rate ?? 25);
  const expectedUsdc = totalUserTct / tctSellRate;

  // Get platform commission
  const { data: vault } = await supabase
    .from("platform_vault")
    .select("total_commission_tct")
    .eq("status", "active")
    .single();

  const commissionTct = Number(vault?.total_commission_tct || 0);
  const commissionUsdc = commissionTct / 25;

  // Total expected = user balances + commission
  const totalExpectedUsdc = expectedUsdc + commissionUsdc;

  // Calculate discrepancy
  const discrepancy = onchainBalance - totalExpectedUsdc;
  const isReconciled = Math.abs(discrepancy) <= DISCREPANCY_THRESHOLD;

  // Update vault state
  await supabase
    .from("platform_vault")
    .update({
      onchain_usdc_balance: Math.floor(onchainBalance * Math.pow(10, USDC_DECIMALS)),
      last_verified_block: await getCurrentBlockNumber(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "active");

  // Record reconciliation snapshot
  const { error: insertError } = await supabase
    .from("vault_reconciliation")
    .upsert({
      snapshot_date: today,
      onchain_usdc_balance: onchainBalance,
      total_user_tct: totalUserTct,
      expected_usdc: expectedUsdc,
      platform_commission_tct: commissionTct,
      discrepancy_usdc: discrepancy,
      is_reconciled: isReconciled,
      notes: isReconciled
        ? "Vault is solvent"
        : `Discrepancy of ${discrepancy.toFixed(6)} USDC detected`,
    });

  if (insertError) {
    console.error("Failed to record reconciliation:", insertError);
  }

  const result = {
    date: today,
    vaultAddress,
    onchainUsdcBalance: onchainBalance,
    totalUserTct,
    expectedUsdc,
    commissionTct,
    commissionUsdc,
    totalExpectedUsdc,
    discrepancy,
    isReconciled,
    status: isReconciled ? "HEALTHY" : "DISCREPANCY_DETECTED",
  };

  // Alert if discrepancy detected
  if (!isReconciled) {
    console.error("VAULT DISCREPANCY DETECTED:", result);
    // In production, send alert to admin
  }

  return jsonResponse(result);
}

// ============================================================================
// Verify Vault Balance (Quick Check)
// ============================================================================

async function verifyVaultBalance(supabase: any): Promise<Response> {
  // Get vault address
  const { data: vaultAddress } = await supabase.rpc("get_vault_address");

  if (!vaultAddress) {
    return jsonResponse({ error: "No vault address configured" }, 500);
  }

  // Fetch on-chain balance
  const onchainBalance = await getOnchainUsdcBalance(vaultAddress);

  // Get expected from vault state
  const { data: vault } = await supabase
    .from("platform_vault")
    .select("total_usdc_value, total_tct_issued, total_commission_tct")
    .eq("status", "active")
    .single();

  if (!vault) {
    return jsonResponse({ error: "Vault not found" }, 500);
  }

  const totalTct = Number(vault.total_tct_issued || 0);
  const expectedUsdc = totalTct / 25;
  const discrepancy = onchainBalance - expectedUsdc;

  return jsonResponse({
    vaultAddress,
    onchainUsdcBalance: onchainBalance,
    trackedTctIssued: totalTct,
    expectedUsdc,
    discrepancy,
    isHealthy: Math.abs(discrepancy) <= DISCREPANCY_THRESHOLD,
  });
}

// ============================================================================
// Get Reconciliation History
// ============================================================================

async function getReconciliationHistory(supabase: any): Promise<Response> {
  const { data, error } = await supabase
    .from("vault_reconciliation")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .limit(30);

  if (error) {
    return jsonResponse({ error: "Failed to fetch history" }, 500);
  }

  return jsonResponse({
    history: data || [],
    summary: {
      totalDays: data?.length || 0,
      healthyDays: data?.filter((d: any) => d.is_reconciled).length || 0,
      lastReconciled: data?.[0]?.snapshot_date || null,
      lastDiscrepancy: data?.[0]?.discrepancy_usdc || 0,
    },
  });
}

// ============================================================================
// Blockchain Helpers
// ============================================================================

async function getOnchainUsdcBalance(address: string): Promise<number> {
  // Call balanceOf on USDC contract
  const data = encodeBalanceOfCall(address);

  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [
        {
          to: USDC_CONTRACT_ADDRESS,
          data,
        },
        "latest",
      ],
      id: 1,
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`Failed to fetch balance: ${result.error.message}`);
  }

  // Decode result (uint256)
  const balanceWei = BigInt(result.result);
  return Number(balanceWei) / Math.pow(10, USDC_DECIMALS);
}

function encodeBalanceOfCall(address: string): string {
  // balanceOf(address) = 0x70a08231 + padded address
  const selector = "0x70a08231";
  const paddedAddress = address.slice(2).toLowerCase().padStart(64, "0");
  return selector + paddedAddress;
}

async function getCurrentBlockNumber(): Promise<number> {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
  });

  const data = await response.json();
  return parseInt(data.result, 16);
}

// ============================================================================
// Response Helper
// ============================================================================

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
