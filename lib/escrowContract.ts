/**
 * TreasureChessEscrow Contract SDK
 *
 * Handles all on-chain interactions for USDC escrow:
 * - Creating games (locks USDC)
 * - Joining games (locks USDC)
 * - Cancelling games (refunds USDC)
 * - Claiming timeout wins
 * - Reading game state
 */

import { ethers, BrowserProvider, Contract, Signer, parseUnits, formatUnits, keccak256, solidityPacked, getBytes } from 'ethers';

// Contract ABI (only the functions we need)
const ESCROW_ABI = [
  // Read functions
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds))",
  "function calculatePayout(uint256 totalPot) view returns (uint256 winnerPayout, uint256 platformFee)",
  "function PLATFORM_FEE_BPS() view returns (uint256)",
  "function MIN_WAGER() view returns (uint256)",
  "function MAX_WAGER() view returns (uint256)",
  "function defaultTimeoutSeconds() view returns (uint256)",

  // Write functions
  "function createGame(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds)",
  "function joinGame(bytes32 gameId)",
  "function cancelGame(bytes32 gameId)",
  "function claimTimeoutWin(bytes32 gameId)",

  // Events
  "event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)",
  "event GameJoined(bytes32 indexed gameId, address indexed player2, uint256 totalPot)",
  "event GameCompleted(bytes32 indexed gameId, address indexed winner, uint256 winnerPayout, uint256 platformFee, uint8 result)",
  "event GameCancelled(bytes32 indexed gameId, address indexed player1)",
  "event TimeoutClaimed(bytes32 indexed gameId, address indexed winner, address indexed loser)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export enum GameStatus {
  None = 0,
  WaitingForOpponent = 1,
  Active = 2,
  Completed = 3,
  Cancelled = 4,
  Disputed = 5,
}

export enum GameResult {
  None = 0,
  Player1Wins = 1,
  Player2Wins = 2,
  Draw = 3,
}

export interface OnChainGame {
  gameId: string;
  player1: string;
  player2: string;
  wagerAmount: bigint;
  totalPot: bigint;
  status: GameStatus;
  result: GameResult;
  createdAt: Date;
  lastMoveAt: Date;
  timeoutSeconds: number;
}

export interface EscrowConfig {
  escrowAddress: string;
  usdcAddress: string;
  chainId: number;
  rpcUrl: string;
}

// Network configurations
export const ESCROW_CONFIGS: Record<string, EscrowConfig> = {
  polygon: {
    escrowAddress: process.env.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || '',
    usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Native USDC on Polygon
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
  },
  amoy: {
    escrowAddress: process.env.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || '',
    usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // Test USDC on Amoy
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
  },
};

export class EscrowContractSDK {
  private provider: BrowserProvider | null = null;
  private signer: Signer | null = null;
  private escrowContract: Contract | null = null;
  private usdcContract: Contract | null = null;
  private config: EscrowConfig;

  constructor(network: 'polygon' | 'amoy' = 'polygon') {
    this.config = ESCROW_CONFIGS[network];
    if (!this.config.escrowAddress) {
      console.warn('Escrow contract address not configured');
    }
  }

  /**
   * Connect to user's wallet (Magic, MetaMask, etc.)
   */
  async connect(provider: any): Promise<string> {
    this.provider = new BrowserProvider(provider);
    this.signer = await this.provider.getSigner();

    const address = await this.signer.getAddress();

    // Initialize contracts
    this.escrowContract = new Contract(
      this.config.escrowAddress,
      ESCROW_ABI,
      this.signer
    );

    this.usdcContract = new Contract(
      this.config.usdcAddress,
      USDC_ABI,
      this.signer
    );

    return address;
  }

  /**
   * Check if user has approved USDC spending
   */
  async checkAllowance(userAddress: string): Promise<bigint> {
    if (!this.usdcContract) throw new Error('Not connected');
    return this.usdcContract.allowance(userAddress, this.config.escrowAddress);
  }

