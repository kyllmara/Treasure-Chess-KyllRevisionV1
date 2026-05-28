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

const USDC_CONTRACT = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'; // Amoy USDC
const RPC_URL = 'https://rpc-amoy.polygon.technology';

const ERC20_WITH_PERMIT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function nonces(address) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function version() view returns (string)"
];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_WITH_PERMIT_ABI, provider);

  console.log('=== USDC Contract Check ===\n');
  console.log('Contract Address:', USDC_CONTRACT);

  try {
    const [name, symbol, decimals] = await Promise.all([
      usdc.name(),
      usdc.symbol(),
      usdc.decimals()
    ]);
    console.log('Name:', name);
    console.log('Symbol:', symbol);
    console.log('Decimals:', decimals);
  } catch (e) {
    console.log('Basic token info failed:', e.message);
  }

  console.log('\n=== EIP-2612 Permit Support Check ===\n');

  let hasNonces = false;
  let hasDomainSeparator = false;

  // Check for nonces function (required for permit)
  try {
    const nonce = await usdc.nonces('0x0000000000000000000000000000000000000001');
    console.log('✅ nonces() function exists. Value:', nonce.toString());
    hasNonces = true;
  } catch (e) {
    console.log('❌ nonces() function NOT available');
  }

  // Check for DOMAIN_SEPARATOR function (required for permit)
  try {
    const domainSeparator = await usdc.DOMAIN_SEPARATOR();
    console.log('✅ DOMAIN_SEPARATOR() exists. Value:', domainSeparator.substring(0, 20) + '...');
    hasDomainSeparator = true;
  } catch (e) {
    console.log('❌ DOMAIN_SEPARATOR() NOT available');
  }

  // Check for version function
  try {
    const version = await usdc.version();
    console.log('✅ version() exists. Value:', version);
  } catch (e) {
    console.log('❌ version() NOT available (using default "2")');
  }

  console.log('\n=== Conclusion ===');
  if (hasNonces && hasDomainSeparator) {
    console.log('This USDC contract SUPPORTS EIP-2612 permit');
  } else {
    console.log('This USDC contract does NOT support EIP-2612 permit!');
    console.log('You need to use traditional approve() instead.');
  }
}

check().catch(console.error);
