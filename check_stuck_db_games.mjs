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

const supabaseUrl = envVars.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// The two stuck game IDs (full versions from the escrow scan)
const stuckGameIds = [
  '0xf23c8a5ee02fbbd51b',
  '0x51b57968f9750c4fe1'
];

async function check() {
  console.log('Looking for games with on_chain_game_id starting with stuck IDs...\n');
  
  const { data: games, error } = await supabase
    .from('games')
    .select('id, status, result, on_chain_game_id, on_chain_settled, wager_tct, created_at')
    .not('on_chain_game_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.log('Error:', error.message);
    return;
  }
  
  console.log('Recent games with on_chain_game_id:\n');
  for (const game of games) {
    const isStuck = stuckGameIds.some(id => game.on_chain_game_id?.startsWith(id));
    console.log('Game:', game.id);
    console.log('  on_chain_game_id:', game.on_chain_game_id?.substring(0, 25) + '...');
    console.log('  status:', game.status);
    console.log('  result:', game.result);
    console.log('  on_chain_settled:', game.on_chain_settled);
    console.log('  wager_tct:', game.wager_tct);
    if (isStuck) console.log('  *** MATCHES STUCK ESCROW ***');
    console.log('');
  }
}

check().catch(console.error);
