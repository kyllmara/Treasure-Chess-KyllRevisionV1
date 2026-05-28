/**
 * Process House Challenge Payout Edge Function
 *
 * Processes pending house challenge payouts by sending USDC on-chain from
 * the platform vault wallet to the user's embedded wallet.
 *
 * Invocation:
 * - Via cron (pg_cron) to process all pending payouts
 * - Via direct POST with a specific attempt_id
 * - Via database trigger after complete_house_challenge marks a win
 *
 * Payout calculation:
 * - Winner receives entry_fee_tct * prize_multiplier (typically 2x)
 * - No platform fee on wins (platform profits from losses)
 * - Converted from TCT to USDC: TCT / 25 = USDC
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAULT_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const RPC_URL = Deno.env.get("POLYGON_RPC_URL") || "https://rpc-amoy.polygon.technology";
const USDC_CONTRACT = Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
const CHAIN_ID = parseInt(Deno.env.get("CHAIN_ID") || "80002");

// Conversion rate: 25 TCT = 1 USDC
const TCT_TO_USDC_RATE = 25;

// ERC20 transfer function selector
const TRANSFER_SELECTOR = "0xa9059cbb";
const USDC_DECIMALS = 6;

interface HouseChallengeAttemptRecord {
  id: string;
  user_id: string;
  challenge_id: string;
  payout_amount_tct: number;
  payout_status: string;
  status: string;
}

interface UserProfileRecord {
  embedded_wallet_address: string | null;
  smart_wallet_address: string | null;
}

interface ProcessResult {
  attemptId: string;
  success: boolean;
  txHash?: string;
  usdcAmount?: number;
  error?: string;
}

// Helper: Create Supabase admin client
function createAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Helper: Convert TCT to USDC
function tctToUsdc(tctAmount: number): number {
  return tctAmount / TCT_TO_USDC_RATE;
}

// Helper: Encode ERC20 transfer call data
function encodeTransferData(toAddress: string, amountUsdc: number): string {
  const amountWei = BigInt(Math.floor(amountUsdc * 10 ** USDC_DECIMALS));
  const paddedAddress = toAddress.toLowerCase().replace("0x", "").padStart(64, "0");
  const paddedAmount = amountWei.toString(16).padStart(64, "0");
  return TRANSFER_SELECTOR + paddedAddress + paddedAmount;
}

// Helper: Get nonce for vault wallet
async function getNonce(address: string): Promise<string> {
  const resp = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionCount",
      params: [address, "latest"],
      id: 1,
    }),
  });
  const data = await resp.json();
  return data.result;
}

// Helper: Get gas price
async function getGasPrice(): Promise<string> {
  const resp = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_gasPrice",
      params: [],
      id: 1,
    }),
  });
  const data = await resp.json();
  return data.result;
}

// Helper: Send raw transaction
async function sendRawTransaction(signedTx: string): Promise<string> {
  const resp = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_sendRawTransaction",
      params: [signedTx],
      id: 1,
    }),
  });
  const data = await resp.json();
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message}`);
  }
  return data.result;
}

// Helper: Sign and send USDC transfer transaction
async function signAndSendTransaction(
  toAddress: string,
  data: string,
  privateKey: string,
): Promise<string> {
  // Dynamic import ethers for Deno
  const { ethers } = await import("https://esm.sh/ethers@6.16.0");

  const wallet = new ethers.Wallet(privateKey);
  const nonce = await getNonce(wallet.address);
  const gasPrice = await getGasPrice();

  const tx = {
    to: USDC_CONTRACT,
    data,
    nonce: parseInt(nonce, 16),
    gasLimit: 100000, // ERC20 transfer typically needs ~65k
    gasPrice: BigInt(gasPrice),
    chainId: CHAIN_ID,
    value: 0,
  };

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await sendRawTransaction(signedTx);

  return txHash;
}

// Process a single house challenge payout
async function processPayout(
  supabase: ReturnType<typeof createAdminClient>,
  attempt: HouseChallengeAttemptRecord,
): Promise<ProcessResult> {
  const { id, user_id, payout_amount_tct } = attempt;

  console.log(`[process-house-payout] Processing attempt ${id}: ${payout_amount_tct} TCT for user ${user_id}`);

  // Get user's wallet address from profiles table
  const { data: userProfile, error: profileError } = await supabase
    .from("profiles")
    .select("embedded_wallet_address, smart_wallet_address")
    .eq("id", user_id)
    .single();

  // Use smart wallet if available, otherwise embedded wallet
  const destinationAddress = userProfile?.smart_wallet_address || userProfile?.embedded_wallet_address;

  if (profileError || !destinationAddress) {
    console.error(`[process-house-payout] No wallet found for user ${user_id}:`, profileError);

    // Mark as failed - no wallet
    await supabase
      .from("house_challenge_attempts")
      .update({
        payout_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return { attemptId: id, success: false, error: "User has no wallet address" };
  }

  console.log(`[process-house-payout] Found wallet for user: ${destinationAddress}`);
  const usdcAmount = tctToUsdc(payout_amount_tct);

  console.log(`[process-house-payout] Sending ${usdcAmount} USDC to ${destinationAddress}`);

  // Mark as processing
  await supabase
    .from("house_challenge_attempts")
    .update({
      payout_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  try {
    let txHash: string;

    if (VAULT_PRIVATE_KEY) {
      // Build and send the USDC transfer transaction
      const callData = encodeTransferData(destinationAddress, usdcAmount);
      txHash = await signAndSendTransaction(destinationAddress, callData, VAULT_PRIVATE_KEY);

      console.log(`[process-house-payout] Transaction sent: ${txHash}`);
    } else {
      // No private key configured - simulate for dev/testnet
      txHash = `0xhouse_${Date.now().toString(16)}_${id.slice(0, 8)}`;
      console.log(`[process-house-payout] Simulated tx (no VAULT_PRIVATE_KEY): ${txHash}`);
    }

    // Mark as completed
    await supabase
      .from("house_challenge_attempts")
      .update({
        payout_status: "completed",
        payout_tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Log admin audit (if audit table exists)
    try {
      await supabase.from("admin_audit_log").insert({
        admin_id: "system",
        admin_username: "system",
        is_super_admin: false,
        action_type: "house_challenge_attempt_payout",
        action_severity: "medium",
        target_user_id: user_id,
        target_table: "house_challenge_attempts",
        target_record_id: id,
        old_values: { payout_status: "pending" },
        new_values: { payout_status: "completed", payout_tx_hash: txHash },
        reason: `House challenge payout: ${payout_amount_tct} TCT = ${usdcAmount} USDC`,
        was_2fa_verified: false,
      });
    } catch {
      // Audit logging is optional, don't fail the payout
    }

    return { attemptId: id, success: true, txHash, usdcAmount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process-house-payout] Failed attempt ${id}:`, errorMessage);

    // Mark as failed
    await supabase
      .from("house_challenge_attempts")
      .update({
        payout_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return { attemptId: id, success: false, error: errorMessage };
  }
}

// Main handler
Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[process-house-payout] Request received");

  try {
    const supabase = createAdminClient();
    console.log("[process-house-payout] Supabase client created");

    // Check if specific attempt_id(s) were provided
    let attemptIds: string[] = [];
    if (req.method === "POST") {
      try {
        const bodyText = await req.text();
        console.log("[process-house-payout] Request body:", bodyText);
        if (bodyText) {
          const body = JSON.parse(bodyText);
          if (body.attempt_id) {
            attemptIds = [body.attempt_id];
          } else if (body.attempt_ids) {
            attemptIds = body.attempt_ids;
          }
        }
      } catch (parseErr) {
        console.log("[process-house-payout] Body parse error (will process all pending):", parseErr);
        // No body or invalid JSON - process all pending
      }
    }

    console.log("[process-house-payout] Attempt IDs to process:", attemptIds);

    // Fetch pending payouts from house_challenge_attempts
    // Only attempts with status 'won' and payout_status 'pending'
    let query;
    if (attemptIds.length > 0) {
      // When specific IDs are provided, fetch those specific attempts
      query = supabase
        .from("house_challenge_attempts")
        .select("id, user_id, challenge_id, payout_amount_tct, payout_status, status")
        .in("id", attemptIds)
        .eq("status", "won")
        .eq("payout_status", "pending");
    } else {
      // Otherwise fetch all pending payouts
      query = supabase
        .from("house_challenge_attempts")
        .select("id, user_id, challenge_id, payout_amount_tct, payout_status, status")
        .eq("status", "won")
        .eq("payout_status", "pending")
        .not("payout_amount_tct", "is", null)
        .gt("payout_amount_tct", 0)
        .order("game_ended_at", { ascending: true })
        .limit(20);
    }

    const { data: attempts, error: fetchError } = await query;
    console.log("[process-house-payout] Query result:", { attempts, fetchError });

    if (fetchError) {
      console.error("[process-house-payout] Failed to fetch attempts:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch pending payouts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!attempts || attempts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending house challenge payouts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[process-house-payout] Found ${attempts.length} pending payouts`);

    // Process each payout sequentially to manage nonces properly
    const results: ProcessResult[] = [];
    for (const attempt of attempts) {
      const result = await processPayout(supabase, attempt as HouseChallengeAttemptRecord);
      results.push(result);

      // Small delay between transactions to avoid nonce issues
      if (VAULT_PRIVATE_KEY && results.length < attempts.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const totalUsdcPaid = results
      .filter((r) => r.success && r.usdcAmount)
      .reduce((sum, r) => sum + (r.usdcAmount || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        totalUsdcPaid,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[process-house-payout] Unhandled error:", errorMessage, errorStack);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
