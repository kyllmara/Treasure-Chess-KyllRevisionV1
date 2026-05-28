import { ethers } from 'ethers';

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const EXPECTED_VAULT = '0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b';
const USDC_CONTRACT = '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'; // Amoy USDC
const RPC_URL = 'https://rpc-amoy.polygon.technology';

const ESCROW_ABI = [
  "function platformVault() view returns (address)",
  "function PLATFORM_FEE_BPS() view returns (uint256)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const escrow = new ethers.Contract(ESCROW_CONTRACT, ESCROW_ABI, provider);
  const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
  
  try {
    const [platformVault, feeBps] = await Promise.all([
      escrow.platformVault(),
      escrow.PLATFORM_FEE_BPS().catch(() => 'N/A')
    ]);
    
    const vaultBalance = await usdc.balanceOf(platformVault);
    const expectedVaultBalance = await usdc.balanceOf(EXPECTED_VAULT);
    
    console.log('=== Contract Settings ===');
    console.log('Escrow Contract:', ESCROW_CONTRACT);
    console.log('Platform Vault (on contract):', platformVault);
    console.log('Expected Vault:', EXPECTED_VAULT);
    console.log('Match:', platformVault.toLowerCase() === EXPECTED_VAULT.toLowerCase() ? 'YES' : 'NO');
    console.log('Platform Fee BPS:', feeBps.toString());
    console.log('');
    console.log('=== USDC Balances ===');
    console.log('Vault on contract balance:', Number(vaultBalance) / 1e6, 'USDC');
    console.log('Expected vault balance:', Number(expectedVaultBalance) / 1e6, 'USDC');
  } catch (e) {
    console.error('Error:', e.message);
  }
}

check();
