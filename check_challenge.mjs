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
  envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  // Get the game
  const gameId = '1f64cea3-de1c-433b-b212-8211f9c9156e';

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  console.log('=== Game Details ===');
  console.log('Game ID:', game.id);
  console.log('Wager TCT:', game.wager_tct, '(type:', typeof game.wager_tct + ')');
  console.log('On-chain game ID:', game.on_chain_game_id);

  // Find the challenge that created this game
  const { data: challenges } = await supabase
    .from('challenges')
    .select('*')
    .eq('game_id', gameId);

  console.log('\n=== Challenge Details ===');
  if (challenges && challenges.length > 0) {
    const challenge = challenges[0];
    console.log('Challenge ID:', challenge.id);
    console.log('Wager TCT:', challenge.wager_tct, '(type:', typeof challenge.wager_tct + ')');
    console.log('On-chain game ID:', challenge.on_chain_game_id);
    console.log('Creator Ready:', challenge.creator_ready);
    console.log('Opponent Ready:', challenge.opponent_ready);
    console.log('Escrow Status:', challenge.escrow_status);
    console.log('Status:', challenge.status);

    // Check wager_tct > 0 comparison
    console.log('\n=== Type Checks ===');
    console.log('challenge.wager_tct > 0:', challenge.wager_tct > 0);
    console.log('Number(challenge.wager_tct) > 0:', Number(challenge.wager_tct) > 0);
    console.log('Raw value:', JSON.stringify(challenge.wager_tct));
  } else {
    console.log('No challenge found for this game!');

    // Find most recent challenges
    const { data: recentChallenges } = await supabase
      .from('challenges')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n=== Recent Challenges ===');
    for (const c of recentChallenges || []) {
      console.log(c.id, '- status:', c.status, '- wager:', c.wager_tct, '- game_id:', c.game_id);
    }
  }
}

check().catch(console.error);
