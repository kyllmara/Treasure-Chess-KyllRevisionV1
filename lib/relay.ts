/**
 * Treasure Chess Non-Custodial Relay SDK
 *
 * Enables gasless transactions using ERC-2771 meta-transactions.
 * Users keep their own USDC - only gas is paid by the platform.
 *
 * Flow:
 * 1. User has USDC in their wallet (via Magic Link)
 * 2. User approves escrow contract to spend their USDC (one-time, gasless)
 * 3. User signs an ERC-2771 ForwardRequest
 * 4. SDK sends the signed request to the relay endpoint
 * 5. Platform wallet submits to the forwarder contract
 * 6. Forwarder calls escrow, which sees the user as msg.sender
 * 7. User's USDC is pulled from their wallet into escrow
 *
 * Users NEVER need MATIC - all gas is paid by the platform!
 */

import { supabase } from "./supabase";
import { ethers, Contract, parseUnits, formatUnits } from "ethers";

// ============================================================================
// Types
// ============================================================================

export type RelayOperation =
  | "createGame"
  | "createGameWithPermit"
  | "joinGame"
  | "joinGameWithPermit"
  | "cancelGame"
  | "claimTimeoutWin"
  | "approveUsdc";

export interface ForwardRequest {
  from: string;
  to: string;
  value: bigint;
  gas: bigint;
  nonce: string; // Nonce used when signing
  deadline: number;
  data: string;
  signature: string;
}

export interface RelayRequest {
  operation: RelayOperation;
  forwardRequest: ForwardRequest;
  params?: {
    gameId?: string;
    wagerUsdc?: string;
    timeoutSeconds?: number;
  };
}

export interface RelayResponse {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  gasUsed?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const RELAY_ENDPOINT =
  process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/relay-transaction";
const HOUSE_ENTRY_FEE_ENDPOINT =
  process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/house-entry-fee";
const CHAIN_ID = parseInt(process.env.EXPO_PUBLIC_CHAIN_ID || "80002");
const FORWARDER_ADDRESS = process.env.EXPO_PUBLIC_FORWARDER_ADDRESS || "";
const ESCROW_CONTRACT_ADDRESS =
  process.env.EXPO_PUBLIC_ESCROW_CONTRACT_ADDRESS || "";
const USDC_CONTRACT_ADDRESS =
  process.env.EXPO_PUBLIC_USDC_CONTRACT || "";
// Backend signer that will execute the permit-based transfer
const BACKEND_SIGNER_ADDRESS =
  process.env.EXPO_PUBLIC_BACKEND_SIGNER_ADDRESS || "0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b";

// Request validity for ForwardRequest (10 minutes)
const REQUEST_VALIDITY_SECONDS = 10 * 60;

// Permit validity (15 minutes - longer to account for relay delays)
const PERMIT_VALIDITY_SECONDS = 15 * 60;

// Default gas limits for operations
const GAS_LIMITS: Record<RelayOperation, bigint> = {
  createGame: 300000n,
  createGameWithPermit: 350000n, // Extra gas for permit
  joinGame: 250000n,
  joinGameWithPermit: 300000n, // Extra gas for permit
  cancelGame: 150000n,
  claimTimeoutWin: 200000n,
  approveUsdc: 100000n,
};

// Contract ABIs
const ESCROW_ABI = [
  "function createGame(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds)",
  "function createGameWithPermit(bytes32 gameId, uint256 wagerAmount, uint256 timeoutSeconds, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function joinGame(bytes32 gameId)",
  "function joinGameWithPermit(bytes32 gameId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function cancelGame(bytes32 gameId)",
  "function claimTimeoutWin(bytes32 gameId)",
  "function getGame(bytes32 gameId) view returns (tuple(bytes32 gameId, address player1, address player2, uint256 wagerAmount, uint256 totalPot, uint8 status, uint8 result, uint256 createdAt, uint256 lastMoveAt, uint256 timeoutSeconds, uint256 moveNonce))",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function name() view returns (string)",
  "function version() view returns (string)",
];

const FORWARDER_ABI = [
  "function nonces(address owner) view returns (uint256)",
];

// EIP-712 domain and types for ERC2771Forwarder
const EIP712_DOMAIN = {
  name: "TreasureChessForwarder",
  version: "1",
  chainId: CHAIN_ID,
  verifyingContract: FORWARDER_ADDRESS,
};

// Log domain configuration at load time
console.log("[relay] EIP-712 Domain Configuration:", {
  name: EIP712_DOMAIN.name,
  version: EIP712_DOMAIN.version,
  chainId: EIP712_DOMAIN.chainId,
  verifyingContract: EIP712_DOMAIN.verifyingContract,
  escrowContract: ESCROW_CONTRACT_ADDRESS,
  usdcContract: USDC_CONTRACT_ADDRESS,
});

const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
};

