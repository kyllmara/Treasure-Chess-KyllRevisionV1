const { ethers } = require('ethers');

const ESCROW_CONTRACT = '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://polygon-bor.publicnode.com';
const OWNER_PRIVATE_KEY = '376d3b2c0a8efe92cd566ccd4c7a042a27a0a8e5283d00eab21ace3c015ab7d9';
const NEW_PLATFORM_VAULT = '0xf0f60aaa8e0d5055FD1590F7D4bcaac1C180F03b';

const ABI = [
  "function setPlatformVault(address _newVault)",
  "function platformVault() view returns (address)",
  "function owner() view returns (address)"
];

async function setVault() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(ESCROW_CONTRACT, ABI, wallet);
  
  console.log('Wallet address:', wallet.address);
  console.log('Contract:', ESCROW_CONTRACT);
  console.log('New Platform Vault:', NEW_PLATFORM_VAULT);
  
  // Check if we're the owner
  try {
    const owner = await contract.owner();
    console.log('Contract owner:', owner);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error('ERROR: Wallet is not the owner of the contract!');
      return;
    }
    
    // Check current vault
    const currentVault = await contract.platformVault();
    console.log('Current Platform Vault:', currentVault);
    
    if (currentVault.toLowerCase() === NEW_PLATFORM_VAULT.toLowerCase()) {
      console.log('Platform vault is already set to the desired address.');
      return;
    }
    
    // Update the vault
    console.log('\nUpdating platform vault...');
    const tx = await contract.setPlatformVault(NEW_PLATFORM_VAULT);
    console.log('Transaction hash:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    
    // Verify
    const newVault = await contract.platformVault();
    console.log('New Platform Vault (verified):', newVault);
  } catch (e) {
    console.error('Error:', e.message);
    if (e.code === 'BAD_DATA') {
      console.log('Contract may not be deployed at this address or is a different version.');
    }
  }
}

setVault();
