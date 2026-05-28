/**
 * Emergency Refund Edge Function
 *
 * Refunds both players from an on-chain escrow that is stuck in Active status.
 * This is called automatically when off-chain game creation fails after
 * both players have already locked funds on-chain.
 *
 * Only the two players in the escrow can request a refund, and only
 * if the escrow is in Active (2) or WaitingForOpponent (1) status
 * with no corresponding completed off-chain game.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Wallet,
  Contract,
  JsonRpcProvider,
} from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ESCROW_ABI = [
  "function emergencyRefund(bytes32 gameId)",
  "function cancelGame(bytes32 gameId)",
  "function rescueGameFunds(bytes32 gameId, address recipient)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
];

// On-chain game status enum
enum GameStatus {
  None = 0,
  WaitingForOpponent = 1,
  Active = 2,
  Completed = 3,
  Cancelled = 4,
  Disputed = 5,
}

interface RefundRequest {
  onChainGameId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get(
      "BACKEND_SIGNER_PRIVATE_KEY"
    );
    const ESCROW_CONTRACT_ADDRESS = Deno.env.get("ESCROW_CONTRACT_ADDRESS");
    const BASE_RPC_URL =
      Deno.env.get("BASE_RPC_URL") ||
      "https://mainnet.base.org";

    if (!BACKEND_SIGNER_PRIVATE_KEY || !ESCROW_CONTRACT_ADDRESS) {
      throw new Error("Missing required environment variables");
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verify the user from the JWT
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user's wallet address
    const { data: profile } = await supabase
      .from("profiles")
      .select("embedded_wallet_address")
      .eq("id", user.id)
      .single();

    if (!profile?.embedded_wallet_address) {
      return new Response(
        JSON.stringify({ error: "No wallet address found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userWallet = profile.embedded_wallet_address.toLowerCase();

    // Parse request
    const { onChainGameId } = (await req.json()) as RefundRequest;

    if (!onChainGameId) {
      return new Response(
        JSON.stringify({ error: "Missing onChainGameId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[emergency-refund] Request from ${user.id} for game ${onChainGameId}`);

    // Initialize provider and contract
    const provider = new JsonRpcProvider(BASE_RPC_URL);
    const signer = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);
    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);

    // Get on-chain game state
    const game = await escrow.getGame(onChainGameId);
    const status = Number(game.status);

    console.log(`[emergency-refund] On-chain game status: ${status}, player1: ${game.player1}, player2: ${game.player2}`);

    // Verify the caller is one of the players
    const player1 = game.player1.toLowerCase();
    const player2 = game.player2.toLowerCase();

    if (userWallet !== player1 && userWallet !== player2) {
      return new Response(
        JSON.stringify({ error: "You are not a player in this game" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify there's no active/completed off-chain game for this escrow
    const { data: existingGame } = await supabase
      .from("games")
      .select("id, status")
      .eq("on_chain_game_id", onChainGameId)
      .in("status", ["active", "completed"])
      .limit(1);

    if (existingGame && existingGame.length > 0) {
      return new Response(
        JSON.stringify({
          error: "An active game exists for this escrow. Cannot refund.",
          gameId: existingGame[0].id,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle based on on-chain status
    let txHash: string;

    if (status === GameStatus.Active || status === GameStatus.Disputed) {
      // Both players locked — use emergencyRefund (refunds both)
      console.log(`[emergency-refund] Calling emergencyRefund for Active/Disputed game`);
      const tx = await escrow.emergencyRefund(onChainGameId);
      const receipt = await tx.wait();
      txHash = receipt.hash;
      console.log(`[emergency-refund] emergencyRefund confirmed: ${txHash}`);
    } else if (status === GameStatus.WaitingForOpponent) {
      // Only player1 locked — use rescueGameFunds
      console.log(`[emergency-refund] Calling rescueGameFunds for WaitingForOpponent game`);
      const tx = await escrow.rescueGameFunds(onChainGameId, game.player1);
      const receipt = await tx.wait();
      txHash = receipt.hash;
      console.log(`[emergency-refund] rescueGameFunds confirmed: ${txHash}`);
    } else if (status === GameStatus.Completed || status === GameStatus.Cancelled) {
      return new Response(
        JSON.stringify({
          error: "Game is already settled or cancelled",
          status: status === GameStatus.Completed ? "completed" : "cancelled",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "Game not found on-chain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel any play_now_queue entries tied to this escrow
    await supabase
      .from("play_now_queue")
      .update({ status: "cancelled" })
      .eq("on_chain_game_id", onChainGameId)
      .in("status", ["waiting", "matched"]);

    return new Response(
      JSON.stringify({
        success: true,
        txHash,
        message: "Funds refunded successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[emergency-refund] Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process refund",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
