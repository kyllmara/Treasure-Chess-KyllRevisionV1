import React, { useState, useEffect } from 'react';
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
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Wallet, Check, Copy, ExternalLink, ArrowRight, AlertCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { useUserStore } from '@/stores/userStore';
import { USDC_CONTRACT_ADDRESS } from '@/lib/vault';
import { supabase } from '@/lib/supabase';

const CHAIN_ID = process.env.EXPO_PUBLIC_CHAIN_ID || '8453';
const NETWORK_NAME = 'Base';
const BLOCK_EXPLORER = 'https://basescan.org';
const VAULT_ADDRESS = process.env.EXPO_PUBLIC_VAULT_ADDRESS || '0x8b490D45A94DC7a967D1bDA4B160Fa1c99445EEa';

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

interface ConnectWalletModalProps {
  visible: boolean;
  onClose: () => void;
  depositAmount?: number;
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
  const updateProfile = useUserStore((state) => state.updateProfile);

  const [vaultAddress, setVaultAddress] = useState<string>('');
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultCopied, setVaultCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Wallet registration state
  const [editingWallet, setEditingWallet] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [walletInputError, setWalletInputError] = useState('');
  const [isSavingWallet, setIsSavingWallet] = useState(false);

  const externalWallet = profile?.externalWalletAddress || '';
  const showRegistrationForm = !externalWallet || editingWallet;

  useEffect(() => {
    if (!visible) return;
    setEditingWallet(false);
    setWalletInput('');
    setWalletInputError('');
    setVaultAddress(VAULT_ADDRESS);
    setVaultLoading(false);
  }, [visible]);

  const handleCopyVaultAddress = async () => {
    if (!vaultAddress) return;
    await Clipboard.setStringAsync(vaultAddress);
    setVaultCopied(true);
    setTimeout(() => setVaultCopied(false), 2000);
  };

  const handleViewVaultOnExplorer = () => {
    if (!vaultAddress) return;
    Linking.openURL(`${BLOCK_EXPLORER}/address/${vaultAddress}`);
  };

  const handleSaveWallet = async () => {
    const addr = walletInput.trim();
    if (!isValidAddress(addr)) {
      setWalletInputError('Enter a valid Ethereum address (0x...)');
      return;
    }
    if (!profile?.id) return;

    setIsSavingWallet(true);
    setWalletInputError('');

    const { error } = await supabase
      .from('profiles')
      .update({ external_wallet_address: addr.toLowerCase() })
      .eq('id', profile.id);

    setIsSavingWallet(false);

    if (error) {
      setWalletInputError('Failed to save wallet address. Please try again.');
      return;
    }

    updateProfile({ externalWalletAddress: addr.toLowerCase() });
    setWalletInput('');
    setEditingWallet(false);
  };

