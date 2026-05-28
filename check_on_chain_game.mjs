import { ethers } from 'ethers';
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

const ESCROW_CONTRACT = envVars.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://rpc-amoy.polygon.technology';
const GAME_ID = '0x864bb522afe071b3bb9ff7b97f6b250e29cbec462f74841f1a10af1aadd8b2ad';

const ABI = [
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))"
];

const STATUS_NAMES = ['None', 'Pending', 'Active', 'Completed', 'Cancelled', 'Expired'];
const RESULT_NAMES = ['None', 'Player1Wins', 'Player2Wins', 'Draw'];

async function check() {
  console.log('Checking on-chain game status...');
  console.log('Contract:', ESCROW_CONTRACT);
  console.log('Game ID:', GAME_ID);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(ESCROW_CONTRACT, ABI, provider);

  try {
    const game = await contract.getGame(GAME_ID);

    console.log('\n=== On-Chain Game Status ===');
    console.log('Player 1:', game.player1);
    console.log('Player 2:', game.player2);
    console.log('Wager (USDC):', Number(game.wagerAmount) / 1e6);
    console.log('Total Pot (USDC):', Number(game.totalPot) / 1e6);
    console.log('Status:', STATUS_NAMES[Number(game.status)] || game.status);
    console.log('Result:', RESULT_NAMES[Number(game.result)] || game.result);
    console.log('Created At:', new Date(Number(game.createdAt) * 1000).toISOString());
  } catch (e) {
    console.error('Error:', e.message);
  }
}

check();
