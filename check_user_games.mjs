import { ethers } from 'ethers';

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://rpc-amoy.polygon.technology';
const USER_WALLET = '0xD578a74591eb4FdD8e637255403A91c243B8e5Fa';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const GAME_CREATED_TOPIC = ethers.id('GameCreated(bytes32,address,uint256,uint256)');
const STATUS_NAMES = ['None', 'WaitingForOpponent', 'Active', 'Completed', 'Cancelled', 'Disputed'];

const ESCROW_ABI = [
  'function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))'
];

const iface = new ethers.Interface([
  'event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)'
]);

async function check() {
  const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, provider);
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 100000);
  
  console.log('Scanning for games involving', USER_WALLET);
  
  const logs = await provider.getLogs({
    address: ESCROW_CONTRACT,
    topics: [GAME_CREATED_TOPIC],
    fromBlock,
    toBlock: currentBlock
  });
  
  console.log('Found', logs.length, 'GameCreated events\n');
  
  let activeCount = 0;
  let totalLocked = 0;
  
  for (const log of logs) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const gameId = parsed.args.gameId;
      const game = await escrow.getGame(gameId);
      const status = Number(game.status);
      
      const isPlayer1 = game.player1.toLowerCase() === USER_WALLET.toLowerCase();
      const isPlayer2 = game.player2.toLowerCase() === USER_WALLET.toLowerCase();
      
      if (!isPlayer1 && !isPlayer2) continue;
      
      const wager = Number(game.wagerAmount) / 1e6;
      console.log('Game:', gameId.substring(0, 20) + '...');
      console.log('  Status:', STATUS_NAMES[status] || 'Unknown(' + status + ')');
      console.log('  Wager:', wager, 'USDC');
      console.log('  You are:', isPlayer1 ? 'Player1' : 'Player2');
      console.log('');
      
      if (status === 1 || status === 2) {
        activeCount++;
        totalLocked += wager;
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  console.log('=== Summary ===');
  console.log('Active/Pending games:', activeCount);
  console.log('Total locked:', totalLocked, 'USDC =', totalLocked * 25, 'TCT');
}

check().catch(console.error);
