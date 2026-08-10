/**
 * Wallet Connection Hook
 * Simple wallet connection for development - replace with wagmi/ethers in production
 */

'use client';

import * as React from 'react';
import { useAgentIdentity } from '@/context/agent-identity';

// ============================================
// Wallet Connection State
// ============================================

interface WalletState {
  account: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
}

interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

/**
 * Simple wallet connection hook
 * In production, replace with wagmi useAccount, useConnect, useDisconnect, useSwitchChain
 */
export function useWallet(): WalletState & WalletActions {
  const { wallet, setWallet, primaryIdentity, hasAgent, config } = useAgentIdentity();
  
  const [chainId, setChainId] = React.useState<number | null>(48816);
  const [isConnecting, setIsConnecting] = React.useState(false);

  const connect = React.useCallback(async () => {
    setIsConnecting(true);
    
    try {
      // In development, simulate wallet connection
      // Replace with actual wallet connection logic (wagmi, ethers, etc.)
      
      // Check if MetaMask is available
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const provider = (window as any).ethereum;
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        
        if (accounts && accounts.length > 0) {
          const account = accounts[0].toLowerCase();
          setWallet(account);
          
          // Get chain ID
          const chainIdHex = await provider.request({ method: 'eth_chainId' });
          const chainIdNum = parseInt(chainIdHex, 16);
          setChainId(chainIdNum);
          
          // Listen for account changes
          provider.on('accountsChanged', (newAccounts: string[]) => {
            if (newAccounts.length > 0) {
              setWallet(newAccounts[0].toLowerCase());
            } else {
              setWallet(null);
            }
          });
          
          provider.on('chainChanged', (newChainId: string) => {
            setChainId(parseInt(newChainId, 16));
          });
        }
      } else {
        // Fallback for development - use a test account
        const testAccount = '0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4';
        setWallet(testAccount);
        setChainId(48816);
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [setWallet]);

  const disconnect = React.useCallback(() => {
    setWallet(null);
    setChainId(null);
    
    // Remove event listeners if using MetaMask
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.removeAllListeners('accountsChanged');
      (window as any).ethereum.removeAllListeners('chainChanged');
    }
  }, [setWallet]);

  const switchChain = React.useCallback(async (targetChainId: number) => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        });
        setChainId(targetChainId);
      } catch (error: any) {
        // Chain not added, try to add it
        if (error.code === 4902) {
          await addChain(targetChainId);
        }
        throw error;
      }
    }
  }, []);

  const addChain = async (chainId: number) => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    
    const chainParams = {
      chainId: `0x${chainId.toString(16)}`,
      chainName: 'GOAT Testnet3',
      nativeCurrency: { name: 'GOAT', symbol: 'GOAT', decimals: 18 },
      rpcUrls: ['https://rpc.testnet3.goat.network'],
      blockExplorerUrls: ['https://explorer.testnet3.goat.network'],
    };
    
    await (window as any).ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [chainParams],
    });
  };

  return {
    account: wallet,
    isConnected: !!wallet,
    isConnecting,
    chainId,
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
  const { getFormIdentity, wallet, config, primaryIdentity } = useAgentIdentity();
  
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