import { ethers } from 'ethers';

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://rpc-amoy.polygon.technology';
const GAME_ID = '0x645e83536c42554947536c8adeb34afc64e1b77e44d5512d0d9417f7c305cf1c';

const ABI = [
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))"
];

// Status enum: 0=None, 1=Pending, 2=Active, 3=Completed, 4=Cancelled, 5=Expired
// Result enum: 0=None, 1=Player1Wins, 2=Player2Wins, 3=Draw

const STATUS_NAMES = ['None', 'Pending', 'Active', 'Completed', 'Cancelled', 'Expired'];
const RESULT_NAMES = ['None', 'Player1Wins', 'Player2Wins', 'Draw'];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(ESCROW_CONTRACT, ABI, provider);
  
  try {
    const game = await contract.getGame(GAME_ID);
    
    console.log('Game ID:', GAME_ID);
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
