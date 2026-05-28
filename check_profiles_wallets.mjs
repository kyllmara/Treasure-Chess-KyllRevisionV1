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

  console.log('=== Profile Details with Wallet Addresses ===\n');

  // Get profiles with all wallet-related fields
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', [winnerId, loserId]);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  for (const p of profiles || []) {
    const role = p.id === winnerId ? 'WINNER' : 'LOSER';
    console.log(role + ':');
    console.log('  User ID:', p.id);
    console.log('  Username:', p.username);
    console.log('  Email:', p.email || 'NOT SET');
    console.log('  Embedded Wallet:', p.embedded_wallet_address || 'NOT SET');
    console.log('  Smart Wallet:', p.smart_wallet_address || 'NOT SET');
    console.log('  External Wallet:', p.external_wallet_address || 'NOT SET');
    console.log('  Active Wallet Type:', p.active_wallet_type || 'NOT SET');
    console.log('  Created:', p.created_at);
    console.log('');
  }

  // Also check the game to see on-chain player addresses
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', '1f64cea3-de1c-433b-b212-8211f9c9156e')
    .single();

  console.log('=== Game On-Chain Details ===');
  console.log('On-chain Game ID:', game.on_chain_game_id);
  console.log('White Player ID:', game.white_player_id);
  console.log('Black Player ID:', game.black_player_id);
  console.log('Winner ID:', game.winner_id);
  console.log('Result:', game.result);

  // The on-chain transfer went to:
  console.log('\n=== On-Chain Transfer Recipients (from TX) ===');
  console.log('Winner received 1.8 USDC at: 0x64d9194326f90c0af744beb2e6e42a8181a8ea44');
  console.log('Platform vault received 0.2 USDC at: 0xf0f60aaa8e0d5055fd1590f7d4bcaac1c180f03b');

  // Check if these match the profile wallet addresses
  const winnerProfile = profiles.find(p => p.id === winnerId);
  if (winnerProfile) {
    const onChainRecipient = '0x64d9194326f90c0af744beb2e6e42a8181a8ea44';
    console.log('\n=== Wallet Match Verification ===');

    // Check all wallet types
    const wallets = [
      { type: 'embedded', addr: winnerProfile.embedded_wallet_address },
      { type: 'smart', addr: winnerProfile.smart_wallet_address },
      { type: 'external', addr: winnerProfile.external_wallet_address },
    ];

    let matched = false;
    for (const w of wallets) {
      if (w.addr && w.addr.toLowerCase() === onChainRecipient.toLowerCase()) {
        console.log('MATCH FOUND! Winner ' + w.type + ' wallet matches on-chain recipient');
        matched = true;
      }
    }

    if (!matched) {
      console.log('WARNING: No profile wallet matches on-chain recipient!');
      console.log('This means funds were sent to a wallet not in the winner profile.');
    }
  }
}

check().catch(console.error);
