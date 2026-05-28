/**
 * Process Reward Payout Edge Function
 *
 * Processes pending reward_payouts by sending USDC on-chain from
 * the platform vault wallet to the user's embedded wallet.
 *
 * Can be invoked:
 * - Via cron (pg_cron) to process all pending payouts
 * - Via direct POST with a specific payout_id
 * - Via database trigger after claim_dragon_reward
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAULT_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const RPC_URL = Deno.env.get("POLYGON_RPC_URL") || "https://rpc-amoy.polygon.technology";
const USDC_CONTRACT = Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
const CHAIN_ID = parseInt(Deno.env.get("CHAIN_ID") || "80002");

// ERC20 transfer function selector
const TRANSFER_SELECTOR = "0xa9059cbb";
const USDC_DECIMALS = 6;

interface PayoutRecord {
  id: string;
  user_id: string;
  reward_id: string;
  amount_tct: number;
  amount_usdc: number;
  destination_address: string;
  status: string;
  chain_id: number;
}

interface ProcessResult {
  payoutId: string;
  success: boolean;
  txHash?: string;
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

// Helper: Simple keccak256 and signing (uses ethers via esm.sh)
async function signAndSendTransaction(
  to: string,
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

// Process a single payout
async function processPayout(
  supabase: ReturnType<typeof createAdminClient>,
  payout: PayoutRecord,
): Promise<ProcessResult> {
  const { id, destination_address, amount_usdc } = payout;

  console.log(`[process-reward-payout] Processing payout ${id}: ${amount_usdc} USDC to ${destination_address}`);

  // Mark as processing
  await supabase
    .from("reward_payouts")
    .update({ status: "processing", processed_at: new Date().toISOString() })
    .eq("id", id);

  try {
    let txHash: string;

    if (VAULT_PRIVATE_KEY) {
      // Build and send the USDC transfer transaction
      const callData = encodeTransferData(destination_address, amount_usdc);
      txHash = await signAndSendTransaction(destination_address, callData, VAULT_PRIVATE_KEY);

      console.log(`[process-reward-payout] Transaction sent: ${txHash}`);
    } else {
      // No private key configured - simulate for dev/testnet
      txHash = `0xreward_${Date.now().toString(16)}_${id.slice(0, 8)}`;
      console.log(`[process-reward-payout] Simulated tx (no VAULT_PRIVATE_KEY): ${txHash}`);
    }

    // Mark as completed
    await supabase
      .from("reward_payouts")
      .update({
        status: "completed",
        tx_hash: txHash,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return { payoutId: id, success: true, txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process-reward-payout] Failed payout ${id}:`, errorMessage);

    // Mark as failed
    await supabase
      .from("reward_payouts")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", id);

    return { payoutId: id, success: false, error: errorMessage };
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

  try {
    const supabase = createAdminClient();

    // Check if a specific payout_id was provided
    let payoutIds: string[] = [];
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.payout_id) {
          payoutIds = [body.payout_id];
        } else if (body.payout_ids) {
          payoutIds = body.payout_ids;
        }
      } catch {
        // No body or invalid JSON - process all pending
      }
    }

    // Fetch pending payouts
    let query = supabase
      .from("reward_payouts")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20); // Process max 20 at a time

    if (payoutIds.length > 0) {
      query = supabase
        .from("reward_payouts")
        .select("*")
        .in("id", payoutIds)
        .eq("status", "pending");
    }

    const { data: payouts, error: fetchError } = await query;

    if (fetchError) {
      console.error("[process-reward-payout] Failed to fetch payouts:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch pending payouts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!payouts || payouts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending payouts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[process-reward-payout] Found ${payouts.length} pending payouts`);

    // Process each payout
    const results: ProcessResult[] = [];
    for (const payout of payouts) {
      const result = await processPayout(supabase, payout as PayoutRecord);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[process-reward-payout] Unhandled error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
