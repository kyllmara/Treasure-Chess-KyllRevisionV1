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

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const USDC_CONTRACT = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'; // Amoy USDC
const FORWARDER_ADDRESS = '0x566124d8E8fC86CE44856D8D88dE71Ab86847230';
const PLATFORM_WALLET = '0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b';
const USER_WALLET = '0xD578a74591eb4FdD8e637255403A91c243B8e5Fa'; // From error
const RPC_URL = 'https://rpc-amoy.polygon.technology';

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);

  console.log('=== Balance Check for Escrow Creation ===\n');

  // Check user USDC balance
  const userUsdcBalance = await usdc.balanceOf(USER_WALLET);
  console.log('User Wallet:', USER_WALLET);
  console.log('User USDC Balance:', Number(userUsdcBalance) / 1e6, 'USDC');

  // Check user USDC allowance for escrow
  const userAllowanceEscrow = await usdc.allowance(USER_WALLET, ESCROW_CONTRACT);
  console.log('User USDC Allowance (Escrow):', Number(userAllowanceEscrow) / 1e6, 'USDC');

  // Check user USDC allowance for forwarder
  const userAllowanceForwarder = await usdc.allowance(USER_WALLET, FORWARDER_ADDRESS);
  console.log('User USDC Allowance (Forwarder):', Number(userAllowanceForwarder) / 1e6, 'USDC');

  // Check platform wallet MATIC balance (for gas)
  const platformMaticBalance = await provider.getBalance(PLATFORM_WALLET);
  console.log('\nPlatform Wallet:', PLATFORM_WALLET);
  console.log('Platform MATIC Balance:', ethers.formatEther(platformMaticBalance), 'MATIC');

  // Check escrow contract USDC balance
  const escrowUsdcBalance = await usdc.balanceOf(ESCROW_CONTRACT);
  console.log('\nEscrow Contract:', ESCROW_CONTRACT);
  console.log('Escrow USDC Balance:', Number(escrowUsdcBalance) / 1e6, 'USDC');

  // Expected wager from error: 0x000493e0 = 300000 = 0.3 USDC
  console.log('\n=== Analysis ===');
  const expectedWager = 0.3; // Decoded from transaction data
  console.log('Expected wager:', expectedWager, 'USDC (300000 units with 6 decimals)');

  if (Number(userUsdcBalance) / 1e6 < expectedWager) {
    console.log('PROBLEM: User has insufficient USDC balance!');
  } else if (Number(userAllowanceEscrow) / 1e6 < expectedWager) {
    console.log('PROBLEM: User has not approved enough USDC for escrow contract!');
  } else if (Number(platformMaticBalance) < ethers.parseEther("0.01")) {
    console.log('PROBLEM: Platform wallet has insufficient MATIC for gas!');
  } else {
    console.log('Balances look OK - issue might be with signature or contract state');
  }
}

check().catch(console.error);
