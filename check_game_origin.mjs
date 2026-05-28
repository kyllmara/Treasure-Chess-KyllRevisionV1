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
  const gameId = '1f64cea3-de1c-433b-b212-8211f9c9156e';

  // Get full game details
  const { data: game, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== Full Game Record ===');
  console.log(JSON.stringify(game, null, 2));

  // Check ALL challenges to find ones with the same on_chain_game_id
  const { data: challenges } = await supabase
    .from('challenges')
    .select('*')
    .eq('on_chain_game_id', game.on_chain_game_id);

  console.log('\n=== Challenges with same on_chain_game_id ===');
  console.log('Found:', challenges?.length || 0);
  for (const c of challenges || []) {
    console.log(JSON.stringify(c, null, 2));
  }

  // Check play_now_queue with same on_chain_game_id
  const { data: queueEntries } = await supabase
    .from('play_now_queue')
    .select('*')
    .eq('on_chain_game_id', game.on_chain_game_id);

  console.log('\n=== Play Now Queue with same on_chain_game_id ===');
  console.log('Found:', queueEntries?.length || 0);
  for (const q of queueEntries || []) {
    console.log(JSON.stringify(q, null, 2));
  }

  // Check game_escrows
  const { data: escrows } = await supabase
    .from('game_escrows')
    .select('*')
    .eq('game_id', gameId);

  console.log('\n=== Game Escrows ===');
  console.log('Found:', escrows?.length || 0);
  for (const e of escrows || []) {
    console.log(JSON.stringify(e, null, 2));
  }

  // Check profiles for players
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, elo_rating')
    .in('id', [game.white_player_id, game.black_player_id]);

  console.log('\n=== Players ===');
  for (const p of profiles || []) {
    const color = p.id === game.white_player_id ? 'WHITE' : 'BLACK';
    console.log(color + ':', p.username, '(ELO:', p.elo_rating + ')');
  }
}

check().catch(console.error);
