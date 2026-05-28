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
  const winnerId = '720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331';
  const loserId = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8';

  console.log('=== Checking Balances ===');
  console.log('Winner ID:', winnerId);
  console.log('Loser ID:', loserId);

  // Check balances directly
  const { data: balances, error } = await supabase
    .from('balances')
    .select('*');

  if (error) {
    console.log('Error fetching balances:', error.message);
    return;
  }

  console.log('\nAll balances in table:');
  for (const b of balances || []) {
    console.log('User ' + b.user_id + ':');
    console.log('  Available TCT: ' + b.available_tct);
    console.log('  Locked TCT: ' + b.locked_tct);
    console.log('  Total Won TCT: ' + b.total_won_tct);
    console.log('  Total Lost TCT: ' + b.total_lost_tct);
  }

  // Also check profiles to get usernames
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', [winnerId, loserId]);

  console.log('\nProfiles:');
  for (const p of profiles || []) {
    const role = p.id === winnerId ? 'WINNER' : 'LOSER';
    console.log(role + ': ' + p.username + ' (' + p.id + ')');
  }
}

check().catch(console.error);
