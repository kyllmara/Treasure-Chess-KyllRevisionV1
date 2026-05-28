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
const USDC_CONTRACT = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'; // Amoy USDC
const RPC_URL = 'https://rpc-amoy.polygon.technology';

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const ESCROW_ABI = [
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
  "function platformVault() view returns (address)"
];

const STATUS_NAMES = ['None', 'Pending', 'Active', 'Completed', 'Cancelled', 'Expired'];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
  const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, provider);

  console.log('=== Escrow Contract Balance ===');
  console.log('Escrow Contract:', ESCROW_CONTRACT);

  const escrowBalance = await usdc.balanceOf(ESCROW_CONTRACT);
  console.log('USDC Balance:', Number(escrowBalance) / 1e6, 'USDC');

  // Check the specific game
  const GAME_ID = '0x864bb522afe071b3bb76113c25e9bb73c38249facbf98f2199a237945a642ee1';
  console.log('\n=== Game Status ===');
  console.log('Game ID:', GAME_ID);

  try {
    const game = await escrow.getGame(GAME_ID);
    console.log('Player 1:', game.player1);
    console.log('Player 2:', game.player2);
    console.log('Wager Amount:', Number(game.wagerAmount) / 1e6, 'USDC');
    console.log('Total Pot:', Number(game.totalPot) / 1e6, 'USDC');
    console.log('Status:', STATUS_NAMES[Number(game.status)] || game.status);
    console.log('Created At:', new Date(Number(game.createdAt) * 1000).toISOString());
  } catch (e) {
    console.log('Error getting game:', e.message);
  }

  // Check platform vault
  const vault = await escrow.platformVault();
  const vaultBalance = await usdc.balanceOf(vault);
  console.log('\n=== Platform Vault ===');
  console.log('Vault Address:', vault);
  console.log('Vault USDC Balance:', Number(vaultBalance) / 1e6, 'USDC');

  // List all recent games by checking events or known game IDs
  console.log('\n=== Checking other game IDs from DB ===');

  const otherGameIds = [
    '0x645e83536c42554947536c8adeb34afc64e1b77e44d5512d0d9417f7c305cf1c', // Previous game
    '0x56633b581cb4b33524b4bb7b9c38249facbf98f2199a237945a642ee1abc1234', // Example
  ];

  for (const gid of otherGameIds) {
    try {
      const game = await escrow.getGame(gid);
      if (game.status > 0) {
        console.log('\nGame:', gid.substring(0, 20) + '...');
        console.log('  Status:', STATUS_NAMES[Number(game.status)]);
        console.log('  Wager:', Number(game.wagerAmount) / 1e6, 'USDC');
      }
    } catch (e) {
      // Skip
    }
  }
}

check().catch(console.error);
