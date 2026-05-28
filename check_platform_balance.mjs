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

const PLATFORM_WALLET = '0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b';
const RPC_URL = 'https://rpc-amoy.polygon.technology';

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  console.log('=== Platform Wallet Check ===\n');
  
  // Check MATIC balance
  const maticBalance = await provider.getBalance(PLATFORM_WALLET);
  console.log('Platform Wallet:', PLATFORM_WALLET);
  console.log('MATIC Balance:', ethers.formatEther(maticBalance), 'MATIC');
  console.log('MATIC Balance (wei):', maticBalance.toString());

  // Check gas price
  const feeData = await provider.getFeeData();
  console.log('\n=== Current Gas Prices ===');
  console.log('Gas Price:', ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'), 'gwei');
  console.log('Max Fee Per Gas:', ethers.formatUnits(feeData.maxFeePerGas || 0n, 'gwei'), 'gwei');
  console.log('Max Priority Fee:', ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, 'gwei'), 'gwei');

  // Calculate cost for a typical transaction
  const estimatedGas = 350000n; // Typical gas for createGameWithPermit
  const estimatedCost = (feeData.gasPrice || 0n) * estimatedGas;
  console.log('\n=== Estimated Transaction Cost ===');
  console.log('Gas needed for createGameWithPermit:', estimatedGas.toString());
  console.log('Estimated cost:', ethers.formatEther(estimatedCost), 'MATIC');
  
  if (maticBalance < estimatedCost) {
    console.log('\n❌ PROBLEM: Platform wallet has INSUFFICIENT MATIC!');
    console.log('Need:', ethers.formatEther(estimatedCost), 'MATIC');
    console.log('Have:', ethers.formatEther(maticBalance), 'MATIC');
    console.log('Shortfall:', ethers.formatEther(estimatedCost - maticBalance), 'MATIC');
  } else {
    console.log('\n✅ Platform wallet has sufficient MATIC');
  }
}

check().catch(console.error);
