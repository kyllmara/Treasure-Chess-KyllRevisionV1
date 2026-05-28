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

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const USDC_CONTRACT = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582';
const RPC_URL = 'https://rpc-amoy.polygon.technology';
const TX_HASH = '0x7c303732d00836ac13f2d6fdba7bcf382ab23c2b043b508c12c66c860cc5d646';

const supabase = createClient(
  envVars.EXPO_PUBLIC_SUPABASE_URL,
  envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);

  // Get the transaction receipt
  console.log('=== Transaction Details ===');
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  console.log('TX Hash:', TX_HASH);
  console.log('Block:', receipt.blockNumber);
  console.log('Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
  console.log('Gas Used:', receipt.gasUsed.toString());

  // Parse the logs to see who received USDC
  console.log('\n=== Transfer Events ===');
  const transferTopic = ethers.id('Transfer(address,address,uint256)');
  for (const log of receipt.logs) {
    if (log.topics[0] === transferTopic && log.address.toLowerCase() === USDC_CONTRACT.toLowerCase()) {
      const from = '0x' + log.topics[1].slice(26);
      const to = '0x' + log.topics[2].slice(26);
      const amount = BigInt(log.data);
      console.log('USDC Transfer:');
      console.log('  From:', from);
      console.log('  To:', to);
      console.log('  Amount:', Number(amount) / 1e6, 'USDC');
    }
  }

  // Get the game details from DB
  console.log('\n=== Game Details from Database ===');
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', '1f64cea3-de1c-433b-b212-8211f9c9156e')
    .single();

  console.log('White Player ID:', game.white_player_id);
  console.log('Black Player ID:', game.black_player_id);
  console.log('Winner ID:', game.winner_id);
  console.log('Result:', game.result);
  console.log('On-chain settled:', game.on_chain_settled);
  console.log('On-chain TX:', game.on_chain_tx_hash);

  // Get player wallet addresses from profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, wallet_address')
    .in('id', [game.white_player_id, game.black_player_id]);

  console.log('\n=== Player Wallet Addresses ===');
  for (const p of profiles || []) {
    const color = p.id === game.white_player_id ? 'WHITE' : 'BLACK';
    const isWinner = p.id === game.winner_id ? '(WINNER)' : '';
    console.log(color, isWinner + ':', p.username);
    console.log('  User ID:', p.id);
    console.log('  Wallet:', p.wallet_address || 'NOT SET');

    if (p.wallet_address) {
      const balance = await usdc.balanceOf(p.wallet_address);
      console.log('  USDC Balance:', Number(balance) / 1e6, 'USDC');
    }
  }

  // Check balances table
  console.log('\n=== Balances Table (TCT) ===');
  const { data: balances } = await supabase
    .from('balances')
    .select('*')
    .in('user_id', [game.white_player_id, game.black_player_id]);

  for (const b of balances || []) {
    const color = b.user_id === game.white_player_id ? 'WHITE' : 'BLACK';
    console.log(color + ':');
    console.log('  Available TCT:', b.available_tct);
    console.log('  Locked TCT:', b.locked_tct);
    console.log('  Total Won TCT:', b.total_won_tct);
    console.log('  Total Lost TCT:', b.total_lost_tct);
  }

  // Check on-chain game details
  console.log('\n=== On-Chain Game Details ===');
  const ESCROW_ABI = [
    "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))"
  ];
  const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, provider);
  const onChainGame = await escrow.getGame(game.on_chain_game_id);

  console.log('On-chain Player 1:', onChainGame.player1);
  console.log('On-chain Player 2:', onChainGame.player2);
  console.log('On-chain Result:', ['None', 'Player1Wins', 'Player2Wins', 'Draw'][Number(onChainGame.result)]);
}

check().catch(console.error);
