/**
 * Supported Chain Definitions for Cross-Chain Withdrawals
 *
 * Defines chains available for external USDC withdrawals via LI.FI bridge.
 * Includes address validation, USDC contract addresses, and block explorers.
 */

export interface ChainDefinition {
  chainId: number;
  name: string;
  shortName: string;
  nativeToken: string;
  color: string;
  usdcAddress: string;
  addressRegex: RegExp;
  addressPlaceholder: string;
  explorerUrl: string;
  explorerTxPath: string;
  isEvm: boolean;
}

// Polygon is the source chain (where user funds live)
export const SOURCE_CHAIN_ID = 137;

export const SUPPORTED_CHAINS: ChainDefinition[] = [
  {
    chainId: 137,
    name: "Polygon",
    shortName: "POL",
    nativeToken: "POL",
    color: "#8247E5",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://polygonscan.com",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 1,
    name: "Ethereum",
    shortName: "ETH",
    nativeToken: "ETH",
    color: "#627EEA",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://etherscan.io",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 8453,
    name: "Base",
    shortName: "BASE",
    nativeToken: "ETH",
    color: "#0052FF",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://basescan.org",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 42161,
    name: "Arbitrum One",
    shortName: "ARB",
    nativeToken: "ETH",
    color: "#28A0F0",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://arbiscan.io",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 10,
    name: "Optimism",
    shortName: "OP",
    nativeToken: "ETH",
    color: "#FF0420",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://optimistic.etherscan.io",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 43114,
    name: "Avalanche",
    shortName: "AVAX",
    nativeToken: "AVAX",
    color: "#E84142",
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://snowtrace.io",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 56,
    name: "BNB Chain",
    shortName: "BSC",
    nativeToken: "BNB",
    color: "#F0B90B",
    usdcAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    addressPlaceholder: "0x...",
    explorerUrl: "https://bscscan.com",
    explorerTxPath: "/tx/",
    isEvm: true,
  },
  {
    chainId: 1151111081099710,
    name: "Solana",
    shortName: "SOL",
    nativeToken: "SOL",
    color: "#9945FF",
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    addressRegex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    addressPlaceholder: "Solana address...",
    explorerUrl: "https://solscan.io",
    explorerTxPath: "/tx/",
    isEvm: false,
  },
];

/**
 * Get chain definition by chain ID
 */
export function getChainById(chainId: number): ChainDefinition | undefined {
  return SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
}

/**
 * Validate an address for a specific chain
 */
export function validateAddress(address: string, chainId: number): boolean {
  const chain = getChainById(chainId);
  if (!chain) return false;
  return chain.addressRegex.test(address);
}

/**
 * Get the block explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string, chainId: number): string {
  const chain = getChainById(chainId);
  if (!chain) return "";
  return `${chain.explorerUrl}${chain.explorerTxPath}${txHash}`;
}

/**
 * Check if a chain is the source chain (Polygon) — same-chain transfer
 */
export function isSameChain(chainId: number): boolean {
  return chainId === SOURCE_CHAIN_ID;
}
