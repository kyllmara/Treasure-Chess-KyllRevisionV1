import { ethers } from 'ethers';

const ESCROW_CONTRACT = process.env.ESCROW_CONTRACT_ADDRESS || '0x3D5913e5dA32bE82cc5D659ce69835C5368571Bc';
const RPC_URL = 'https://polygon-mainnet.g.alchemy.com/v2/demo';

const ABI = [
  "function platformVault() view returns (address)",
  "function backendSigner() view returns (address)",
  "function owner() view returns (address)"
];

async function check() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(ESCROW_CONTRACT, ABI, provider);
  
  try {
    const [platformVault, backendSigner, owner] = await Promise.all([
      contract.platformVault(),
      contract.backendSigner(),
      contract.owner()
    ]);
    
    console.log('Contract:', ESCROW_CONTRACT);
    console.log('Platform Vault (rake recipient):', platformVault);
    console.log('Backend Signer:', backendSigner);
    console.log('Owner:', owner);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

check();
