/**
 * Withdrawal Processor Edge Function
 *
 * Processes pending withdrawal requests by sending USDC from the platform vault.
 * This function should be called periodically (e.g., every 5 minutes) via cron.
 *
 * Flow:
 * 1. Fetch pending withdrawal requests
 * 2. For each request:
 *    a. Mark as "processing"
 *    b. Send USDC transaction from vault to user's address
 *    c. Wait for confirmation
 *    d. Mark as "completed" or "failed"
 * 3. Update vault totals
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.9.0";

// ============================================================================
// Constants
// ============================================================================

const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const USDC_DECIMALS = 6;
const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_CHAIN_ID = 8453;

// Maximum withdrawals to process per invocation
const MAX_WITHDRAWALS_PER_RUN = 10;

// USDC ERC20 ABI (minimal for transfer)
const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

// ============================================================================
// Types
// ============================================================================

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount_tct: number;
  amount_usdc: number;
  to_address: string;
  status: string;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vaultPrivateKey = Deno.env.get("VAULT_PRIVATE_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate vault key is configured
    if (!vaultPrivateKey) {
      return jsonResponse({ error: "Vault private key not configured" }, 500);
    }

    // Only allow POST requests
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Parse request body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine
    }

    // Handle different modes
    if (body.mode === "status") {
      return await getProcessorStatus(supabase);
    } else if (body.mode === "retry") {
      return await retryFailedWithdrawal(supabase, body.requestId, vaultPrivateKey);
    } else {
      return await processWithdrawals(supabase, vaultPrivateKey);
    }
  } catch (error) {
    console.error("Withdrawal processor error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ============================================================================
// Process Pending Withdrawals
// ============================================================================

async function processWithdrawals(
  supabase: any,
  vaultPrivateKey: string
): Promise<Response> {
  // Get pending withdrawal requests
  const { data: pendingRequests, error: fetchError } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_WITHDRAWALS_PER_RUN);

  if (fetchError) {
    console.error("Failed to fetch pending withdrawals:", fetchError);
    return jsonResponse({ error: "Failed to fetch pending withdrawals" }, 500);
  }

  if (!pendingRequests || pendingRequests.length === 0) {
    return jsonResponse({ success: true, message: "No pending withdrawals", processed: 0 });
  }

  // Set up provider and wallet
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID);
  const wallet = new ethers.Wallet(vaultPrivateKey, provider);
  const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);

  // Check vault USDC balance
  const vaultBalance = await usdcContract.balanceOf(wallet.address);
  const vaultBalanceUsdc = Number(vaultBalance) / Math.pow(10, USDC_DECIMALS);

  console.log(`Vault balance: ${vaultBalanceUsdc} USDC`);

  const results: any[] = [];
  let processed = 0;
  let successful = 0;
  let failed = 0;

  for (const request of pendingRequests as WithdrawalRequest[]) {
    try {
      // Mark as processing
      await supabase
        .from("withdrawal_requests")
        .update({ status: "processing", processed_at: new Date().toISOString() })
        .eq("id", request.id);

      // Check if we have enough balance
      if (request.amount_usdc > vaultBalanceUsdc) {
        console.error(`Insufficient vault balance for withdrawal ${request.id}`);
        await markWithdrawalFailed(
          supabase,
          request.id,
          "Insufficient vault balance - please try again later"
        );
        failed++;
        continue;
      }

      // Calculate amount in smallest units
      const amountWei = BigInt(Math.floor(request.amount_usdc * Math.pow(10, USDC_DECIMALS)));

      console.log(`Processing withdrawal ${request.id}: ${request.amount_usdc} USDC to ${request.to_address}`);

      // Send USDC transfer
      const tx = await usdcContract.transfer(request.to_address, amountWei);
      console.log(`Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        // Success - update withdrawal request
        const { error: completeError } = await supabase.rpc("complete_withdrawal", {
          p_request_id: request.id,
          p_tx_hash: tx.hash,
          p_success: true,
        });

        if (completeError) {
          console.error(`Failed to complete withdrawal ${request.id}:`, completeError);
        }

        successful++;
        results.push({
          id: request.id,
          status: "completed",
          txHash: tx.hash,
          amount: request.amount_usdc,
        });
      } else {
        // Transaction failed
        await markWithdrawalFailed(supabase, request.id, "Transaction reverted");
        failed++;
        results.push({
          id: request.id,
          status: "failed",
          error: "Transaction reverted",
        });
      }

      processed++;
    } catch (err: any) {
      console.error(`Error processing withdrawal ${request.id}:`, err);

      await markWithdrawalFailed(
        supabase,
        request.id,
        err.message || "Unknown error during withdrawal"
      );

      failed++;
      results.push({
        id: request.id,
        status: "failed",
        error: err.message,
      });

      processed++;
    }
  }

  return jsonResponse({
    success: true,
    processed,
    successful,
    failed,
    results,
    vaultBalance: vaultBalanceUsdc,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function markWithdrawalFailed(
  supabase: any,
  requestId: string,
  errorMessage: string
): Promise<void> {
  await supabase.rpc("complete_withdrawal", {
    p_request_id: requestId,
    p_tx_hash: null,
    p_success: false,
    p_error_message: errorMessage,
  });
}

async function retryFailedWithdrawal(
  supabase: any,
  requestId: string,
  vaultPrivateKey: string
): Promise<Response> {
  if (!requestId) {
    return jsonResponse({ error: "Request ID required" }, 400);
  }

  // Get the failed request
  const { data: request, error } = await supabase
    .from("withdrawal_requests")
    .select("*")
    .eq("id", requestId)
    .eq("status", "failed")
    .single();

  if (error || !request) {
    return jsonResponse({ error: "Failed withdrawal request not found" }, 404);
  }

  // Reset status to pending
  await supabase
    .from("withdrawal_requests")
    .update({ status: "pending", error_message: null })
    .eq("id", requestId);

  // Process immediately
  return await processWithdrawals(supabase, vaultPrivateKey);
}

async function getProcessorStatus(supabase: any): Promise<Response> {
  // Get counts by status
  const { data: pending } = await supabase
    .from("withdrawal_requests")
    .select("id", { count: "exact" })
    .eq("status", "pending");

  const { data: processing } = await supabase
    .from("withdrawal_requests")
    .select("id", { count: "exact" })
    .eq("status", "processing");

  const { data: completed } = await supabase
    .from("withdrawal_requests")
    .select("id", { count: "exact" })
    .eq("status", "completed");

  const { data: failed } = await supabase
    .from("withdrawal_requests")
    .select("id", { count: "exact" })
    .eq("status", "failed");

  // Get recent failed withdrawals
  const { data: recentFailed } = await supabase
    .from("withdrawal_requests")
    .select("id, amount_usdc, to_address, error_message, created_at")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(5);

  return jsonResponse({
    counts: {
      pending: pending?.length || 0,
      processing: processing?.length || 0,
      completed: completed?.length || 0,
      failed: failed?.length || 0,
    },
    recentFailed: recentFailed || [],
  });
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
