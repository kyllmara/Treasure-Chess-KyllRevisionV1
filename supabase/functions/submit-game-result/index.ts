/**
 * Submit Game Result Edge Function
 *
 * Called when a game ends to:
 * 1. Verify the game result is valid
 * 2. Sign the result with backend signer key
 * 3. Submit to the smart contract to release escrow
 *
 * This is the ONLY way game results get submitted on-chain.
 * The backend signer private key is stored securely in Supabase secrets.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ethers,
  Wallet,
  Contract,
  JsonRpcProvider,
  keccak256,
  solidityPacked,
  getBytes,
} from "https://esm.sh/ethers@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Contract ABI for submitting results (V2 with security fixes)
const ESCROW_ABI = [
  "function submitResult(bytes32 gameId, uint8 result, bytes signature)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
  "function getGameNonce(bytes32 gameId) view returns (uint256)",
];

// Game result enum (matches contract)
enum GameResult {
  None = 0,
  Player1Wins = 1,
  Player2Wins = 2,
  Draw = 3,
}

interface SubmitResultRequest {
  gameId: string; // Off-chain game ID (UUID)
  onChainGameId: string; // bytes32 game ID used on-chain
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BACKEND_SIGNER_PRIVATE_KEY = Deno.env.get("BACKEND_SIGNER_PRIVATE_KEY");
    const ESCROW_CONTRACT_ADDRESS = Deno.env.get("ESCROW_CONTRACT_ADDRESS");
    const POLYGON_RPC_URL = Deno.env.get("POLYGON_RPC_URL") || "https://polygon-rpc.com";
    const CHAIN_ID = parseInt(Deno.env.get("CHAIN_ID") || "137");
    const SETTLEMENT_API_KEY = Deno.env.get("SETTLEMENT_API_KEY");

    // =========================================================================
    // CRITICAL SECURITY CHECK: Verify caller is authorized
    // =========================================================================
    // This function MUST only be called by:
    // 1. The game-complete edge function (via service_role)
    // 2. Internal backend processes with the settlement API key
    //
    // NEVER allow direct user calls - users could submit false results!
    // =========================================================================

    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("X-Settlement-API-Key");

    console.log("[submit-game-result] Auth check starting...");
    console.log("[submit-game-result] Has auth header:", !!authHeader);
    console.log("[submit-game-result] Has API key header:", !!apiKeyHeader);

    // Check for service_role JWT (from game-complete function or direct calls)
    let isServiceRole = false;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      console.log("[submit-game-result] Token length:", token.length);
      console.log("[submit-game-result] Service key length:", SUPABASE_SERVICE_KEY?.length);

      // Check if token matches service role key directly
      if (token === SUPABASE_SERVICE_KEY) {
        console.log("[submit-game-result] Direct service key match");
        isServiceRole = true;
      } else {
        // Decode JWT to check role (service_role has special permissions)
        try {
          // Check if it looks like a JWT (has 3 parts)
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            console.log("[submit-game-result] JWT role:", payload.role);
            if (payload.role === 'service_role') {
              isServiceRole = true;
            }
          } else {
            console.log("[submit-game-result] Token is not a JWT (parts:", parts.length, ")");
          }
        } catch (e) {
          console.log("[submit-game-result] JWT decode error:", e);
        }
      }
    }

    // Check for settlement API key (for internal backend calls)
    const hasValidApiKey = SETTLEMENT_API_KEY && apiKeyHeader === SETTLEMENT_API_KEY;
    console.log("[submit-game-result] isServiceRole:", isServiceRole, "hasValidApiKey:", hasValidApiKey);

    if (!isServiceRole && !hasValidApiKey) {
      console.error("[submit-game-result] Unauthorized access attempt");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized - this endpoint is for internal use only",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!BACKEND_SIGNER_PRIVATE_KEY) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY not configured");
    }

    if (!ESCROW_CONTRACT_ADDRESS) {
      throw new Error("ESCROW_CONTRACT_ADDRESS not configured");
    }

    // Parse request
    const { gameId, onChainGameId } = (await req.json()) as SubmitResultRequest;

    if (!gameId || !onChainGameId) {
      throw new Error("Missing gameId or onChainGameId");
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch game from database
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select(`
        id,
        white_player_id,
        black_player_id,
        result,
        status,
        end_reason,
        wager_tct,
        on_chain_game_id,
        on_chain_settled
      `)
      .eq("id", gameId)
      .single();

    if (gameError || !game) {
      throw new Error(`Game not found: ${gameId}`);
    }

    // Verify game has a result (can be settled) - status might still be "active" due to race condition
    // but if we have a valid result (white_wins, black_wins, draw), we can proceed
    if (!game.result || !["white_wins", "black_wins", "draw"].includes(game.result)) {
      throw new Error(`Game has no valid result: ${game.result}, status: ${game.status}`);
    }

    if (game.on_chain_settled) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Game already settled on-chain",
          alreadySettled: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize ethers provider and signer
    const provider = new JsonRpcProvider(POLYGON_RPC_URL);
    const signer = new Wallet(BACKEND_SIGNER_PRIVATE_KEY, provider);

    // Initialize contract
    const escrowContract = new Contract(
      ESCROW_CONTRACT_ADDRESS,
      ESCROW_ABI,
      signer
    );

    // Verify game exists on-chain and is active BEFORE determining result
    const onChainGame = await escrowContract.getGame(onChainGameId);
    const gameStatus = Number(onChainGame.status);

    // =========================================================================
    // CRITICAL FIX: Determine winner by wallet address, NOT by color
    // =========================================================================
    // The on-chain escrow has player1 and player2 addresses.
    // These do NOT necessarily correspond to white and black.
    // We need to:
    // 1. Get the winner's wallet address from the profiles table
    // 2. Compare it to on-chain player1 and player2
    // 3. Set Player1Wins or Player2Wins based on the match
    // =========================================================================

    let contractResult: GameResult;

    if (game.result === "draw") {
      contractResult = GameResult.Draw;
    } else {
      // Determine winner ID
      const winnerId = game.result === "white_wins" ? game.white_player_id : game.black_player_id;

      // Get winner's wallet address from profiles
      const { data: winnerProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, embedded_wallet_address")
        .eq("id", winnerId)
        .single();

      if (profileError || !winnerProfile?.embedded_wallet_address) {
        throw new Error(`Could not get winner wallet address for user ${winnerId}`);
      }

      const winnerWallet = winnerProfile.embedded_wallet_address.toLowerCase();
      const player1Wallet = onChainGame.player1.toLowerCase();
      const player2Wallet = onChainGame.player2.toLowerCase();

      console.log(`[submit-game-result] Winner determination:`);
      console.log(`  DB result: ${game.result}`);
      console.log(`  Winner profile: ${winnerProfile.username} (${winnerId})`);
      console.log(`  Winner wallet: ${winnerWallet}`);
      console.log(`  On-chain Player 1: ${player1Wallet}`);
      console.log(`  On-chain Player 2: ${player2Wallet}`);

      if (winnerWallet === player1Wallet) {
        contractResult = GameResult.Player1Wins;
        console.log(`  -> Winner is Player 1`);
      } else if (winnerWallet === player2Wallet) {
        contractResult = GameResult.Player2Wins;
        console.log(`  -> Winner is Player 2`);
      } else {
        throw new Error(`Winner wallet ${winnerWallet} does not match any on-chain player!`);
      }
    }

    // Create signature for the result
    const messageHash = keccak256(
      solidityPacked(
        ["bytes32", "uint8", "uint256", "address"],
        [onChainGameId, contractResult, CHAIN_ID, ESCROW_CONTRACT_ADDRESS]
      )
    );

    const signature = await signer.signMessage(getBytes(messageHash));

    console.log(`[submit-game-result] On-chain game status: ${gameStatus} (raw: ${onChainGame.status})`);

    if (gameStatus !== 2) {
      // 2 = Active
      throw new Error(`On-chain game not active: status ${gameStatus}`);
    }

    // =========================================================================
    // CRITICAL: Verify the database on_chain_game_id matches what we're settling
    // =========================================================================
    // This prevents an attacker from modifying on_chain_game_id in the database
    // to point to a different escrow with more funds
    // =========================================================================
    if (game.on_chain_game_id !== onChainGameId) {
      console.error(`[submit-game-result] Game ID mismatch! DB: ${game.on_chain_game_id}, Request: ${onChainGameId}`);
      throw new Error("Game ID mismatch - potential tampering detected");
    }

    // Verify the wager amounts match (additional protection)
    // Convert USDC from contract (6 decimals) to TCT for comparison
    const onChainWagerUsdc = Number(onChainGame.wagerAmount) / 1e6;
    const expectedWagerTct = onChainWagerUsdc * 25; // 25 TCT = 1 USDC

    // Allow 1% tolerance for rounding
    const wagerDiff = Math.abs(expectedWagerTct - game.wager_tct) / game.wager_tct;
    if (wagerDiff > 0.01) {
      console.error(`[submit-game-result] Wager mismatch! On-chain: ${onChainWagerUsdc} USDC (${expectedWagerTct} TCT), DB: ${game.wager_tct} TCT`);
      throw new Error("Wager amount mismatch - potential tampering detected");
    }

    // Submit result to contract
    console.log(`Submitting result for game ${gameId}:`, {
      onChainGameId,
      result: contractResult,
      resultName: GameResult[contractResult],
    });

    const tx = await escrowContract.submitResult(
      onChainGameId,
      contractResult,
      signature
    );

    console.log(`Transaction submitted: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Update database to mark as settled AND ensure status is completed
    // This is a safety net - if the game was somehow settled while still "active",
    // we ensure the status is updated to "completed" so it doesn't show in active games
    const { error: updateError } = await supabase
      .from("games")
      .update({
        on_chain_settled: true,
        on_chain_tx_hash: receipt.hash,
        on_chain_settled_at: new Date().toISOString(),
        status: "completed", // Ensure status is completed when escrow is settled
        ended_at: new Date().toISOString(),
      })
      .eq("id", gameId);

    if (updateError) {
      console.error("Failed to update game:", updateError);
      // Don't throw - the on-chain settlement succeeded
    }

    // Log the settlement
    await supabase.from("settlement_logs").insert({
      game_id: gameId,
      on_chain_game_id: onChainGameId,
      result: game.result,
      contract_result: contractResult,
      tx_hash: receipt.hash,
      block_number: receipt.blockNumber,
      gas_used: receipt.gasUsed?.toString(),
    });

    // Update balances table to reflect the on-chain settlement
    // This updates the TCT earnings that are displayed in the app
    console.log("[submit-game-result] Updating balances table...");
    try {
      const wagerTct = game.wager_tct || 0;
      const totalPotTct = wagerTct * 2;
      const rakePercentage = 0.10; // 10% platform rake
      const winnerPayoutTct = Math.floor(totalPotTct * (1 - rakePercentage));

      // Determine winner and loser based on result
      let winnerId: string | null = null;
      let loserId: string | null = null;

      if (game.result === "white_wins") {
        winnerId = game.white_player_id;
        loserId = game.black_player_id;
      } else if (game.result === "black_wins") {
        winnerId = game.black_player_id;
        loserId = game.white_player_id;
      }
      // For draws, both players get refunded (no winner/loser)

      if (winnerId && loserId && wagerTct > 0) {
        // Update winner's balance - they gain the winnings (pot minus rake minus their own wager)
        const netWinnings = winnerPayoutTct - wagerTct;
        console.log(`[submit-game-result] Winner ${winnerId} net winnings: ${netWinnings} TCT`);

        // Update winner: increase total_won_tct
        const { error: winnerError } = await supabase.rpc("increment_balance_field", {
          p_user_id: winnerId,
          p_field: "total_won_tct",
          p_amount: winnerPayoutTct,
        });

        if (winnerError) {
          console.error("[submit-game-result] Failed to update winner balance:", winnerError);
          // Try direct update as fallback
          await supabase
            .from("balances")
            .upsert({
              user_id: winnerId,
              total_won_tct: winnerPayoutTct,
            }, { onConflict: "user_id" });
        }

        // Update loser: increase total_lost_tct
        const { error: loserError } = await supabase.rpc("increment_balance_field", {
          p_user_id: loserId,
          p_field: "total_lost_tct",
          p_amount: wagerTct,
        });

        if (loserError) {
          console.error("[submit-game-result] Failed to update loser balance:", loserError);
          // Try direct update as fallback
          await supabase
            .from("balances")
            .upsert({
              user_id: loserId,
              total_lost_tct: wagerTct,
            }, { onConflict: "user_id" });
        }

        console.log("[submit-game-result] Balances updated successfully");
      } else if (game.result === "draw" && wagerTct > 0) {
        console.log("[submit-game-result] Draw - no balance changes needed (players get refunded on-chain)");
      }
    } catch (balanceError) {
      console.error("[submit-game-result] Error updating balances:", balanceError);
      // Don't fail the request - on-chain settlement was successful
    }

    return new Response(
      JSON.stringify({
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        result: GameResult[contractResult],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error submitting game result:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