  const handleMetaMaskDeepLink = async () => {
    if (!vaultAddress) {
      Alert.alert('Error', 'Vault address not loaded. Please try again.');
      return;
    }

    setIsLoading(true);
    try {
      // USDC has 6 decimals
      const usdcAmount = depositAmount ? Math.round(depositAmount * 1_000_000) : 1_000_000;
      const displayAmount = depositAmount ? `$${depositAmount}` : '$1';

      // ERC-20 transfer: send USDC from user's wallet TO vault
      const metamaskScheme = `metamask://send/${USDC_CONTRACT_ADDRESS}@${CHAIN_ID}/transfer?address=${vaultAddress}&uint256=${usdcAmount}`;
      const universalLink = `https://link.metamask.io/send/${USDC_CONTRACT_ADDRESS}@${CHAIN_ID}/transfer?address=${vaultAddress}&uint256=${usdcAmount}`;

      let canOpen = false;
      try {
        canOpen = await Linking.canOpenURL(metamaskScheme);
      } catch (_) {}

      if (canOpen) {
        await Linking.openURL(metamaskScheme);
      } else {
        await Linking.openURL(universalLink);
      }

      Alert.alert(
        'MetaMask Opened',
        `Transfer pre-filled for ${displayAmount} USDC to the Treasure Chess vault.\n\nConfirm in MetaMask. Your TCT balance will be credited once confirmed on-chain (12 blocks, ~24 seconds).`,
        [{ text: 'OK' }]
      );
      onTransactionComplete?.('pending', depositAmount || 0);
    } catch (error) {
      Alert.alert(
        'Unable to Open MetaMask',
        'Copy the vault address above and send USDC manually.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAnyWallet = async () => {
    if (!vaultAddress) return;
    await Clipboard.setStringAsync(vaultAddress);
    Alert.alert(
      'Vault Address Copied',
      `Open your wallet (Rainbow, Trust, Coinbase, etc.), switch to ${NETWORK_NAME}, and send USDC to:\n\n${vaultAddress.slice(0, 10)}...${vaultAddress.slice(-8)}\n\nYour TCT balance will be credited automatically.`,
      [{ text: 'OK' }]
    );
  };

  if (!isAuthenticated) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Deposit USDC</Text>
              <TouchableOpacity onPress={onClose}><X size={24} color="#FFFFFF" /></TouchableOpacity>
            </View>
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Please sign in to deposit.</Text>
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
              <TouchableOpacity onPress={onClose}><X size={24} color="#FFFFFF" /></TouchableOpacity>
            </View>

            {/* Step 1: Your sending wallet */}
            <View style={styles.stepSection}>
              <Text style={styles.stepLabel}>STEP 1 — Your sending wallet</Text>
              {!showRegistrationForm ? (
                <View>
                  <Text style={styles.stepDescription}>
                    Deposits must come FROM this address so we can credit your account:
                  </Text>
                  <View style={styles.addressBox}>
                    <Text style={styles.addressText} selectable>{externalWallet}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changeLinkRow}
                    onPress={() => { setEditingWallet(true); setWalletInput(externalWallet); }}
                  >
                    <Text style={styles.changeLink}>Use a different wallet</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.stepDescription}>
                    Register the wallet address you'll send USDC FROM. We use this to credit your TCT balance.
                  </Text>
                  <TextInput
                    style={[styles.walletInput, walletInputError ? styles.walletInputError : null]}
                    placeholder="0x..."
                    placeholderTextColor="#555"
                    value={walletInput}
                    onChangeText={(t) => { setWalletInput(t); setWalletInputError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {walletInputError ? (
                    <View style={styles.errorRow}>
                      <AlertCircle size={13} color="#FF6B6B" />
                      <Text style={styles.inputErrorText}>{walletInputError}</Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveWallet}
                    disabled={isSavingWallet}
                  >
                    <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.saveButtonGradient}>
                      {isSavingWallet
                        ? <ActivityIndicator size="small" color="#0F0F1E" />
                        : <Text style={styles.saveButtonText}>Save Wallet Address</Text>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Step 2: Send to vault */}
            <View style={styles.stepSection}>
              <Text style={styles.stepLabel}>STEP 2 — Send USDC to vault</Text>
              <Text style={styles.stepDescription}>
                Send USDC on {NETWORK_NAME} to the Treasure Chess vault:
              </Text>

              {vaultLoading ? (
                <ActivityIndicator color="#FFD700" style={{ marginVertical: 12 }} />
              ) : vaultAddress ? (
                <>
                  <View style={styles.addressBox}>
                    <Text style={styles.addressText} selectable>{vaultAddress}</Text>
                  </View>
                  <View style={styles.addressActions}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleCopyVaultAddress}>
                      <LinearGradient
                        colors={vaultCopied ? ['#4ECDC4', '#44A08D'] : ['#FFD700', '#FFA500']}
                        style={styles.actionButtonGradient}
                      >
                        {vaultCopied
                          ? <Check size={16} color="#0F0F1E" />
                          : <Copy size={16} color="#0F0F1E" />
                        }
                        <Text style={styles.actionButtonText}>
                          {vaultCopied ? 'Copied!' : 'Copy Address'}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.explorerButton} onPress={handleViewVaultOnExplorer}>
                      <ExternalLink size={14} color="#888" />
                      <Text style={styles.explorerButtonText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={styles.errorText}>Unable to load vault address. Please try again.</Text>
              )}
            </View>

            {/* Quick open wallet */}
            {vaultAddress && externalWallet && !editingWallet ? (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or open wallet directly</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.walletButton}
                  onPress={handleMetaMaskDeepLink}
                  disabled={isLoading}
                >
                  <LinearGradient colors={['#F6851B', '#E2761B']} style={styles.walletButtonGradient}>
                    <Wallet size={22} color="#FFFFFF" />
                    <View style={styles.walletButtonText}>
                      <Text style={styles.walletButtonTitle}>Open MetaMask</Text>
                      <Text style={styles.walletButtonSubtitle}>
                        {depositAmount ? `Pre-filled: $${depositAmount} USDC → vault` : 'Opens MetaMask to send USDC'}
                      </Text>
                    </View>
                    {isLoading
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <ArrowRight size={18} color="#FFFFFF" />
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.walletButton} onPress={handleOpenAnyWallet}>
                  <LinearGradient colors={['#3B99FC', '#1A6FDB']} style={styles.walletButtonGradient}>
                    <Copy size={22} color="#FFFFFF" />
                    <View style={styles.walletButtonText}>
                      <Text style={styles.walletButtonTitle}>Other Wallets</Text>
                      <Text style={styles.walletButtonSubtitle}>Rainbow, Trust, Coinbase & more</Text>
                    </View>
                    <ArrowRight size={18} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : null}

            {/* Info */}
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
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Confirmations:</Text>
                <Text style={styles.infoValue}>12 blocks (~24 sec)</Text>
              </View>
            </View>

            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Only send USDC on {NETWORK_NAME}. Send from your registered wallet above — deposits from other addresses cannot be attributed and will not be credited.
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
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  scrollView: { maxHeight: '92%' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF' },
  errorContainer: { padding: 40, alignItems: 'center' },
  errorText: { fontSize: 14, color: '#888', textAlign: 'center' },
  stepSection: {
    backgroundColor: 'rgba(255,215,0,0.04)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
    gap: 10,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#FFD700',
    textTransform: 'uppercase',
  },
  stepDescription: { fontSize: 13, color: '#888', lineHeight: 18 },
  addressBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addressText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  addressActions: { flexDirection: 'row', gap: 8 },
  actionButton: { flex: 1, borderRadius: 10, overflow: 'hidden' },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 6,
  },
  actionButtonText: { fontSize: 13, fontWeight: '600', color: '#0F0F1E' },
  explorerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
  },
  explorerButtonText: { fontSize: 13, color: '#888' },
  changeLinkRow: { alignItems: 'flex-start' },
  changeLink: { fontSize: 12, color: '#FFD700', textDecorationLine: 'underline' },
  walletInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  walletInputError: { borderColor: '#FF6B6B' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  inputErrorText: { fontSize: 12, color: '#FF6B6B' },
  saveButton: { borderRadius: 10, overflow: 'hidden' },
  saveButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveButtonText: { fontSize: 14, fontWeight: '700', color: '#0F0F1E' },
  divider: { flexDirection: 'row', alignItems: 'center' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { fontSize: 11, color: '#555', paddingHorizontal: 10 },
  walletButton: { borderRadius: 12, overflow: 'hidden' },
  walletButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 12,
  },
  walletButtonText: { flex: 1 },
  walletButtonTitle: { fontSize: 15, fontWeight: 'bold', color: '#FFFFFF' },
  walletButtonSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  infoSection: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoLabel: { fontSize: 12, color: '#888' },
  infoValue: { fontSize: 12, color: '#FFFFFF', fontWeight: '500' },
  warningBox: {
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.2)',
  },
  warningText: { fontSize: 11, color: '#FF6B6B', textAlign: 'center', lineHeight: 16 },
});