// ============================================================================
// TCT:USDC Conversion — canonical values live in lib/tct.ts
// ============================================================================

export { TCT_TO_USDC_RATE, tctToUsdc, usdcToTct } from "./tct";

// ============================================================================
// Relay SDK Class
// ============================================================================

export class RelaySDK {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private userAddress: string = "";

  /**
   * Initialize the SDK with the user's wallet provider
   */
  async initialize(walletProvider: any): Promise<string> {
    this.provider = new ethers.BrowserProvider(walletProvider);
    this.signer = await this.provider.getSigner();
    this.userAddress = await this.signer.getAddress();

    console.log("[relay] Initialized with address:", this.userAddress);

    return this.userAddress;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.signer !== null && this.userAddress !== "";
  }

  /**
   * Get the user's wallet address
   */
  getAddress(): string {
    return this.userAddress;
  }

  /**
   * Get user's USDC balance
   */
  async getUsdcBalance(): Promise<string> {
    if (!this.provider) throw new Error("Not initialized");

    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, this.provider);
    const balance = await usdc.balanceOf(this.userAddress);

    return formatUnits(balance, 6);
  }

  /**
   * Get user's USDC balance as TCT
   */
  async getTctBalance(): Promise<number> {
    const usdcBalance = await this.getUsdcBalance();
    return Math.floor(usdcToTct(parseFloat(usdcBalance)));
  }

  /**
   * Check if user has approved escrow contract
   */
  async checkAllowance(): Promise<string> {
    if (!this.provider) throw new Error("Not initialized");

    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, this.provider);
    const allowance = await usdc.allowance(this.userAddress, ESCROW_CONTRACT_ADDRESS);

    return formatUnits(allowance, 6);
  }

  /**
   * Check if user needs to approve USDC spending
   */
  async needsApproval(amountUsdc: string): Promise<boolean> {
    const allowance = await this.checkAllowance();
    return parseFloat(allowance) < parseFloat(amountUsdc);
  }

  /**
   * Get the next nonce from the forwarder
   */
  async getNonce(): Promise<bigint> {
    if (!this.provider) throw new Error("Not initialized");

    const forwarder = new Contract(FORWARDER_ADDRESS, FORWARDER_ABI, this.provider);
    return forwarder.nonces(this.userAddress);
  }

  /**
   * Sign an ERC-2771 ForwardRequest using EIP-712
   *
   * Uses ethers native signTypedData for proper EIP-712 encoding.
   * This handles type encoding correctly unlike raw eth_signTypedData_v4.
   */
  private async signForwardRequest(
    to: string,
    data: string,
    gasLimit: bigint
  ): Promise<ForwardRequest> {
    if (!this.signer || !this.provider) throw new Error("Not initialized");

    const nonce = await this.getNonce();
    const deadline = Math.floor(Date.now() / 1000) + REQUEST_VALIDITY_SECONDS;

    // Domain for EIP-712 signing
    const domain = {
      name: EIP712_DOMAIN.name,
      version: EIP712_DOMAIN.version,
      chainId: EIP712_DOMAIN.chainId,
      verifyingContract: EIP712_DOMAIN.verifyingContract,
    };

    // Types - matches OpenZeppelin ERC2771Forwarder exactly
    const types = {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    };

    // Message with proper types (BigInt for numbers, number for deadline)
    const message = {
      from: this.userAddress,
      to,
      value: 0n,
      gas: gasLimit,
      nonce: nonce,
      deadline: deadline,
      data,
    };

    console.log("[relay] Signing ForwardRequest with signTypedData:", {
      from: this.userAddress,
      to,
      value: message.value.toString(),
      gas: message.gas.toString(),
      nonce: message.nonce.toString(),
      deadline: message.deadline,
      dataLength: data.length,
      dataPrefix: data.substring(0, 66),
      domain,
    });

    // Use ethers native signTypedData - this handles encoding correctly
    const signature = await this.signer.signTypedData(domain, types, message);

    console.log("[relay] Signature generated:", signature.substring(0, 66) + "...");

    return {
      from: this.userAddress,
      to,
      value: 0n,
      gas: gasLimit,
      nonce: nonce.toString(), // Include nonce for server-side debugging
      deadline,
      data,
      signature,
    };
  }

  /**
   * Send a relay request to the backend
   */
  private async sendRelayRequest(
    operation: RelayOperation,
    forwardRequest: ForwardRequest,
    params?: RelayRequest["params"]
  ): Promise<RelayResponse> {
    // First try to get the session
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();

    console.log("[relay] Initial session check:", {
      hasSession: !!session,
      hasAccessToken: !!session?.access_token,
      expiresAt: session?.expires_at,
      sessionError: sessionError?.message,
    });

    if (!session?.access_token) {
      // Try to refresh
      console.log("[relay] No session, attempting refresh...");
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      console.log("[relay] Refresh result:", {
        hasSession: !!refreshData?.session,
        refreshError: refreshError?.message,
      });
      if (refreshError || !refreshData.session) {
        console.error("[relay] Session refresh failed:", refreshError);
        throw new Error("Not authenticated - please log in again");
      }
      session = refreshData.session;
    }

    // Check if token is about to expire (within 60 seconds)
    const tokenExp = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    console.log("[relay] Token expiry check:", {
      expiresAt: tokenExp,
      now,
      secondsUntilExpiry: tokenExp ? tokenExp - now : "unknown",
    });

    if (tokenExp && tokenExp - now < 60) {
      console.log("[relay] Token expiring soon, refreshing...");
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session) {
        session = refreshData.session;
        console.log("[relay] Token refreshed, new expiry:", refreshData.session.expires_at);
      } else {
        console.warn("[relay] Token refresh failed, using existing:", refreshError?.message);
      }
    }

    // Verify the wallet address matches the authenticated user's wallet
    // This prevents session mismatch when multiple users share the same device/bundler
    const sessionWalletAddress = session.user?.user_metadata?.magic_issuer?.replace("did:ethr:", "");

    console.log("[relay] Session check:", {
      hasSession: !!session,
      userId: session?.user?.id,
      userEmail: session?.user?.email,
      sessionWallet: sessionWalletAddress,
      requestFrom: forwardRequest.from,
    });

    if (sessionWalletAddress &&
        sessionWalletAddress.toLowerCase() !== forwardRequest.from.toLowerCase()) {
      console.error("[relay] Wallet mismatch - session belongs to different user", {
        sessionWallet: sessionWalletAddress,
        requestFrom: forwardRequest.from,
      });
      throw new Error("Session mismatch: Please reload the app to refresh your session");
    }

    const response = await fetch(RELAY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        operation,
        forwardRequest: {
          ...forwardRequest,
          value: forwardRequest.value.toString(),
          gas: forwardRequest.gas.toString(),
          nonce: forwardRequest.nonce, // Already a string
        },
        params,
      }),
    });

    // Check if response is JSON before parsing
    const contentType = response.headers.get("content-type");
    let result: any;

    if (contentType && contentType.includes("application/json")) {
      result = await response.json();
    } else {
      // Server returned non-JSON (likely HTML error page)
      const text = await response.text();
      console.error("[relay] Non-JSON response:", text.substring(0, 500));
      throw new Error(`Server error (${response.status}): ${response.statusText || "Service unavailable"}`);
    }

    console.log("[relay] Response:", {
      status: response.status,
      ok: response.ok,
      result,
    });

    if (!response.ok) {
      console.error("[relay] Request failed:", {
        status: response.status,
        error: result.error,
        fullResult: result,
      });
      throw new Error(result.error || `Request failed: ${response.status}`);
    }

    return result as RelayResponse;
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Approve USDC spending (GASLESS)
   * This approves unlimited spending - only needs to be done once
   */
  async approveUsdc(): Promise<RelayResponse> {
    console.log("[relay] Approving USDC for escrow contract...");

    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI);

    // Encode the approve call
    const data = usdc.interface.encodeFunctionData("approve", [
      ESCROW_CONTRACT_ADDRESS,
      ethers.MaxUint256,
    ]);

    const forwardRequest = await this.signForwardRequest(
      USDC_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.approveUsdc
    );

    return this.sendRelayRequest("approveUsdc", forwardRequest);
  }

  /**
   * Create a new game (GASLESS)
   *
   * @param gameId - Off-chain game UUID
   * @param wagerUsdc - Wager in USDC (e.g., "1.00")
   * @param timeoutSeconds - Game timeout (0 for default)
   */
  async createGame(
    gameId: string,
    wagerUsdc: string,
    timeoutSeconds: number = 0
  ): Promise<RelayResponse & { gameIdBytes?: string }> {
    console.log(`[relay] Creating game ${gameId} with ${wagerUsdc} USDC`);

    // Check user has enough balance
    const balance = await this.getUsdcBalance();
    if (parseFloat(balance) < parseFloat(wagerUsdc)) {
      throw new Error(`Insufficient USDC balance: have ${balance}, need ${wagerUsdc}`);
    }

    // Check allowance
    if (await this.needsApproval(wagerUsdc)) {
      throw new Error("Please approve USDC spending first (call approveUsdc)");
    }

    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI);

    // Convert game ID to bytes32 if not already
    // If gameId is already a bytes32 hash (66 chars: 0x + 64 hex), use it directly
    const gameIdBytes = gameId.startsWith('0x') && gameId.length === 66 ? gameId : ethers.id(gameId);
    const wagerAmount = parseUnits(wagerUsdc, 6);

    // Encode the createGame call
    const data = escrow.interface.encodeFunctionData("createGame", [
      gameIdBytes,
      wagerAmount,
      timeoutSeconds,
    ]);

    const forwardRequest = await this.signForwardRequest(
      ESCROW_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.createGame
    );

    const result = await this.sendRelayRequest("createGame", forwardRequest, {
      gameId,
      wagerUsdc,
      timeoutSeconds,
    });

    return { ...result, gameIdBytes };
  }

  /**
   * Create a new game with TCT wager (GASLESS)
   */
  async createGameWithTct(
    gameId: string,
    wagerTct: number,
    timeoutSeconds: number = 0
  ): Promise<RelayResponse & { gameIdBytes?: string }> {
    const wagerUsdc = tctToUsdc(wagerTct).toFixed(6);
    return this.createGameWithPermit(gameId, wagerUsdc, timeoutSeconds);
  }

  /**
   * Sign an EIP-2612 permit for USDC
   * Returns the permit signature components (v, r, s)
   */
  private async signPermit(
    spender: string,
    value: bigint,
    deadline: number
  ): Promise<{ v: number; r: string; s: string }> {
    if (!this.provider || !this.signer) throw new Error("Not initialized");

    const usdc = new Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, this.provider);

    // Get USDC permit nonce for this user
    const nonce = await usdc.nonces(this.userAddress);

    // Get USDC domain info
    const name = await usdc.name();
    let version: string;
    try {
      version = await usdc.version();
    } catch {
      version = "2"; // Default for USDC
    }

    // Domain for EIP-712 signing
    const domain = {
      name,
      version,
      chainId: CHAIN_ID,
      verifyingContract: USDC_CONTRACT_ADDRESS,
    };

    // Types for EIP-2612 Permit
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    // Message with proper types
    const message = {
      owner: this.userAddress,
      spender,
      value: value,
      nonce: nonce,
      deadline: BigInt(deadline),
    };

    console.log("[relay] Signing USDC permit with signTypedData:", {
      owner: this.userAddress,
      spender,
      value: value.toString(),
      nonce: nonce.toString(),
      deadline: deadline,
      domain,
    });

    // Use ethers native signTypedData
    const signature = await this.signer.signTypedData(domain, types, message);

    // Split signature into v, r, s
    const sig = ethers.Signature.from(signature);

    console.log("[relay] Permit signature:", {
      v: sig.v,
      r: sig.r.substring(0, 20) + "...",
      s: sig.s.substring(0, 20) + "...",
    });

    return { v: sig.v, r: sig.r, s: sig.s };
  }

  /**
   * Create a new game with permit (GASLESS, no pre-approval needed)
   *
   * Uses EIP-2612 permit to approve USDC and create game in one transaction.
   * This is the preferred method as it doesn't require a separate approval.
   *
   * @param gameId - Off-chain game UUID
   * @param wagerUsdc - Wager in USDC (e.g., "1.00")
   * @param timeoutSeconds - Game timeout (0 for default)
   */
  async createGameWithPermit(
    gameId: string,
    wagerUsdc: string,
    timeoutSeconds: number = 0
  ): Promise<RelayResponse & { gameIdBytes?: string }> {
    console.log(`[relay] Creating game with permit: ${gameId} with ${wagerUsdc} USDC`);

    // Check user has enough balance
    const balance = await this.getUsdcBalance();
    if (parseFloat(balance) < parseFloat(wagerUsdc)) {
      throw new Error(`Insufficient USDC balance: have ${balance}, need ${wagerUsdc}`);
    }

    const wagerAmount = parseUnits(wagerUsdc, 6);
    // Use longer deadline for permit to account for relay processing delays
    const permitDeadline = Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS;

    // Sign permit for escrow to spend USDC
    const { v, r, s } = await this.signPermit(
      ESCROW_CONTRACT_ADDRESS,
      wagerAmount,
      permitDeadline
    );

    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI);

    // Convert game ID to bytes32 if not already
    // If gameId is already a bytes32 hash (66 chars: 0x + 64 hex), use it directly
    const gameIdBytes = gameId.startsWith('0x') && gameId.length === 66 ? gameId : ethers.id(gameId);

    // Encode the createGameWithPermit call
    const data = escrow.interface.encodeFunctionData("createGameWithPermit", [
      gameIdBytes,
      wagerAmount,
      timeoutSeconds,
      permitDeadline,
      v,
      r,
      s,
    ]);

    const forwardRequest = await this.signForwardRequest(
      ESCROW_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.createGameWithPermit
    );

    const result = await this.sendRelayRequest("createGameWithPermit", forwardRequest, {
      gameId,
      wagerUsdc,
      timeoutSeconds,
    });

    return { ...result, gameIdBytes };
  }

  /**
   * Join an existing game (GASLESS)
   *
   * Requires prior USDC approval. Use joinGameWithPermit for no pre-approval.
   *
   * @param gameIdBytes - bytes32 game ID on chain
   */
  async joinGame(gameIdBytes: string): Promise<RelayResponse> {
    console.log(`[relay] Joining game ${gameIdBytes}`);

    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI);

    // Encode the joinGame call
    const data = escrow.interface.encodeFunctionData("joinGame", [gameIdBytes]);

    const forwardRequest = await this.signForwardRequest(
      ESCROW_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.joinGame
    );

    return this.sendRelayRequest("joinGame", forwardRequest);
  }

  /**
   * Join an existing game with permit (GASLESS, no pre-approval needed)
   *
   * Uses EIP-2612 permit to approve USDC and join game in one transaction.
   * This is the preferred method as it doesn't require a separate approval.
   *
   * @param gameIdBytes - bytes32 game ID on chain
   */
  async joinGameWithPermit(gameIdBytes: string): Promise<RelayResponse> {
    console.log(`[relay] Joining game with permit: ${gameIdBytes}`);

    // Get the game to know the wager amount
    const game = await this.getOnChainGame(gameIdBytes);
    if (!game) {
      return { success: false, error: "Game not found on-chain" };
    }

    const wagerAmount = parseUnits(game.wagerAmount, 6);

    // Check user has enough balance
    const balance = await this.getUsdcBalance();
    if (parseFloat(balance) < parseFloat(game.wagerAmount)) {
      return {
        success: false,
        error: `Insufficient USDC balance: have ${balance}, need ${game.wagerAmount}`
      };
    }

    // Use longer deadline for permit to account for relay processing delays
    const permitDeadline = Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS;

    // Sign permit for escrow to spend USDC
    const { v, r, s } = await this.signPermit(
      ESCROW_CONTRACT_ADDRESS,
      wagerAmount,
      permitDeadline
    );

    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI);

    // Encode the joinGameWithPermit call
    const data = escrow.interface.encodeFunctionData("joinGameWithPermit", [
      gameIdBytes,
      permitDeadline,
      v,
      r,
      s,
    ]);

    const forwardRequest = await this.signForwardRequest(
      ESCROW_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.joinGameWithPermit
    );

    return this.sendRelayRequest("joinGameWithPermit", forwardRequest);
  }

  /**
   * Cancel a game before opponent joins (GASLESS)
   *
   * @param gameIdBytes - bytes32 game ID on chain
   * @param escrowAddress - Optional custom escrow address (for migrating from old contracts)
   */
  async cancelGame(gameIdBytes: string, escrowAddress?: string): Promise<RelayResponse> {
    const targetEscrow = escrowAddress || ESCROW_CONTRACT_ADDRESS;
    console.log(`[relay] Cancelling game ${gameIdBytes} on escrow ${targetEscrow}`);

    const escrow = new Contract(targetEscrow, ESCROW_ABI);

    const data = escrow.interface.encodeFunctionData("cancelGame", [gameIdBytes]);

    const forwardRequest = await this.signForwardRequest(
      targetEscrow,
      data,
      GAS_LIMITS.cancelGame
    );

    return this.sendRelayRequest("cancelGame", forwardRequest);
  }

  /**
   * Cancel a game on the old escrow contract (for migration)
   * This is a convenience method for recovering stuck funds from the old contract.
   */
  async cancelGameOnOldEscrow(gameIdBytes: string): Promise<RelayResponse> {
    const OLD_ESCROW = "0x6e24927EFa2B4DB5654331Fb20312C9f59712501";
    return this.cancelGame(gameIdBytes, OLD_ESCROW);
  }

  /**
   * Claim victory due to opponent timeout (GASLESS)
   *
   * @param gameIdBytes - bytes32 game ID on chain
   */
  async claimTimeoutWin(gameIdBytes: string): Promise<RelayResponse> {
    console.log(`[relay] Claiming timeout win for ${gameIdBytes}`);

    const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI);

    const data = escrow.interface.encodeFunctionData("claimTimeoutWin", [gameIdBytes]);

    const forwardRequest = await this.signForwardRequest(
      ESCROW_CONTRACT_ADDRESS,
      data,
      GAS_LIMITS.claimTimeoutWin
    );

    return this.sendRelayRequest("claimTimeoutWin", forwardRequest);
  }

  /**
   * Approve USDC and create game in a single flow
   * Uses permit-based approach (EIP-2612) for atomic gasless approval + game creation
   *
   * NOTE: USDC does not support ERC2771, so we cannot use the forwarder for approve().
   * The ONLY gasless way to approve USDC is via EIP-2612 permit, which this method uses.
   */
  async approveAndCreateGame(
    gameId: string,
    wagerUsdc: string,
    timeoutSeconds: number = 0
  ): Promise<RelayResponse & { gameIdBytes?: string }> {
    console.log("[relay] Creating game with permit (atomic approval + create)...");

    try {
      return await this.createGameWithPermit(gameId, wagerUsdc, timeoutSeconds);
    } catch (permitError: any) {
      // Log the error for debugging
      console.error("[relay] createGameWithPermit failed:", permitError.message);

      // Provide a helpful error message
      const errorMsg = permitError.message || "Unknown error";

      // Check for common issues and provide helpful messages
      if (errorMsg.includes("Insufficient USDC")) {
        throw new Error(errorMsg);
      }

      if (errorMsg.includes("FailedCall") || errorMsg.includes("permit")) {
        throw new Error(
          `Failed to create game: Permit signature failed. This may be due to network issues. Please try again. (${errorMsg})`
        );
      }

      if (errorMsg.includes("InvalidWagerAmount")) {
        throw new Error("Wager amount must be between 1 and 10,000 USDC");
      }

      // Re-throw with original message for other errors
      throw permitError;
    }
  }

  /**
   * Pay house challenge entry fee to vault (GASLESS)
   *
   * Uses EIP-2612 permit to authorize backend to transfer USDC.
   * The backend then executes permit + transferFrom in one flow.
   *
   * @param amountTct - Entry fee in TCT
   * @param challengeId - House challenge ID
   * @param attemptId - Optional attempt ID
   */
  async payEntryFeeToVault(
    amountTct: number,
    challengeId: string,
    attemptId?: string
  ): Promise<RelayResponse> {
    console.log(`[relay] Paying entry fee to vault: ${amountTct} TCT for challenge ${challengeId}`);

    const amountUsdc = tctToUsdc(amountTct).toFixed(6);

    // Check user has enough balance
    const balance = await this.getUsdcBalance();
    if (parseFloat(balance) < parseFloat(amountUsdc)) {
      throw new Error(`Insufficient USDC balance: have ${balance}, need ${amountUsdc}`);
    }

    // Sign permit for backend signer to spend USDC
    const permitDeadline = Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS;
    const amount = parseUnits(amountUsdc, 6);

    const { v, r, s } = await this.signPermit(
      BACKEND_SIGNER_ADDRESS,
      amount,
      permitDeadline
    );

    console.log("[relay] Permit signed for backend signer:", {
      spender: BACKEND_SIGNER_ADDRESS,
      amount: amountUsdc,
      deadline: permitDeadline,
    });

    // Get session for authentication
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        throw new Error("Not authenticated - please log in again");
      }
      session = refreshData.session;
    }

    // Call the house entry fee endpoint
    const response = await fetch(HOUSE_ENTRY_FEE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        userAddress: this.userAddress,
        amountUsdc,
        challengeId,
        attemptId,
        permit: {
          deadline: permitDeadline,
          v,
          r,
          s,
        },
      }),
    });

    const result = await response.json();

    console.log("[relay] Entry fee collection response:", {
      status: response.status,
      ok: response.ok,
      result,
    });

    if (!response.ok) {
      throw new Error(result.error || `Entry fee collection failed: ${response.status}`);
    }

    return result as RelayResponse;
  }

  /**
   * Get on-chain game details
   */
  async getOnChainGame(gameIdBytes: string): Promise<{
    player1: string;
    player2: string;
    wagerAmount: string;
    totalPot: string;
    status: number;
    result: number;
  } | null> {
    if (!this.provider) throw new Error("Not initialized");

    try {
      const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, this.provider);
      const game = await escrow.getGame(gameIdBytes);

      return {
        player1: game.player1,
        player2: game.player2,
        wagerAmount: formatUnits(game.wagerAmount, 6),
        totalPot: formatUnits(game.totalPot, 6),
        status: Number(game.status),
        result: Number(game.result),
      };
    } catch (error) {
      console.error("[relay] Failed to get game:", error);
      return null;
    }
  }

  /**
   * Withdraw USDC to external wallet (GASLESS)
   *
   * Signs a permit allowing the backend to transfer USDC from user's wallet
   * to an external destination address. Platform takes 1% fee.
   *
   * @param amountUsdc - Amount to withdraw in USDC
   * @param destinationAddress - External wallet address to send to
   */
  async withdrawToExternal(
    amountUsdc: string,
    destinationAddress: string
  ): Promise<RelayResponse & { netAmountUsdc?: string; feeUsdc?: string }> {
    console.log(`[relay] Withdrawing ${amountUsdc} USDC to ${destinationAddress}`);

    // Check user has enough balance
    const balance = await this.getUsdcBalance();
    if (parseFloat(balance) < parseFloat(amountUsdc)) {
      throw new Error(`Insufficient USDC balance: have ${balance}, need ${amountUsdc}`);
    }

    // Sign permit for backend signer to spend USDC
    const permitDeadline = Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS;
    const amount = parseUnits(amountUsdc, 6);

    const { v, r, s } = await this.signPermit(
      BACKEND_SIGNER_ADDRESS,
      amount,
      permitDeadline
    );

    console.log("[relay] Permit signed for withdrawal:", {
      spender: BACKEND_SIGNER_ADDRESS,
      amount: amountUsdc,
      deadline: permitDeadline,
      destination: destinationAddress,
    });

    // Get session for authentication
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        throw new Error("Not authenticated - please log in again");
      }
      session = refreshData.session;
    }

    // Call the withdrawal endpoint
    const WITHDRAWAL_ENDPOINT =
      process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/process-withdrawal";

    const response = await fetch(WITHDRAWAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        userId: session.user.id,
        userAddress: this.userAddress,
        destinationAddress,
        amountUsdc,
        permit: {
          deadline: permitDeadline,
          v,
          r,
          s,
        },
      }),
    });

    const result = await response.json();

    console.log("[relay] Withdrawal response:", {
      status: response.status,
      ok: response.ok,
      result,
    });

    if (!response.ok) {
      throw new Error(result.error || `Withdrawal failed: ${response.status}`);
    }

    return result as RelayResponse & { netAmountUsdc?: string; feeUsdc?: string };
  }

  /**
   * Check for stuck escrow funds for a wallet address
   * Scans V2 escrow contract for games where the user has funds locked
   * Returns the total claimable amount and list of stuck games
   */
  async checkStuckEscrowFunds(walletAddress?: string): Promise<{
    totalClaimableUsdc: number;
    totalClaimableTct: number;
    stuckGames: Array<{
      gameId: string;
      escrowAddress: string;
      wagerUsdc: number;
      status: string;
      isPlayer1: boolean;
      canCancel: boolean; // True if user can cancel this game
    }>;
  }> {
    const address = walletAddress || this.userAddress;
    if (!address) {
      return { totalClaimableUsdc: 0, totalClaimableTct: 0, stuckGames: [] };
    }

    // Create a read-only provider for scanning
    const rpcUrl = process.env.EXPO_PUBLIC_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const GAME_CREATED_TOPIC = ethers.id("GameCreated(bytes32,address,uint256,uint256)");

    const stuckGames: Array<{
      gameId: string;
      escrowAddress: string;
      wagerUsdc: number;
      status: string;
      isPlayer1: boolean;
      canCancel: boolean;
    }> = [];

    const iface = new ethers.Interface([
      "event GameCreated(bytes32 indexed gameId, address indexed player1, uint256 wagerAmount, uint256 timeoutSeconds)"
    ]);

    const statusNames = ["None", "WaitingForOpponent", "Active", "Completed", "Cancelled", "Disputed"];

    try {
      const escrow = new Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, provider);

      // Get current block
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000); // Scan last 100k blocks

      // Get all GameCreated events
      const logs = await provider.getLogs({
        address: ESCROW_CONTRACT_ADDRESS,
        topics: [GAME_CREATED_TOPIC],
        fromBlock,
        toBlock: currentBlock
      });

      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;

          const gameId = parsed.args.gameId;

          // Check if this game involves our wallet
          const game = await escrow.getGame(gameId);
          const status = Number(game.status);

          const isPlayer1 = game.player1.toLowerCase() === address.toLowerCase();
          const isPlayer2 = game.player2.toLowerCase() === address.toLowerCase();

          if (!isPlayer1 && !isPlayer2) continue;

          // Only interested in non-completed games
          // Status: 1 = WaitingForOpponent, 2 = Active, 5 = Disputed
          if (status === 1 || status === 2 || status === 5) {
            const wagerUsdc = parseFloat(formatUnits(game.wagerAmount, 6));

            // Only WaitingForOpponent games can be cancelled, and only by player1
            const canCancel = status === 1 && isPlayer1;

            stuckGames.push({
              gameId,
              escrowAddress: ESCROW_CONTRACT_ADDRESS,
              wagerUsdc,
              status: statusNames[status] || `Unknown(${status})`,
              isPlayer1,
              canCancel,
            });
          }
        } catch {
          // Skip individual game errors
        }
      }
    } catch (error) {
      console.error(`[relay] Error scanning escrow:`, error);
    }

    // Calculate totals - only count games that can actually be cancelled
    let totalClaimableUsdc = 0;
    for (const game of stuckGames) {
      if (game.canCancel) {
        // Only WaitingForOpponent games where user is player1 can be cancelled
        totalClaimableUsdc += game.wagerUsdc;
      }
      // Note: Active/Disputed games have locked funds but cannot be claimed by the user
      // They need to be resolved through normal game completion or admin intervention
    }

    return {
      totalClaimableUsdc,
      totalClaimableTct: Math.floor(usdcToTct(totalClaimableUsdc)),
      stuckGames,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let relaySDK: RelaySDK | null = null;

export function getRelaySDK(): RelaySDK {
  if (!relaySDK) {
    relaySDK = new RelaySDK();
  }
  return relaySDK;
}

export function resetRelaySDK(): void {
  relaySDK = null;
}

// ============================================================================
// React Hook
// ============================================================================

import { useState, useEffect, useCallback } from "react";

export interface UseRelayResult {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  address: string | null;
  usdcBalance: string | null;
  tctBalance: number | null;
  needsApproval: boolean;
  initialize: (walletProvider: any) => Promise<void>;
  approveUsdc: () => Promise<RelayResponse>;
  createGame: (
    gameId: string,
    wagerUsdc: string,
    timeoutSeconds?: number
  ) => Promise<RelayResponse & { gameIdBytes?: string }>;
  joinGame: (gameIdBytes: string) => Promise<RelayResponse>;
  cancelGame: (gameIdBytes: string, escrowAddress?: string) => Promise<RelayResponse>;
  cancelGameOnOldEscrow: (gameIdBytes: string) => Promise<RelayResponse>;
  claimTimeoutWin: (gameIdBytes: string) => Promise<RelayResponse>;
  refreshBalance: () => Promise<void>;
}

export function useRelay(): UseRelayResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [tctBalance, setTctBalance] = useState<number | null>(null);
  const [needsApproval, setNeedsApproval] = useState(true);

  const initialize = useCallback(async (walletProvider: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const sdk = getRelaySDK();
      const addr = await sdk.initialize(walletProvider);
      setAddress(addr);
      setIsInitialized(true);

      // Fetch balance and approval status
      const balance = await sdk.getUsdcBalance();
      setUsdcBalance(balance);
      setTctBalance(Math.floor(usdcToTct(parseFloat(balance))));

      const needs = await sdk.needsApproval("1"); // Check if can spend at least 1 USDC
      setNeedsApproval(needs);
    } catch (err: any) {
      setError(err.message || "Failed to initialize");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!isInitialized) return;

    try {
      const sdk = getRelaySDK();
      const balance = await sdk.getUsdcBalance();
      setUsdcBalance(balance);
      setTctBalance(Math.floor(usdcToTct(parseFloat(balance))));

      const needs = await sdk.needsApproval("1");
      setNeedsApproval(needs);
    } catch (err: any) {
      console.error("[relay] Failed to refresh balance:", err);
    }
  }, [isInitialized]);

  const approveUsdc = useCallback(async (): Promise<RelayResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const sdk = getRelaySDK();
      const result = await sdk.approveUsdc();

      if (result.success) {
        setNeedsApproval(false);
      } else {
        setError(result.error || "Approval failed");
      }

      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Approval failed";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGame = useCallback(
    async (
      gameId: string,
      wagerUsdc: string,
      timeoutSeconds: number = 0
    ): Promise<RelayResponse & { gameIdBytes?: string }> => {
      setIsLoading(true);
      setError(null);

      try {
        const sdk = getRelaySDK();
        const result = await sdk.createGame(gameId, wagerUsdc, timeoutSeconds);

        if (!result.success) {
          setError(result.error || "Failed to create game");
        } else {
          // Refresh balance after game creation
          await refreshBalance();
        }

        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to create game";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBalance]
  );

  const joinGame = useCallback(
    async (gameIdBytes: string): Promise<RelayResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const sdk = getRelaySDK();
        const result = await sdk.joinGame(gameIdBytes);

        if (!result.success) {
          setError(result.error || "Failed to join game");
        } else {
          await refreshBalance();
        }

        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to join game";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBalance]
  );

  const cancelGame = useCallback(
    async (gameIdBytes: string): Promise<RelayResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const sdk = getRelaySDK();
        const result = await sdk.cancelGame(gameIdBytes);

        if (!result.success) {
          setError(result.error || "Failed to cancel game");
        } else {
          await refreshBalance();
        }

        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to cancel game";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBalance]
  );

  const claimTimeoutWin = useCallback(
    async (gameIdBytes: string): Promise<RelayResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const sdk = getRelaySDK();
        const result = await sdk.claimTimeoutWin(gameIdBytes);

        if (!result.success) {
          setError(result.error || "Failed to claim timeout win");
        } else {
          await refreshBalance();
        }

        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to claim timeout win";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBalance]
  );

  const cancelGameOnOldEscrow = useCallback(
    async (gameIdBytes: string): Promise<RelayResponse> => {
      setIsLoading(true);
      setError(null);

      try {
        const sdk = getRelaySDK();
        const result = await sdk.cancelGameOnOldEscrow(gameIdBytes);

        if (!result.success) {
          setError(result.error || "Failed to cancel game on old escrow");
        } else {
          await refreshBalance();
        }

        return result;
      } catch (err: any) {
        const errorMsg = err.message || "Failed to cancel game on old escrow";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBalance]
  );

  return {
    isInitialized,
    isLoading,
    error,
    address,
    usdcBalance,
    tctBalance,
    needsApproval,
    initialize,
    approveUsdc,
    createGame,
    joinGame,
    cancelGame,
    cancelGameOnOldEscrow,
    claimTimeoutWin,
    refreshBalance,
  };
}
