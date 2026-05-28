import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Wallet, Check, Copy, ExternalLink } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { useUserStore } from '@/stores/userStore';

// Configuration from environment
const USDC_CONTRACT = process.env.EXPO_PUBLIC_USDC_CONTRACT || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = process.env.EXPO_PUBLIC_CHAIN_ID || '8453';

// Network info
const NETWORK_NAME = 'Base';
const BLOCK_EXPLORER = 'https://basescan.org';

interface ConnectWalletModalProps {
  visible: boolean;
  onClose: () => void;
  depositAmount?: number; // USD amount selected for deposit
  onTransactionComplete?: (txHash: string, amount: number) => void;
}

export function ConnectWalletModal({
  visible,
  onClose,
  depositAmount,
  onTransactionComplete,
}: ConnectWalletModalProps) {
  const { user, isAuthenticated } = useAuth();
  const profile = useUserStore((state) => state.profile);
  const [addressCopied, setAddressCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Get the user's Magic Link wallet address from auth context or profile (Supabase)
  const userWalletAddress = user?.walletAddress || profile?.embeddedWalletAddress || '';

  const handleCopyAddress = async () => {
    if (!userWalletAddress) {
      Alert.alert('Error', 'No wallet address found. Please sign in first.');
      return;
    }
    await Clipboard.setStringAsync(userWalletAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  // Open MetaMask to send USDC to user's wallet
  // Uses metamask:// scheme for direct app opening on mobile
  const handleMetaMaskDeepLink = async () => {
    if (!userWalletAddress) {
      Alert.alert('Error', 'No wallet address found. Please sign in first.');
      return;
    }

    setIsLoading(true);

    try {
      // Try multiple MetaMask deep link formats
      // Format 1: Direct metamask:// scheme (most reliable for mobile)
      // Format 2: Universal link with proper ERC-20 transfer params

      // USDC has 6 decimals, so 1 USDC = 1000000 (1e6)
      // Use the deposit amount if provided, otherwise default to 1 USDC
      const usdcAmount = depositAmount ? Math.round(depositAmount * 1000000) : 1000000;
      const displayAmount = depositAmount ? `$${depositAmount}` : '$1';
      const usdcAmountStr = usdcAmount.toString();

      // Try the universal link format first (works when MetaMask is installed)
      // Per MetaMask docs: https://link.metamask.io/send/{tokenAddress}@{chainId}/transfer?address={to}&uint256={amount}
      const universalLink = `https://link.metamask.io/send/${USDC_CONTRACT}@${CHAIN_ID}/transfer?address=${userWalletAddress}&uint256=${usdcAmountStr}`;

      // Alternative: Direct scheme that opens MetaMask app
      const metamaskScheme = `metamask://send/${USDC_CONTRACT}@${CHAIN_ID}/transfer?address=${userWalletAddress}&uint256=${usdcAmountStr}`;

      console.log('[MetaMask] Trying to open MetaMask with amount:', usdcAmountStr);

      // First try the metamask:// scheme (more reliable on iOS when app is installed)
      // Wrap in try-catch because canOpenURL throws if scheme not in LSApplicationQueriesSchemes
      let canOpenScheme = false;
      try {
        canOpenScheme = await Linking.canOpenURL(metamaskScheme);
      } catch (e) {
        console.log('[MetaMask] Cannot check metamask:// scheme (not in LSApplicationQueriesSchemes)');
      }

      if (canOpenScheme) {
        console.log('[MetaMask] Opening via metamask:// scheme');
        await Linking.openURL(metamaskScheme);

        Alert.alert(
          'MetaMask Opened',
          `Transaction pre-filled for ${displayAmount} USDC.\n\nConfirm the transfer in MetaMask.\n\nYour TCT balance will be credited automatically (1 USDC = 25 TCT).`,
          [{ text: 'OK' }]
        );
        onTransactionComplete?.('pending', depositAmount || 0);
        return;
      }

      // Fallback to universal link (https:// links don't need LSApplicationQueriesSchemes)
      console.log('[MetaMask] Trying universal link:', universalLink);
      const canOpenUniversal = await Linking.canOpenURL(universalLink);
      if (canOpenUniversal) {
        console.log('[MetaMask] Opening via universal link');
        await Linking.openURL(universalLink);

        Alert.alert(
          'MetaMask Opened',
          `Transaction pre-filled for ${displayAmount} USDC.\n\nConfirm the transfer in MetaMask.\n\nYour TCT balance will be credited automatically (1 USDC = 25 TCT).`,
          [{ text: 'OK' }]
        );
        onTransactionComplete?.('pending', depositAmount || 0);
        return;
      }

      // If neither works, offer to install MetaMask or copy address
      const storeUrl = Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/metamask/id1438144202'
        : 'https://play.google.com/store/apps/details?id=io.metamask';

      Alert.alert(
        'MetaMask Not Found',
        'MetaMask app is required. You can install it or copy the address to send manually.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Copy Address',
            onPress: async () => {
              await Clipboard.setStringAsync(userWalletAddress);
              setAddressCopied(true);
              setTimeout(() => setAddressCopied(false), 2000);
              Alert.alert('Copied!', 'Wallet address copied to clipboard.');
            }
          },
          { text: 'Install MetaMask', onPress: () => Linking.openURL(storeUrl) },
        ]
      );
    } catch (error) {
      console.error('[MetaMask] Error:', error);
      Alert.alert(
        'Unable to Open MetaMask',
        'Please copy the wallet address and send USDC manually from MetaMask.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Copy Address',
            onPress: async () => {
              await Clipboard.setStringAsync(userWalletAddress);
              setAddressCopied(true);
              setTimeout(() => setAddressCopied(false), 2000);
            }
          },
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Generic wallet connection - opens a QR code / universal link approach
  // For now, shows instructions to manually send from any wallet
  const handleConnectAnyWallet = async () => {
    if (!userWalletAddress) {
      Alert.alert('Error', 'No wallet address found. Please sign in first.');
      return;
    }

    // Copy address to clipboard and show instructions
    await Clipboard.setStringAsync(userWalletAddress);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 3000);

    Alert.alert(
      'Address Copied!',
      `Your wallet address has been copied.\n\nOpen your preferred wallet app (Rainbow, Trust, Coinbase, etc.) and send USDC on ${NETWORK_NAME} to:\n\n${userWalletAddress.substring(0, 10)}...${userWalletAddress.substring(userWalletAddress.length - 8)}\n\nYour TCT balance will be credited automatically.`,
      [{ text: 'OK' }]
    );
  };

  // View wallet on block explorer
  const handleViewOnExplorer = () => {
    if (!userWalletAddress) return;
    Linking.openURL(`${BLOCK_EXPLORER}/address/${userWalletAddress}`);
  };

  if (!userWalletAddress) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Deposit Crypto</Text>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                Please sign in to view your wallet address.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Deposit USDC</Text>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Your Wallet Section */}
            <View style={styles.walletSection}>
              <View style={styles.sectionHeader}>
                <Wallet size={20} color="#FFD700" />
                <Text style={styles.sectionTitle}>Your Treasure Chess Wallet</Text>
              </View>
              <Text style={styles.sectionDescription}>
                Send USDC from your external wallet (MetaMask, Phantom, etc.) to this address:
              </Text>

              {/* Wallet Address Display */}
              <View style={styles.addressContainer}>
                <Text style={styles.addressLabel}>Wallet Address ({NETWORK_NAME})</Text>
                <View style={styles.addressBox}>
                  <Text style={styles.addressText} selectable>
                    {userWalletAddress}
                  </Text>
                </View>

                <View style={styles.addressActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleCopyAddress}
                  >
                    <LinearGradient
                      colors={addressCopied ? ['#4ECDC4', '#44A08D'] : ['#FFD700', '#FFA500']}
                      style={styles.actionButtonGradient}
                    >
                      {addressCopied ? (
                        <Check size={18} color="#0F0F1E" />
                      ) : (
                        <Copy size={18} color="#0F0F1E" />
                      )}
                      <Text style={styles.actionButtonText}>
                        {addressCopied ? 'Copied!' : 'Copy Address'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.explorerButton}
                    onPress={handleViewOnExplorer}
                  >
                    <ExternalLink size={16} color="#888" />
                    <Text style={styles.explorerButtonText}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or connect wallet to transfer</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Quick Connect Options */}
            <View style={styles.connectSection}>
              <Text style={styles.connectDescription}>
                Open your wallet app to send USDC to your Treasure Chess wallet:
              </Text>

              {/* MetaMask Direct */}
              <TouchableOpacity
                style={styles.walletButton}
                onPress={handleMetaMaskDeepLink}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#F6851B', '#E2761B']}
                  style={styles.walletButtonGradient}
                >
                  <Wallet size={24} color="#FFFFFF" />
                  <View style={styles.walletButtonTextContainer}>
                    <Text style={styles.walletButtonTitle}>Connect MetaMask</Text>
                    <Text style={styles.walletButtonSubtitle}>
                      Opens MetaMask to send USDC
                    </Text>
                  </View>
                  {isLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
                </LinearGradient>
              </TouchableOpacity>

              {/* Other Wallets */}
              <TouchableOpacity
                style={styles.walletButton}
                onPress={handleConnectAnyWallet}
                disabled={isLoading}
              >
                <LinearGradient
                  colors={['#3B99FC', '#1A6FDB']}
                  style={styles.walletButtonGradient}
                >
                  <Copy size={24} color="#FFFFFF" />
                  <View style={styles.walletButtonTextContainer}>
                    <Text style={styles.walletButtonTitle}>Other Wallets</Text>
                    <Text style={styles.walletButtonSubtitle}>
                      Rainbow, Trust, Coinbase & more
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Info Section */}
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Network:</Text>
                <Text style={styles.infoValue}>{NETWORK_NAME}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Token:</Text>
                <Text style={styles.infoValue}>USDC</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Conversion:</Text>
                <Text style={styles.infoValue}>1 USDC = 25 TCT</Text>
              </View>
            </View>

            {/* Warning */}
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Only send USDC on {NETWORK_NAME}. Sending other tokens or using different networks may result in permanent loss of funds.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  scrollView: {
    maxHeight: '90%',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  // Wallet Section
  walletSection: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },
  sectionDescription: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
    lineHeight: 18,
  },
  addressContainer: {
    gap: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  addressBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  addressText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  addressActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F0F1E',
  },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
  },
  explorerButtonText: {
    fontSize: 14,
    color: '#888',
  },
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerText: {
    fontSize: 12,
    color: '#666',
    paddingHorizontal: 12,
  },
  // Connect Section
  connectSection: {
    marginBottom: 16,
  },
  connectDescription: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  walletButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  walletButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  walletButtonTextContainer: {
    flex: 1,
  },
  walletButtonTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  walletButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  // Info Section
  infoSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#888',
  },
  infoValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  // Warning
  warningBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.2)',
  },
  warningText: {
    fontSize: 11,
    color: '#FF6B6B',
    textAlign: 'center',
    lineHeight: 16,
  },
});
