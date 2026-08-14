/**
 * Wallet Connection Hook
 * Connects to explicitly selected EVM wallets (MetaMask / Phantom EVM)
 * through their real EIP-1193 providers discovered via EIP-6963 + legacy.
 * No mock/fake wallet state is ever created.
 */

'use client';

import * as React from 'react';
import { useAgentIdentity } from '@/context/agent-identity';
import {
  getInjectedWalletProviders,
  getWalletProvider,
  isPhantomSolanaOnly,
  type EIP1193Provider,
  type WalletId,
} from '@/lib/wallet-providers';

// ============================================
// Wallet Connection State
// ============================================

interface WalletState {
  account: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  walletType: WalletId | null;
  error: string | null;
}

interface WalletActions {
  connect: (walletType?: WalletId) => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

interface ProviderListeners {
  provider: EIP1193Provider;
  onAccountsChanged: (...args: unknown[]) => void;
  onChainChanged: (...args: unknown[]) => void;
}

/**
 * Connect to a real injected EVM wallet.
 * `walletType` explicitly selects MetaMask or Phantom EVM.
 */
export function useWallet(): WalletState & WalletActions {
  const { wallet, setWallet } = useAgentIdentity();

  // chainId starts as null and is only set from the real wallet's eth_chainId.
  // Never fabricate a default chain.
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [walletType, setWalletType] = React.useState<WalletId | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const providerRef = React.useRef<EIP1193Provider | null>(null);
  const listenersRef = React.useRef<ProviderListeners | null>(null);

  const attachListeners = React.useCallback((selectedProvider: EIP1193Provider) => {
    const onAccountsChanged = (newAccounts: unknown) => {
      const accounts = newAccounts as string[];
      if (accounts && accounts.length > 0) {
        setWallet(accounts[0].toLowerCase());
      } else {
        setWallet(null);
      }
    };

    const onChainChanged = (newChainId: unknown) => {
      setChainId(parseInt(newChainId as string, 16));
    };

    selectedProvider.on?.('accountsChanged', onAccountsChanged);
    selectedProvider.on?.('chainChanged', onChainChanged);

    listenersRef.current = { provider: selectedProvider, onAccountsChanged, onChainChanged };
  }, [setWallet]);

  const connect = React.useCallback(async (requestedType?: WalletId) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Resolve which wallet to use. If none was explicitly requested, prefer
      // MetaMask, then any other detected EVM provider.
      let target: WalletId | null = requestedType ?? null;
      if (!target) {
        const available = await getInjectedWalletProviders();
        target =
          available.find((p) => p.kind === 'metamask')?.kind ??
          available[0]?.kind ??
          null;
      }

      if (!target) {
        const message = isPhantomSolanaOnly()
          ? 'Phantom is installed but only its Solana provider is exposed, which cannot support the EVM/GOAT Testnet3 flow. Install MetaMask or enable Phantom EVM.'
          : 'No EVM wallet detected. Install MetaMask to continue.';
        setError(message);
        console.error('useWallet:', message);
        return;
      }

      const found = await getWalletProvider(target);

      if (!found) {
        const message =
          target === 'metamask'
            ? 'MetaMask not detected. Install the MetaMask extension (or unlock it) and try again.'
            : 'Phantom EVM provider not detected. Phantom is only exposing its Solana provider, which cannot support the EVM/GOAT Testnet3 flow.';
        setError(message);
        console.error('useWallet:', message);
        return;
      }

      const selectedProvider = found.provider;

      // Request the user's real account — opens the wallet popup.
      const accounts = (await selectedProvider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        setError('No accounts returned. Approve the connection request in your wallet.');
        return;
      }

      providerRef.current = selectedProvider;
      setWalletType(target);
      setWallet(accounts[0].toLowerCase());

      // Read the real chain id from the wallet.
      const chainIdHex = (await selectedProvider.request({
        method: 'eth_chainId',
      })) as string;
      setChainId(parseInt(chainIdHex, 16));

      attachListeners(selectedProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wallet connection failed.';
      setError(message);
      console.error('Wallet connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [attachListeners, setWallet]);

  const disconnect = React.useCallback(() => {
    const listeners = listenersRef.current;
    if (listeners) {
      listeners.provider.removeListener?.('accountsChanged', listeners.onAccountsChanged);
      listeners.provider.removeListener?.('chainChanged', listeners.onChainChanged);
      listenersRef.current = null;
    }
    providerRef.current = null;
    setWalletType(null);
    setWallet(null);
    setChainId(null);
  }, [setWallet]);

  const switchChain = React.useCallback(async (targetChainId: number) => {
    const current = providerRef.current;
    if (!current) return;

    try {
      await current.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (switchError: unknown) {
      const code = (switchError as { code?: number })?.code;
      // MetaMask returns 4902 when the chain has not been added yet.
      // wallet_addEthereumChain also switches to the added chain.
      if (code !== 4902) throw switchError;
      await addChain(targetChainId);
    }

    // Re-read the real chain id from the wallet after the switch/add and
    // update React state from the actual wallet value, not an assumption.
    const chainIdHex = (await current.request({
      method: 'eth_chainId',
    })) as string;
    setChainId(parseInt(chainIdHex, 16));
  }, []);

  const addChain = async (chainId: number) => {
    const current = providerRef.current;
    if (!current) return;

    const chainParams = {
      chainId: `0x${chainId.toString(16)}`,
      chainName: 'GOAT Testnet3',
      nativeCurrency: { name: 'GOAT', symbol: 'GOAT', decimals: 18 },
      rpcUrls: ['https://rpc.testnet3.goat.network'],
      blockExplorerUrls: ['https://explorer.testnet3.goat.network'],
    };

    await current.request({
      method: 'wallet_addEthereumChain',
      params: [chainParams],
    });
  };

  return {
    account: wallet,
    isConnected: !!wallet,
    isConnecting,
    chainId,
    walletType,
    error,
    connect,
    disconnect,
    switchChain,
  };
}

/**
 * Hook to get the current agent identity for forms
 * Returns either the ERC-8004 registered agent or mock agent based on config
 */
export function useCurrentAgent(role: 'buyer' | 'seller') {
  const { getFormIdentity, wallet, config } = useAgentIdentity();

  return React.useMemo(() => {
    if (!wallet) return config.defaultMockAgents[role];
    return getFormIdentity(role);
  }, [wallet, role, getFormIdentity, config]);
}

/**
 * Hook to check if current wallet has registered ERC-8004 agent
 */
export function useHasRegisteredAgent() {
  const { hasAgent, wallet, primaryIdentity } = useAgentIdentity();
  return { hasAgent, wallet, primaryIdentity };
}
