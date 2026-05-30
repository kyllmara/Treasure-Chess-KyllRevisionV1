/**
 * USDC Deposit Monitor Edge Function
 *
 * This function monitors the Base L2 blockchain for USDC deposits to the platform vault.
 * Platform Custody Model: Users send USDC to the platform vault address, and we credit
 * their TCT balance in the database.
 *
 * It can be called in two modes:
 * 1. Webhook mode: Receives deposit notifications from an indexer service
 * 2. Poll mode: Called periodically to check for new deposits to the vault
 *
 * When a deposit is detected:
 * 1. Creates a pending_deposit record
 * 2. Monitors confirmations until threshold is met
 * 3. Credits TCT to user balance via record_vault_deposit (1 USDC = 25 TCT)
 * 4. Updates vault totals
 * 5. Sends push notification
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Constants
// ============================================================================

const USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
const USDC_DECIMALS = 6;
const REQUIRED_CONFIRMATIONS = 12;
const BASE_RPC_URL = "https://mainnet.base.org";

// ERC20 Transfer event topic
const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ============================================================================
// Types
// ============================================================================

interface DepositWebhookPayload {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: string; // Amount in wei/smallest unit
  blockNumber: number;
  confirmations: number;
}

interface PollModePayload {
  walletAddresses?: string[];
  fromBlock?: number;
  toBlock?: number;
}

interface PendingDeposit {
  id: string;
  user_id: string;
  wallet_address: string;
  tx_hash: string;
  amount_usdc: number;
  amount_tct: number;
  block_number: number;
  confirmations: number;
  required_confirmations: number;
  status: "pending" | "confirming" | "confirmed" | "failed";
  created_at: string;
  confirmed_at: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseUsdcAmount(amountWei: string): number {
  // USDC has 6 decimals
  const amount = BigInt(amountWei);
  return Number(amount) / Math.pow(10, USDC_DECIMALS);
}

function usdcToTct(usdcAmount: number, rate: number): number {
  return Math.floor(usdcAmount * rate);
}

async function getTctBuyRate(supabase: any): Promise<number> {
  const { data } = await supabase.rpc("get_tct_rates");
  return Number(data?.tct_buy_rate ?? 25);
}

async function getBlockNumber(): Promise<number> {
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

async function getTransactionReceipt(txHash: string): Promise<any> {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [txHash],
      id: 1,
    }),
  });

  const data = await response.json();
  return data.result;
}

async function getUsdcTransferLogs(
  fromBlock: number,
  toBlock: number,
  toAddresses: string[]
): Promise<any[]> {
  // Pad addresses to 32 bytes for topic matching
  const paddedAddresses = toAddresses.map(
    (addr) => "0x" + addr.slice(2).toLowerCase().padStart(64, "0")
  );

  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [
        {
          address: USDC_CONTRACT_ADDRESS,
          topics: [
            TRANSFER_EVENT_TOPIC,
            null, // from (any)
            paddedAddresses.length === 1 ? paddedAddresses[0] : paddedAddresses, // to
          ],
          fromBlock: "0x" + fromBlock.toString(16),
          toBlock: "0x" + toBlock.toString(16),
        },
      ],
      id: 1,
    }),
  });

  const data = await response.json();
  return data.result || [];
}

function decodeTransferLog(log: any): {
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
} {
  const from = "0x" + log.topics[1].slice(26);
  const to = "0x" + log.topics[2].slice(26);
  const amount = BigInt(log.data).toString();

  return {
    from,
    to,
    amount,
    txHash: log.transactionHash,
    blockNumber: parseInt(log.blockNumber, 16),
  };
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Auth: only service-role or cron secret are accepted — no public access
    const authHeader = req.headers.get("Authorization");
    const cronHeader = req.headers.get("X-Cron-Secret");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authorized =
      authHeader === `Bearer ${supabaseServiceKey}` ||
      (!!cronSecret && cronHeader === cronSecret);
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    // Determine mode based on payload
    if (body.txHash) {
      // Webhook mode - single deposit notification
      return await handleWebhookDeposit(supabase, body as DepositWebhookPayload);
    } else if (body.mode === "poll") {
      // Poll mode - check for new deposits
      return await handlePollMode(supabase, body as PollModePayload);
    } else if (body.mode === "update-confirmations") {
      // Update confirmation counts for pending deposits
      return await updateConfirmations(supabase);
    } else {
      return jsonResponse({ error: "Invalid request mode" }, 400);
    }
  } catch (error) {
    console.error("Deposit monitor error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// ============================================================================
// Webhook Mode Handler
// ============================================================================

async function handleWebhookDeposit(
  supabase: any,
  payload: DepositWebhookPayload
): Promise<Response> {
  const { txHash, toAddress, amount, blockNumber, confirmations } = payload;

  // Find user by wallet address
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, push_token")
    .or(`embedded_wallet_address.eq.${toAddress},smart_wallet_address.eq.${toAddress},external_wallet_address.eq.${toAddress}`)
    .single();

  if (profileError || !profile) {
    console.log("No user found for wallet:", toAddress);
    return jsonResponse({ error: "No user found for wallet address" }, 404);
  }

  const usdcAmount = parseUsdcAmount(amount);
  const buyRate = await getTctBuyRate(supabase);
  const tctAmount = usdcToTct(usdcAmount, buyRate);

  // Check if deposit already exists
  const { data: existing } = await supabase
    .from("pending_deposits")
    .select("id, status")
    .eq("tx_hash", txHash)
    .single();

  if (existing) {
    // Update confirmations if deposit exists
    if (existing.status === "pending" || existing.status === "confirming") {
      await updateDepositConfirmations(supabase, existing.id, confirmations, profile);
    }
    return jsonResponse({ success: true, action: "updated", depositId: existing.id });
  }

  // Create new pending deposit
  const { data: newDeposit, error: insertError } = await supabase
    .from("pending_deposits")
    .insert({
      user_id: profile.id,
      wallet_address: toAddress.toLowerCase(),
      tx_hash: txHash,
      amount_usdc: usdcAmount,
      amount_tct: tctAmount,
      block_number: blockNumber,
      confirmations,
      required_confirmations: REQUIRED_CONFIRMATIONS,
      status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "confirming",
    })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to create pending deposit:", insertError);
    return jsonResponse({ error: "Failed to create deposit record" }, 500);
  }

  // If already confirmed, credit balance immediately
  if (confirmations >= REQUIRED_CONFIRMATIONS) {
    await creditDeposit(supabase, newDeposit as PendingDeposit, profile);
  }

  return jsonResponse({
    success: true,
    action: "created",
    depositId: newDeposit.id,
    usdcAmount,
    tctAmount,
  });
}

// ============================================================================
// Poll Mode Handler
// ============================================================================

async function handlePollMode(
  supabase: any,
  payload: PollModePayload
): Promise<Response> {
  const currentBlock = await getBlockNumber();

  const { data: vaultAddress } = await supabase.rpc("get_vault_address");
  if (!vaultAddress) {
    return jsonResponse({ error: "No vault address configured" }, 500);
  }

  const buyRate = await getTctBuyRate(supabase);

  // Monitor only the vault address (platform custody model)
  const walletAddresses = [vaultAddress];

  // Get last checked block from database or use default
  const fromBlock = payload.fromBlock || currentBlock - 1000; // Last ~30 minutes
  const toBlock = payload.toBlock || currentBlock;

  // Fetch USDC transfer logs
  const logs = await getUsdcTransferLogs(fromBlock, toBlock, walletAddresses);

  let depositsFound = 0;
  const results = [];

  for (const log of logs) {
    const transfer = decodeTransferLog(log);
    const confirmations = currentBlock - transfer.blockNumber;

    // Check if deposit already exists
    const { data: existing } = await supabase
      .from("pending_deposits")
      .select("id")
      .eq("tx_hash", transfer.txHash)
      .single();

    if (!existing) {
      // Platform Custody Model: Find user by the sender address (from)
      // Users must have registered their wallet address to receive credit
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, push_token")
        .or(`embedded_wallet_address.ilike.${transfer.from},smart_wallet_address.ilike.${transfer.from},external_wallet_address.ilike.${transfer.from}`)
        .single();

      if (profile) {
        const usdcAmount = parseUsdcAmount(transfer.amount);
        const tctAmount = usdcToTct(usdcAmount, buyRate);

        // Create pending deposit
        const { data: newDeposit } = await supabase
          .from("pending_deposits")
          .insert({
            user_id: profile.id,
            wallet_address: transfer.from.toLowerCase(), // Store sender address
            tx_hash: transfer.txHash,
            amount_usdc: usdcAmount,
            amount_tct: tctAmount,
            block_number: transfer.blockNumber,
            confirmations,
            required_confirmations: REQUIRED_CONFIRMATIONS,
            status: confirmations >= REQUIRED_CONFIRMATIONS ? "confirmed" : "confirming",
          })
          .select()
          .single();

        if (newDeposit) {
          depositsFound++;
          results.push({
            txHash: transfer.txHash,
            usdcAmount,
            tctAmount,
            confirmations,
            fromAddress: transfer.from,
          });

          // Credit if already confirmed - use record_vault_deposit for proper tracking
          if (confirmations >= REQUIRED_CONFIRMATIONS) {
            await creditVaultDeposit(supabase, newDeposit as PendingDeposit, profile, transfer.from);
          }
        }
      } else {
        // Log unknown sender for manual review
        console.log("Deposit from unknown address:", transfer.from, "tx:", transfer.txHash);
      }
    }
  }

  return jsonResponse({
    success: true,
    depositsFound,
    results,
    blocksChecked: { from: fromBlock, to: toBlock },
  });
}

// ============================================================================
// Update Confirmations
// ============================================================================

async function updateConfirmations(supabase: any): Promise<Response> {
  const currentBlock = await getBlockNumber();

  // Get all pending/confirming deposits
  const { data: pendingDeposits, error } = await supabase
    .from("pending_deposits")
    .select("*, profiles!inner(id, username, push_token)")
    .in("status", ["pending", "confirming"]);

  if (error) {
    console.error("Failed to fetch pending deposits:", error);
    return jsonResponse({ error: "Failed to fetch pending deposits" }, 500);
  }

  let updated = 0;
  let confirmed = 0;

  for (const deposit of pendingDeposits || []) {
    const confirmations = currentBlock - deposit.block_number;

    if (confirmations !== deposit.confirmations) {
      await updateDepositConfirmations(
        supabase,
        deposit.id,
        confirmations,
        deposit.profiles
      );
      updated++;

      if (confirmations >= deposit.required_confirmations && deposit.status !== "confirmed") {
        confirmed++;
      }
    }
  }

  return jsonResponse({
    success: true,
    pendingDeposits: pendingDeposits?.length || 0,
    updated,
    confirmed,
    currentBlock,
  });
}

// ============================================================================
// Credit Vault Deposit (Platform Custody Model)
// ============================================================================

async function creditVaultDeposit(
  supabase: any,
  deposit: PendingDeposit,
  profile: { id: string; username: string; push_token: string | null },
  fromAddress: string
): Promise<void> {
  try {
    // Use the record_vault_deposit RPC for proper vault tracking
    const { error } = await supabase.rpc("record_vault_deposit", {
      p_user_id: profile.id,
      p_usdc_amount: deposit.amount_usdc,
      p_tct_amount: deposit.amount_tct,
      p_tx_hash: deposit.tx_hash,
      p_block_number: deposit.block_number,
      p_from_address: fromAddress,
    });

    if (error) {
      console.error("Failed to record vault deposit:", error);
      // Fall back to legacy credit method
      await creditDeposit(supabase, deposit, profile);
      return;
    }

    // Update deposit status
    await supabase
      .from("pending_deposits")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", deposit.id);

    // Send push notification if token available
    if (profile.push_token) {
      await sendPushNotification(
        profile.push_token,
        "Deposit Confirmed!",
        `${deposit.amount_tct} TCT has been credited to your account.`
      );
    }

    console.log(`Vault deposit: ${deposit.amount_tct} TCT credited to user ${profile.id}`);
  } catch (err) {
    console.error("Credit vault deposit error:", err);
    // Fall back to legacy method
    await creditDeposit(supabase, deposit, profile);
  }
}

// ============================================================================
// Credit Deposit to Balance (Legacy fallback)
// ============================================================================

async function creditDeposit(
  supabase: any,
  deposit: PendingDeposit,
  profile: { id: string; username: string; push_token: string | null }
): Promise<void> {
  // Get current balance
  const { data: balance, error: balanceError } = await supabase
    .from("balances")
    .select("*")
    .eq("user_id", profile.id)
    .single();

  if (balanceError && balanceError.code !== "PGRST116") {
    console.error("Failed to fetch balance:", balanceError);
    return;
  }

  const currentBalance = balance?.available_tct || 0;
  const newBalance = currentBalance + deposit.amount_tct;

  // Update or create balance
  if (balance) {
    await supabase
      .from("balances")
      .update({
        available_tct: newBalance,
        total_deposited_tct: (balance.total_deposited_tct || 0) + deposit.amount_tct,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", profile.id);
  } else {
    await supabase.from("balances").insert({
      user_id: profile.id,
      available_tct: deposit.amount_tct,
      total_deposited_tct: deposit.amount_tct,
    });
  }

  // Create transaction record
  await supabase.from("transactions").insert({
    user_id: profile.id,
    type: "deposit",
    amount_tct: deposit.amount_tct,
    tx_hash: deposit.tx_hash,
    balance_before_tct: currentBalance,
    balance_after_tct: newBalance,
    description: `USDC deposit: ${deposit.amount_usdc} USDC = ${deposit.amount_tct} TCT`,
  });

  // Update deposit status
  await supabase
    .from("pending_deposits")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", deposit.id);

  // Send push notification if token available
  if (profile.push_token) {
    await sendPushNotification(
      profile.push_token,
      "Deposit Confirmed!",
      `${deposit.amount_tct} TCT has been credited to your account.`
    );
  }

  console.log(`Credited ${deposit.amount_tct} TCT to user ${profile.id}`);
}

async function updateDepositConfirmations(
  supabase: any,
  depositId: string,
  confirmations: number,
  profile: { id: string; username: string; push_token: string | null }
): Promise<void> {
  const { data: deposit, error } = await supabase
    .from("pending_deposits")
    .select("*")
    .eq("id", depositId)
    .single();

  if (error || !deposit) return;

  const newStatus = confirmations >= deposit.required_confirmations ? "confirmed" : "confirming";

  await supabase
    .from("pending_deposits")
    .update({
      confirmations,
      status: newStatus,
    })
    .eq("id", depositId);

  // Credit if newly confirmed
  if (newStatus === "confirmed" && deposit.status !== "confirmed") {
    await creditDeposit(supabase, deposit as PendingDeposit, profile);
  }
}

// ============================================================================
// Push Notification
// ============================================================================

async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string
): Promise<void> {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        sound: "default",
        badge: 1,
        data: { type: "deposit_confirmed" },
      }),
    });
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
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
