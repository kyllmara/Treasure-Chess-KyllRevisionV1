import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Read .env file manually to handle Windows line endings
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
  envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  // Get recent games
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, white_player_id, black_player_id, wager_tct, status, result, on_chain_game_id, on_chain_settled, on_chain_tx_hash, ended_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (gamesError) {
    console.error('Error fetching games:', gamesError);
    return;
  }

  console.log('=== Recent Games ===');
  for (const game of games) {
    console.log('\nGame: ' + game.id);
    console.log('  Status: ' + game.status + ', Result: ' + game.result);
    console.log('  Wager: ' + game.wager_tct + ' TCT');
    console.log('  On-chain settled: ' + game.on_chain_settled);
    console.log('  On-chain game ID: ' + (game.on_chain_game_id ? game.on_chain_game_id.substring(0, 20) + '...' : 'NONE'));
    console.log('  TX Hash: ' + (game.on_chain_tx_hash || 'NONE'));
    console.log('  Created: ' + game.created_at);
  }

  // Get the most recent game with a wager
  const recentWagerGame = games.find(g => Number(g.wager_tct) > 0);
  if (recentWagerGame) {
    console.log('\n=== Most Recent Wager Game Details ===');
    console.log('Game ID:', recentWagerGame.id);
    console.log('White Player:', recentWagerGame.white_player_id);
    console.log('Black Player:', recentWagerGame.black_player_id);

    // Check balances for players
    const { data: balances } = await supabase
      .from('balances')
      .select('user_id, total_won_tct, total_lost_tct, available_tct')
      .in('user_id', [recentWagerGame.white_player_id, recentWagerGame.black_player_id]);

    console.log('\nPlayer Balances:');
    for (const b of balances || []) {
      console.log('  ' + b.user_id + ': won=' + b.total_won_tct + ', lost=' + b.total_lost_tct + ', available=' + b.available_tct);
    }

    // Check if there's an escrow record
    const { data: escrow } = await supabase
      .from('game_escrows')
      .select('*')
      .eq('game_id', recentWagerGame.id)
      .single();

    console.log('\nEscrow Record:');
    if (escrow) {
      console.log('  Status:', escrow.status);
      console.log('  Total Pool:', escrow.total_pool_tct);
      console.log('  Winner ID:', escrow.winner_id || 'NONE');
      console.log('  Settled At:', escrow.settled_at || 'NOT SETTLED');
    } else {
      console.log('  No escrow record found');
    }
  }
}

check().catch(console.error);
