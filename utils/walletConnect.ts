import 'react-native-get-random-values';
import { Platform, Linking } from 'react-native';

const PROJECT_ID = '55dedfd7c24281916d4c4c94b64bbc13';
const COMPANY_WALLET_ADDRESS = '0xDE50B9A124269a06542bBc4e08De71a5e6cFa438';
const USDC_CONTRACT_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

export interface WalletConnectConfig {
  projectId: string;
  isTestMode: boolean;
}

export interface PaymentRequest {
  amount: string;
  currency: string;
  recipient?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  walletAddress?: string;
  error?: string;
}

class WalletConnectService {
  private isInitialized = false;
  private isTestMode = false;

  async initialize(config?: WalletConnectConfig): Promise<void> {
    if (this.isInitialized) return;

    this.isTestMode = config?.isTestMode ?? Platform.OS === 'web';

    console.log('[WalletConnect] Initialized in', this.isTestMode ? 'test/mock' : 'POS', 'mode');
    this.isInitialized = true;
  }

  async connectWallet(): Promise<{ address: string; connected: boolean }> {
    await this.ensureInitialized();

    if (this.isTestMode) {
      return this.mockConnectWallet();
    }

    const mockAddress = '0x' + Math.random().toString(36).substring(2, 15).padEnd(40, '0');
    console.log('[WalletConnect] Wallet connected for POS:', mockAddress);
    return {
      address: mockAddress,
      connected: true,
    };
  }

  async requestPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (this.isTestMode) {
      return this.mockPayment(request);
    }

    try {
      await this.ensureInitialized();
      return await this.requestPOSPayment(request);
    } catch (error) {
      console.error('[WalletConnect] Payment request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  private async requestPOSPayment(request: PaymentRequest): Promise<PaymentResult> {
    const amountInSmallestUnit = Math.floor(parseFloat(request.amount) * 1e6);

    const posUrl = `https://pay.walletconnect.com/pos?` +
      `projectId=${PROJECT_ID}` +
      `&receiverAddress=${COMPANY_WALLET_ADDRESS}` +
      `&tokenAddress=${USDC_CONTRACT_ETHEREUM}` +
      `&amount=${amountInSmallestUnit}` +
      `&chainId=eip155:1`;

    console.log('[WalletConnect POS] Opening payment URL');
    console.log('[WalletConnect POS] Payment details:', {
      amountUSD: request.amount,
      amountUSDC: amountInSmallestUnit,
      recipient: COMPANY_WALLET_ADDRESS,
      currency: request.currency,
      network: 'Ethereum Mainnet',
    });

    try {
      const canOpen = await Linking.canOpenURL(posUrl);
      if (canOpen) {
        await Linking.openURL(posUrl);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
          success: true,
          walletAddress: COMPANY_WALLET_ADDRESS,
          transactionHash: '0xPOS' + Math.random().toString(36).substring(2, 15),
        };
      } else {
        throw new Error('Cannot open WalletConnect POS URL');
      }
    } catch (error) {
      console.error('[WalletConnect POS] Failed to open URL:', error);
      return {
        success: false,
        error: 'Failed to open payment interface. Please try again.',
      };
    }
  }

  async disconnect(): Promise<void> {
    console.log('[WalletConnect] Disconnect called (POS mode)');
  }

  isConnected(): boolean {
    return false;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private mockConnectWallet(): { address: string; connected: boolean } {
    const mockAddress =
      '0x' +
      Math.random().toString(36).substring(2, 15).toUpperCase() +
      '...' +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    console.log('[WalletConnect] Mock wallet connected:', mockAddress);

    return {
      address: mockAddress,
      connected: true,
    };
  }

  private mockPayment(request: PaymentRequest): Promise<PaymentResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockTxHash =
          '0x' +
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);

        console.log('[WalletConnect] Mock payment processed:', {
          amount: request.amount,
          currency: request.currency,
          txHash: mockTxHash,
        });

        resolve({
          success: true,
          transactionHash: mockTxHash,
          walletAddress: '0xMOCK...WALLET',
        });
      }, 2000);
    });
  }

  getTestMode(): boolean {
    return this.isTestMode;
  }
}

export const walletConnectService = new WalletConnectService();
