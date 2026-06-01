/**
 * House Challenge Entry Fee Collection (Gasless)
 *
 * Collects entry fees using EIP-2612 permit - user signs, platform pays gas.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers, Wallet, Contract, parseUnits, formatUnits } from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USDC_ABI = [
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY");
    const USDC_CONTRACT = Deno.env.get("USDC_CONTRACT_ADDRESS") || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: VAULT_ADDRESS, error: vaultErr } = await supabaseAdmin.rpc("get_vault_address");
    if (vaultErr || !VAULT_ADDRESS) throw new Error("No vault address configured");
    const RPC_URL = Deno.env.get("BASE_RPC_URL") || "https://mainnet.base.org";

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    // Parse request
    const { userAddress, amountUsdc, challengeId, permit } = await req.json();
    console.log("[house-entry-fee] Request:", { userAddress, amountUsdc, challengeId });

    if (!userAddress || !amountUsdc || !challengeId || !permit) {
      throw new Error("Missing required fields");
    }

    // Verify userAddress belongs to the authenticated user
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .eq("id", userId)
      .single();

    if (!profile?.wallet_address ||
        profile.wallet_address.toLowerCase() !== userAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: false, error: "Wallet address does not match authenticated user" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      // Demo mode
      return new Response(JSON.stringify({ success: true, txHash: `demo_${Date.now()}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);
    const usdc = new Contract(USDC_CONTRACT, USDC_ABI, signer);

    const amount = parseUnits(amountUsdc, 6);

    // Check balance
    const balance = await usdc.balanceOf(userAddress);
    if (balance < amount) {
      throw new Error(`Insufficient balance: have ${formatUnits(balance, 6)}, need ${amountUsdc}`);
    }

    // Execute permit
    console.log("[house-entry-fee] Executing permit...");
    const permitTx = await usdc.permit(
      userAddress, signer.address, amount, permit.deadline, permit.v, permit.r, permit.s
    );
    await permitTx.wait();

    // Transfer to vault
    console.log("[house-entry-fee] Transferring to vault...");
    const transferTx = await usdc.transferFrom(userAddress, VAULT_ADDRESS, amount);
    const receipt = await transferTx.wait();

    console.log("[house-entry-fee] Done:", transferTx.hash);

    // Log it
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    await supabase.from("admin_logs").insert({
      action: "house_entry_fee_collected",
      admin_id: userId,
      target_id: challengeId,
      details: { userAddress, amountUsdc, txHash: transferTx.hash, vault: VAULT_ADDRESS },
    });

    return new Response(JSON.stringify({ success: true, txHash: transferTx.hash, blockNumber: receipt.blockNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[house-entry-fee] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
