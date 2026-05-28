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

// Use service role key to bypass RLS
const supabase = createClient(
  envVars.EXPO_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const winnerId = '720bcb1f-fdeb-44c8-a6b8-d2a11bc0f331';
  const loserId = 'f7ea0802-e965-47f1-83fb-44b0cd7c29e8';

  console.log('=== Checking Balances (Service Role) ===');
  console.log('Winner ID:', winnerId);
  console.log('Loser ID:', loserId);

  // Check balances directly
  const { data: balances, error } = await supabase
    .from('balances')
    .select('*')
    .in('user_id', [winnerId, loserId]);

  if (error) {
    console.log('Error fetching balances:', error.message);
    return;
  }

  console.log('\nBalances for game players:');
  if (!balances || balances.length === 0) {
    console.log('No balance records found!');
  }
  for (const b of balances || []) {
    const role = b.user_id === winnerId ? 'WINNER' : 'LOSER';
    console.log(role + ' (' + b.user_id + '):');
    console.log('  Available TCT: ' + b.available_tct);
    console.log('  Locked TCT: ' + b.locked_tct);
    console.log('  Total Won TCT: ' + b.total_won_tct);
    console.log('  Total Lost TCT: ' + b.total_lost_tct);
  }

  // Check all balances in the table
  const { data: allBalances } = await supabase
    .from('balances')
    .select('*');

  console.log('\n=== All Balances in Table ===');
  console.log('Total records:', (allBalances || []).length);
  for (const b of allBalances || []) {
    console.log('User ' + b.user_id.substring(0, 8) + '...: won=' + b.total_won_tct + ', lost=' + b.total_lost_tct);
  }
}

check().catch(console.error);
