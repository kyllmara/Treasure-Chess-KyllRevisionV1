/**
 * Collect House Challenge Entry Fee
 *
 * Gasless entry fee collection using EIP-2612 permit.
 * User signs a permit, platform executes the transfer.
 *
 * Flow:
 * 1. User signs EIP-2612 permit allowing backend to spend their USDC
 * 2. This function calls USDC.permit() with user's signature
 * 3. This function calls USDC.transferFrom() to move funds to vault
 * 4. Returns success with tx hash
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers, Wallet, Contract, parseUnits } from "npm:ethers@6";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY") || "";
const ALCHEMY_API_KEY = Deno.env.get("ALCHEMY_API_KEY") || "";
const CHAIN_ID = parseInt(Deno.env.get("CHAIN_ID") || "80002");

// Contract addresses
const USDC_CONTRACT_ADDRESS = Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VAULT_ADDRESS = Deno.env.get("PLATFORM_VAULT_ADDRESS") || "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";

// USDC ABI for permit and transfer
const USDC_ABI = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
];

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CollectEntryFeeRequest {
  userAddress: string;
  amountUsdc: string;
  challengeId: string;
  attemptId?: string;
  permit: {
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    // Parse request
    const body: CollectEntryFeeRequest = await req.json();
    const { userAddress, amountUsdc, challengeId, attemptId, permit } = body;

    console.log("[collect-house-entry-fee] Request:", {
      userAddress,
      amountUsdc,
      challengeId,
      attemptId,
      permitDeadline: permit.deadline,
    });

    // Validate request
    if (!userAddress || !amountUsdc || !challengeId || !permit) {
      throw new Error("Missing required fields");
    }

    // Verify the user's wallet matches their profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", user.id)
      .single();

    if (!profile?.wallet_address ||
        profile.wallet_address.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("Wallet address mismatch");
    }

    // Check if backend signer is configured
    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      console.warn("[collect-house-entry-fee] No BACKEND_SIGNER_PRIVATE_KEY - demo mode");
      return new Response(
        JSON.stringify({
          success: true,
          txHash: `demo_${Date.now()}`,
          message: "Demo mode - no actual transfer",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set up provider and signer
    const rpcUrl = ALCHEMY_API_KEY
      ? `https://polygon-amoy.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
      : "https://polygon-amoy-bor-rpc.publicnode.com";

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);

    console.log("[collect-house-entry-fee] Backend signer:", await signer.getAddress());

    // Create USDC contract instance
    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, signer);

    // Parse amount (USDC has 6 decimals)
    const amount = parseUnits(amountUsdc, 6);

    // Check user's USDC balance
    const balance = await usdc.balanceOf(userAddress);
    if (balance < amount) {
      throw new Error(`Insufficient USDC balance: have ${ethers.formatUnits(balance, 6)}, need ${amountUsdc}`);
    }

    // Execute permit (allows backend signer to spend user's USDC)
    console.log("[collect-house-entry-fee] Executing permit...");
    const permitTx = await usdc.permit(
      userAddress,           // owner
      await signer.getAddress(), // spender (backend signer)
      amount,                // value
      permit.deadline,       // deadline
      permit.v,              // v
      permit.r,              // r
      permit.s               // s
    );
    await permitTx.wait();
    console.log("[collect-house-entry-fee] Permit executed:", permitTx.hash);

    // Execute transfer from user to vault
    console.log("[collect-house-entry-fee] Executing transfer to vault...");
    const transferTx = await usdc.transferFrom(
      userAddress,    // from
      VAULT_ADDRESS,  // to
      amount          // amount
    );
    const receipt = await transferTx.wait();
    console.log("[collect-house-entry-fee] Transfer complete:", transferTx.hash);

    // Log the collection in database
    await supabase.from("admin_logs").insert({
      action: "house_entry_fee_collected",
      admin_id: user.id, // User collecting their own fee
      target_id: challengeId,
      details: {
        userAddress,
        amountUsdc,
        challengeId,
        attemptId,
        permitTxHash: permitTx.hash,
        transferTxHash: transferTx.hash,
        vaultAddress: VAULT_ADDRESS,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        txHash: transferTx.hash,
        blockNumber: receipt.blockNumber,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[collect-house-entry-fee] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
