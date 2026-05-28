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

  // Check play_now_queue
  const { data: queue } = await supabase
    .from('play_now_queue')
    .select('*')
    .eq('game_id', gameId);

  console.log('=== Play Now Queue for game ===');
  if (queue && queue.length > 0) {
    for (const q of queue) {
      console.log('Queue entry:', q.id);
      console.log('  User:', q.user_id);
      console.log('  Wager:', q.wager_tct);
      console.log('  Status:', q.status);
      console.log('  Game ID:', q.game_id);
      console.log('  On-chain game ID:', q.on_chain_game_id);
    }
  } else {
    console.log('No Play Now queue entries found for this game');
  }

  // Check recent queue entries
  const { data: recentQueue } = await supabase
    .from('play_now_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n=== Recent Play Now Queue ===');
  for (const q of recentQueue || []) {
    console.log(q.id.substring(0, 8), '- user:', q.user_id.substring(0, 8), '- wager:', q.wager_tct, '- status:', q.status, '- game_id:', q.game_id ? q.game_id.substring(0, 8) : 'none');
  }
}

check().catch(console.error);
