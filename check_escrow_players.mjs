import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env file
const envContent = fs.readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  line = line.replace(/\r/g, '').trim();
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const supabase = createClient(
  envVars.EXPO_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://rpc-amoy.polygon.technology';

const ESCROW_ABI = [
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))"
];

async function check() {
  // Get game from DB
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', '1f64cea3-de1c-433b-b212-8211f9c9156e')
    .single();

  // Get profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, email, embedded_wallet_address')
    .in('id', [game.white_player_id, game.black_player_id]);

  const whiteProfile = profiles.find(p => p.id === game.white_player_id);
  const blackProfile = profiles.find(p => p.id === game.black_player_id);

  console.log('=== DATABASE GAME INFO ===');
  console.log('Game ID:', game.id);
  console.log('Result:', game.result, '(white_wins means WHITE won)');
  console.log('Winner ID:', game.winner_id);
  console.log('');
  console.log('WHITE Player (winner):');
  console.log('  Profile ID:', game.white_player_id);
  console.log('  Username:', whiteProfile?.username);
  console.log('  Email:', whiteProfile?.email);
  console.log('  Wallet:', whiteProfile?.embedded_wallet_address);
  console.log('');
  console.log('BLACK Player (loser):');
  console.log('  Profile ID:', game.black_player_id);
  console.log('  Username:', blackProfile?.username);
  console.log('  Email:', blackProfile?.email);
  console.log('  Wallet:', blackProfile?.embedded_wallet_address);

  // Check on-chain escrow
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, provider);

  console.log('\n=== ON-CHAIN ESCROW INFO ===');
  console.log('On-chain Game ID:', game.on_chain_game_id);

  const onChainGame = await escrow.getGame(game.on_chain_game_id);

  console.log('');
  console.log('Player 1 (on-chain):', onChainGame.player1);
  console.log('Player 2 (on-chain):', onChainGame.player2);
  console.log('On-chain Result:', ['None', 'Player1Wins', 'Player2Wins', 'Draw'][Number(onChainGame.result)]);

  // Cross-reference
  console.log('\n=== CROSS-REFERENCE ===');
  const p1Lower = onChainGame.player1.toLowerCase();
  const p2Lower = onChainGame.player2.toLowerCase();
  const whiteWallet = whiteProfile?.embedded_wallet_address?.toLowerCase();
  const blackWallet = blackProfile?.embedded_wallet_address?.toLowerCase();

  console.log('On-chain Player 1 (' + onChainGame.player1 + ') is:');
  if (p1Lower === whiteWallet) {
    console.log('  -> WHITE player (byronoc222222) - THE WINNER');
  } else if (p1Lower === blackWallet) {
    console.log('  -> BLACK player (byron555555) - THE LOSER');
  } else {
    console.log('  -> UNKNOWN');
  }

  console.log('');
  console.log('On-chain Player 2 (' + onChainGame.player2 + ') is:');
  if (p2Lower === whiteWallet) {
    console.log('  -> WHITE player (byronoc222222) - THE WINNER');
  } else if (p2Lower === blackWallet) {
    console.log('  -> BLACK player (byron555555) - THE LOSER');
  } else {
    console.log('  -> UNKNOWN');
  }

  console.log('\n=== THE PROBLEM ===');
  console.log('On-chain result: Player1Wins');
  console.log('On-chain Player 1 is: ' + (p1Lower === whiteWallet ? 'WHITE (winner)' : 'BLACK (loser)'));
  console.log('');
  if (p1Lower === blackWallet) {
    console.log('BUG: The escrow paid Player 1 (BLACK/loser) instead of Player 2 (WHITE/winner)!');
    console.log('');
    console.log('The submit-game-result function mapped:');
    console.log('  white_wins -> Player1Wins');
    console.log('');
    console.log('But in this escrow:');
    console.log('  Player 1 = BLACK player (the loser)');
    console.log('  Player 2 = WHITE player (the winner)');
    console.log('');
    console.log('So the payment went to the wrong person!');
  }
}

check().catch(console.error);