  /**
   * Approve unlimited USDC spending (one-time)
   */
  async approveUsdc(): Promise<string> {
    if (!this.usdcContract) throw new Error('Not connected');

    const tx = await this.usdcContract.approve(
      this.config.escrowAddress,
      ethers.MaxUint256
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get user's USDC balance
   */
  async getUsdcBalance(address: string): Promise<string> {
    if (!this.usdcContract) throw new Error('Not connected');
    const balance = await this.usdcContract.balanceOf(address);
    return formatUnits(balance, 6);
  }

  /**
   * Create a new game with USDC wager
   * @param gameId Unique game identifier (use the off-chain game ID)
   * @param wagerUsdc Wager amount in USDC (e.g., "100" for 100 USDC)
   * @param timeoutSeconds Custom timeout (0 for default 24 hours)
   */
  async createGame(
    gameId: string,
    wagerUsdc: string,
    timeoutSeconds: number = 0
  ): Promise<{ txHash: string; gameIdBytes: string }> {
    if (!this.escrowContract || !this.signer) throw new Error('Not connected');

    // Convert game ID to bytes32
    const gameIdBytes = ethers.id(gameId);

    // Convert USDC to wei (6 decimals)
    const wagerAmount = parseUnits(wagerUsdc, 6);

    // Check allowance first
    const userAddress = await this.signer.getAddress();
    const allowance = await this.checkAllowance(userAddress);

    if (allowance < wagerAmount) {
      throw new Error('Insufficient USDC allowance. Call approveUsdc() first.');
    }

    // Create game (pulls USDC into escrow)
    const tx = await this.escrowContract.createGame(
      gameIdBytes,
      wagerAmount,
      timeoutSeconds
    );

    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      gameIdBytes,
    };
  }

  /**
   * Join an existing game
   * @param gameId The game ID (string or bytes32)
   */
  async joinGame(gameId: string): Promise<string> {
    if (!this.escrowContract || !this.signer) throw new Error('Not connected');

    const gameIdBytes = gameId.startsWith('0x') ? gameId : ethers.id(gameId);

    // Get game to check wager amount
    const game = await this.getGame(gameIdBytes);

    // Check allowance
    const userAddress = await this.signer.getAddress();
    const allowance = await this.checkAllowance(userAddress);

    if (allowance < game.wagerAmount) {
      throw new Error('Insufficient USDC allowance. Call approveUsdc() first.');
    }

    const tx = await this.escrowContract.joinGame(gameIdBytes);
    const receipt = await tx.wait();

    return receipt.hash;
  }

  /**
   * Cancel a game before opponent joins (refunds your USDC)
   */
  async cancelGame(gameId: string): Promise<string> {
    if (!this.escrowContract) throw new Error('Not connected');

    const gameIdBytes = gameId.startsWith('0x') ? gameId : ethers.id(gameId);

    const tx = await this.escrowContract.cancelGame(gameIdBytes);
    const receipt = await tx.wait();

    return receipt.hash;
  }

  /**
   * Claim win by timeout (if opponent hasn't moved)
   */
  async claimTimeoutWin(gameId: string): Promise<string> {
    if (!this.escrowContract) throw new Error('Not connected');

    const gameIdBytes = gameId.startsWith('0x') ? gameId : ethers.id(gameId);

    const tx = await this.escrowContract.claimTimeoutWin(gameIdBytes);
    const receipt = await tx.wait();

    return receipt.hash;
  }

  /**
   * Get game details from chain
   */
  async getGame(gameId: string): Promise<OnChainGame> {
    if (!this.escrowContract) throw new Error('Not connected');

    const gameIdBytes = gameId.startsWith('0x') ? gameId : ethers.id(gameId);
    const game = await this.escrowContract.getGame(gameIdBytes);

    return {
      gameId: game.gameId,
      player1: game.player1,
      player2: game.player2,
      wagerAmount: game.wagerAmount,
      totalPot: game.totalPot,
      status: Number(game.status) as GameStatus,
      result: Number(game.result) as GameResult,
      createdAt: new Date(Number(game.createdAt) * 1000),
      lastMoveAt: new Date(Number(game.lastMoveAt) * 1000),
      timeoutSeconds: Number(game.timeoutSeconds),
    };
  }

  /**
   * Calculate payout for a given pot
   */
  async calculatePayout(totalPotUsdc: string): Promise<{
    winnerPayout: string;
    platformFee: string;
  }> {
    if (!this.escrowContract) throw new Error('Not connected');

    const totalPot = parseUnits(totalPotUsdc, 6);
    const [winnerPayout, platformFee] = await this.escrowContract.calculatePayout(totalPot);

    return {
      winnerPayout: formatUnits(winnerPayout, 6),
      platformFee: formatUnits(platformFee, 6),
    };
  }

  /**
   * Check if timeout can be claimed
   */
  async canClaimTimeout(gameId: string): Promise<boolean> {
    try {
      const game = await this.getGame(gameId);

      if (game.status !== GameStatus.Active) return false;

      const now = Date.now();
      const timeoutMs = game.timeoutSeconds * 1000;
      const deadlineMs = game.lastMoveAt.getTime() + timeoutMs;

      return now > deadlineMs;
    } catch {
      return false;
    }
  }

  /**
   * Get contract configuration
   */
  async getContractConfig(): Promise<{
    platformFeeBps: number;
    minWagerUsdc: string;
    maxWagerUsdc: string;
    defaultTimeoutSeconds: number;
  }> {
    if (!this.escrowContract) throw new Error('Not connected');

    const [platformFeeBps, minWager, maxWager, defaultTimeout] = await Promise.all([
      this.escrowContract.PLATFORM_FEE_BPS(),
      this.escrowContract.MIN_WAGER(),
      this.escrowContract.MAX_WAGER(),
      this.escrowContract.defaultTimeoutSeconds(),
    ]);

    return {
      platformFeeBps: Number(platformFeeBps),
      minWagerUsdc: formatUnits(minWager, 6),
      maxWagerUsdc: formatUnits(maxWager, 6),
      defaultTimeoutSeconds: Number(defaultTimeout),
    };
  }

  /**
   * Format USDC amount for display
   */
  formatUsdc(amount: bigint): string {
    return formatUnits(amount, 6);
  }

  /**
   * Parse USDC amount from string
   */
  parseUsdc(amount: string): bigint {
    return parseUnits(amount, 6);
  }

  /**
   * Generate game ID bytes32 from string
   */
  static gameIdToBytes32(gameId: string): string {
    return ethers.id(gameId);
  }
}

// Singleton instance
let escrowSDK: EscrowContractSDK | null = null;

export function getEscrowSDK(network: 'polygon' | 'amoy' = 'polygon'): EscrowContractSDK {
  if (!escrowSDK) {
    escrowSDK = new EscrowContractSDK(network);
  }
  return escrowSDK;
}

/**
 * Backend signer utility for submitting game results
 * This should be used server-side (Supabase Edge Function)
 */
export function createResultSignature(
  gameId: string,
  result: GameResult,
  chainId: number,
  escrowAddress: string,
  signerPrivateKey: string
): string {
  const wallet = new ethers.Wallet(signerPrivateKey);

  const gameIdBytes = gameId.startsWith('0x') ? gameId : ethers.id(gameId);

  const messageHash = keccak256(
    solidityPacked(
      ['bytes32', 'uint8', 'uint256', 'address'],
      [gameIdBytes, result, chainId, escrowAddress]
    )
  );

  return wallet.signMessageSync(getBytes(messageHash));
}
