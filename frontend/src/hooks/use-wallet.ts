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
  signTypedData: (domain: Record<string, unknown>, types: Record<string, { name: string; type: string }[]>, primaryType: string, message: Record<string, unknown>) => Promise<string>;
  transferErc20: (tokenAddress: string, to: string, amount: string) => Promise<string>;
  transferNative: (to: string, amount: string) => Promise<string>;
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
  const initializedRef = React.useRef(false);
  const txRequestCountRef = React.useRef(0);
  const txInFlightRef = React.useRef(false);

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

  // Auto-discover and attach to existing provider if wallet is already connected (e.g., from another page)
  React.useEffect(() => {
    if (initializedRef.current) return;
    if (!wallet) return;
    if (providerRef.current) return; // already have provider

    const discoverAndAttach = async () => {
      try {
        const providers = await getInjectedWalletProviders();
        if (providers.length === 0) return;

        // Use the first available provider (MetaMask preferred by getInjectedWalletProviders)
        const selectedProvider = providers[0].provider;

        // Verify this provider has the expected account
        const accounts = (await selectedProvider.request({ method: 'eth_accounts' })) as string[];
        const expectedWallet = wallet.toLowerCase();
        const hasAccount = accounts.some(a => a.toLowerCase() === expectedWallet);
        if (!hasAccount) return;

        providerRef.current = selectedProvider;
        setWalletType(providers[0].kind);

        // Read chainId
        let chainIdNum: number | null = null;
        try {
          const chainIdHex = (await selectedProvider.request({ method: 'eth_chainId' })) as string;
          chainIdNum = parseInt(chainIdHex, 16);
        } catch {
          if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
            try {
              const chainIdHex = await (window as any).ethereum.request({ method: 'eth_chainId' });
              chainIdNum = parseInt(chainIdHex as string, 16);
            } catch { /* ignore */ }
          }
        }
        if (chainIdNum !== null) setChainId(chainIdNum);

        attachListeners(selectedProvider);
        initializedRef.current = true;
      } catch {
        // Silent fail - user can manually connect if needed
      }
    };

    discoverAndAttach();
  }, [wallet, attachListeners, setWallet]);

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
      let chainIdNum: number | null = null;
      try {
        const chainIdHex = (await selectedProvider.request({
          method: 'eth_chainId',
        })) as string;
        chainIdNum = parseInt(chainIdHex, 16);
      } catch {
        // Fallback: try window.ethereum directly (more reliable for chainId)
        if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
          try {
            const chainIdHex = await (window as any).ethereum.request({ method: 'eth_chainId' });
            chainIdNum = parseInt(chainIdHex as string, 16);
          } catch {
            // ignore fallback error
          }
        }
      }
      if (chainIdNum !== null) {
        setChainId(chainIdNum);
      } else {
        setError('Failed to read chain ID from wallet.');
      }

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
    initializedRef.current = false;
  }, [setWallet]);

  const switchChain = React.useCallback(async (targetChainId: number) => {
    const current = providerRef.current;
    if (!current) return;

    const targetChainIdHex = `0x${targetChainId.toString(16)}`;
    console.log('[PAYMENT] switchChain: targetChainId=', targetChainId, 'targetChainIdHex=', targetChainIdHex);

    // First try wallet_switchEthereumChain (faster, doesn't prompt if already added)
    // Only fall back to wallet_addEthereumChain if switch fails with chain not added error
    try {
      console.log('[PAYMENT] Attempting wallet_switchEthereumChain to', targetChainIdHex);
      await current.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }],
      });
      console.log('[PAYMENT] wallet_switchEthereumChain succeeded');
    } catch (switchErr: unknown) {
      const err = switchErr as { code?: number; message?: string };
      console.log('[PAYMENT] wallet_switchEthereumChain failed:', err.code, err.message);
      
      // Chain not added (4902) or user rejected (4001) - try adding
      if (err.code === 4902 || err.code === 4001) {
        console.log('[PAYMENT] Chain not added or user rejected switch, calling addChain');
        await addChain(targetChainId);
      } else {
        // Other error - rethrow
        throw switchErr;
      }
    }

    // Re-read the real chain id from the wallet after the switch/add
    const chainIdHex = (await current.request({
      method: 'eth_chainId',
    })) as string;
    const actualChainId = parseInt(chainIdHex, 16);
    console.log('[PAYMENT] After switchChain, actual chainId:', actualChainId, 'expected:', targetChainId, 'match:', actualChainId === targetChainId);
    
    // Also check net_version for additional verification
    try {
      const netVersion = await current.request({ method: 'net_version' });
      console.log('[PAYMENT] switchChain net_version:', netVersion);
    } catch (e) {
      console.warn('[PAYMENT] switchChain Could not get net_version:', e);
    }
    
    if (actualChainId !== targetChainId) {
      const errorMsg = `Chain switch failed: wallet reports chainId ${actualChainId} (0x${actualChainId.toString(16)}), expected ${targetChainId} (0x${targetChainIdHex})`;
      console.error('[PAYMENT] CHAIN MISMATCH:', errorMsg);
      throw new Error(errorMsg);
    }
    
    setChainId(actualChainId);
  }, []);

  const signTypedData = React.useCallback(async (
    domain: Record<string, unknown>,
    types: Record<string, { name: string; type: string }[]>,
    primaryType: string,
    message: Record<string, unknown>
  ): Promise<string> => {
    const current = providerRef.current;
    if (!current) throw new Error('Wallet not connected');
    if (!wallet) throw new Error('No account available');

    // Ensure we're on the correct chain (GOAT Testnet3 = 48816)
    const currentChainIdHex = (await current.request({ method: 'eth_chainId' })) as string;
    const currentChainId = parseInt(currentChainIdHex, 16);
    const targetChainId = 48816; // GOAT Testnet3
    if (currentChainId !== targetChainId) {
      await switchChain(targetChainId);
    }

    // Prepare EIP-712 typed data for eth_signTypedData_v4
    const typedData = {
      domain,
      types,
      primaryType,
      message,
    };

    // Request signature from wallet
    const signature = await current.request({
      method: 'eth_signTypedData_v4',
      params: [wallet, typedData],
    });

    return signature as string;
  }, [wallet, switchChain]);

  const transferErc20 = React.useCallback(async (
    tokenAddress: string,
    to: string,
    amount: string
  ): Promise<string> => {
    const current = providerRef.current;
    if (!current) throw new Error('Wallet not connected');
    if (!wallet) throw new Error('No account available');

    // GOAT Testnet3 chain ID
    const targetChainId = 48816; // GOAT Testnet3
    const targetChainIdHex = `0x${targetChainId.toString(16)}`;

    // Request deduplication guard
    const requestId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const requestNum = ++txRequestCountRef.current;

    console.log('[PAYMENT] ===== ERC20 PAYMENT INITIATED =====', {
          requestId,
          requestNum,
          selectedWalletProvider: walletType,
          selectedWalletAddress: wallet,
          currentWalletChainId: chainId,
          expectedChainId: targetChainId,
          expectedChainIdHex: targetChainIdHex,
          tokenContract: tokenAddress,
          sellerAddress: to,
          buyerAddress: wallet,
          amount: amount,
          amountFormatted: (Number(BigInt(amount)) / 1e18).toString(),
          rpcUrl: 'https://rpc.testnet3.goat.network',
          inFlight: txInFlightRef.current,
        });

    // Concurrency guard
    if (txInFlightRef.current) {
      console.error('[PAYMENT] CONCURRENT REQUEST DETECTED - blocking duplicate', { requestId, requestNum });
      throw new Error('Another transaction is already in progress. Please wait.');
    }
    txInFlightRef.current = true;

    // Ensure we're on the correct chain
    const currentChainIdHex = (await current.request({ method: 'eth_chainId' })) as string;
    const currentChainId = parseInt(currentChainIdHex, 16);
    
    if (currentChainId !== targetChainId) {
      console.log('[PAYMENT] Chain mismatch, switching...', { currentChainId, targetChainId });
      await switchChain(targetChainId);
    }

    // Verify chain again after switch
    const verifyChainIdHex = (await current.request({ method: 'eth_chainId' })) as string;
    const verifyChainId = parseInt(verifyChainIdHex, 16);
    if (verifyChainId !== targetChainId) {
      throw new Error(`Chain verification failed after switch: wallet reports ${verifyChainId}, expected ${targetChainId}`);
    }

    // PREFLIGHT: Check ERC-20 balance before attempting transfer
    const balanceOfAbi = '0x70a08231' + wallet.slice(2).padStart(64, '0');
    const balanceHex = await current.request({
      method: 'eth_call',
      params: [{ to: tokenAddress, data: balanceOfAbi }, 'latest'],
    }) as string;
    const balance = BigInt(balanceHex);
    const requiredAmount = BigInt(amount);
    if (balance < requiredAmount) {
      const balanceDisplay = (Number(balance) / 1e18).toString();
      const requiredDisplay = (Number(requiredAmount) / 1e18).toString();
      throw new Error(
        `Insufficient ERC-20 balance. Wallet has ${balanceDisplay} tokens, but ${requiredDisplay} is required. ` +
        `Please fund the buyer wallet (${wallet}) with the required token on GOAT Testnet3 (chainId 48816).`
      );
    }
    console.log('[PAYMENT] ERC20 Preflight balance check passed:', {
      wallet,
      tokenContract: tokenAddress,
      balance: balance.toString(),
      requiredAmount: requiredAmount.toString(),
    });

    // ERC-20 transfer function signature
    const data = '0xa9059cbb' + 
      to.slice(2).padStart(64, '0') + 
      BigInt(amount).toString(16).padStart(64, '0');

    // Estimate gas for the ERC-20 transfer
    let gasLimit: bigint;
    const GOAT_TESTNET3_GAS_CAP = BigInt(16777216); // RPC maximum gas limit
    try {
      console.log('[PAYMENT] Estimating gas for ERC20...');
      const estimatedGasHex = await current.request({
        method: 'eth_estimateGas',
        params: [{
          from: wallet,
          to: tokenAddress,
          data,
          value: '0x0',
        }],
      }) as string;
      const estimatedGas = BigInt(estimatedGasHex);
      console.log('[PAYMENT] ERC20 Gas estimation raw:', estimatedGas.toString());
      
      // Add 20% buffer for safety
      const bufferedGas = estimatedGas * BigInt(120) / BigInt(100);
      // Cap at RPC maximum
      gasLimit = bufferedGas > GOAT_TESTNET3_GAS_CAP ? GOAT_TESTNET3_GAS_CAP : bufferedGas;
      
      console.log('[PAYMENT] ERC20 Gas estimate:', {
        estimatedGas: estimatedGas.toString(),
        bufferedGas: bufferedGas.toString(),
        gasLimit: gasLimit.toString(),
        gasLimitHex: '0x' + gasLimit.toString(16),
      });
    } catch (estimateErr) {
      console.error('[PAYMENT] ERC20 GAS ESTIMATION FULL ERROR:', {
        error: estimateErr,
        message: estimateErr instanceof Error ? estimateErr.message : String(estimateErr),
        json: JSON.stringify(estimateErr, Object.getOwnPropertyNames(estimateErr)),
      });
      const errMsg = estimateErr instanceof Error ? estimateErr.message : String(estimateErr);
      throw new Error(`ERC20 Gas estimation failed: ${errMsg}. Check the console for full error details.`);
    }

    const txParams = {
      from: wallet,
      to: tokenAddress,
      data,
      value: '0x0',
      gas: '0x' + gasLimit.toString(16),
      chainId: targetChainIdHex,
    };

    // COMPREHENSIVE DIAGNOSTICS
    const diagnostics = async () => {
      try {
        const actualChainIdHex = await current.request({ method: 'eth_chainId' });
        const actualChainId = parseInt(actualChainIdHex as string, 16);
        const accounts = (await current.request({ method: 'eth_accounts' })) as string[];
        
        console.log('[PAYMENT] ===== ERC20 PRE-FLIGHT DIAGNOSTICS =====', {
          walletChainId: actualChainId,
          walletChainIdHex: actualChainIdHex,
          requestedChainId: targetChainId,
          requestedChainIdHex: targetChainIdHex,
          chainMatch: actualChainId === targetChainId,
          accounts: accounts,
          from: wallet,
          fromMatchesAccount: accounts.includes(wallet),
        });

        try {
          const networkVersion = await current.request({ method: 'net_version' });
          console.log('[PAYMENT] ERC20 selected provider net_version:', networkVersion);
        } catch (e) {
          console.warn('[PAYMENT] ERC20 net_version failed:', e);
        }
      } catch (e) {
        console.warn('[PAYMENT] ERC20 Diagnostics failed:', e);
      }
    };
    await diagnostics();

    // Log transaction details
    console.log('[PAYMENT] ===== ERC20 TRANSACTION DEBUG LOG =====', {
      chainId: targetChainId,
      chainIdHex: targetChainIdHex,
      tokenContract: tokenAddress,
      from: wallet,
      to,
      amount,
      amountFormatted: (Number(BigInt(amount)) / 1e18).toString(),
      gasLimit: gasLimit.toString(),
      gasLimitHex: '0x' + gasLimit.toString(16),
      data: data.slice(0, 20) + '...',
      txParams: { ...txParams, data: data.slice(0, 20) + '...' },
      isNative: false,
      token: 'ERC-20',
      network: 'GOAT Testnet3',
    });
    console.log('[PAYMENT] Exact ERC20 params sent to MetaMask:', JSON.stringify({ ...txParams, data: data.slice(0, 20) + '...' }, null, 2));

    // Send transaction via wallet
    console.log('[PAYMENT] requesting ERC20 wallet transaction', { requestId, method: 'eth_sendTransaction' });
    let txHash: string;
    try {
      txHash = await current.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      }) as string;
      console.log('[PAYMENT] ERC20 tx hash', { requestId, txHash });
    } catch (err: unknown) {
      const providerError = err as { code?: number; message?: string; data?: unknown };
      console.error('[PAYMENT] ERC20 PAYMENT FAILED - Provider error:', {
        requestId,
        code: providerError.code,
        message: providerError.message,
        data: providerError.data,
        txParams: { ...txParams, data: data.slice(0, 20) + '...' },
      });
      const enhancedError = new Error(
        providerError.message || 'Transaction rejected by wallet'
      );
      (enhancedError as any).code = providerError.code;
      (enhancedError as any).data = providerError.data;
      throw enhancedError;
    } finally {
      txInFlightRef.current = false;
    }

    // Wait for transaction receipt and verify
    console.log('[PAYMENT] waiting for ERC20 receipt', { requestId, txHash });
    
    // Create a public client to wait for receipt
        const { createPublicClient, http, parseAbi, decodeEventLog } = await import('viem');
        const { waitForTransactionReceipt: viemWaitForTransactionReceipt } = await import('viem/actions');
    
        const net = {
          id: 48816,
          name: 'goat-testnet',
          nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
          rpcUrls: { default: { http: ['https://rpc.testnet3.goat.network'] } },
        } as const;
    
        const publicClient = createPublicClient({ 
          chain: net as any, 
          transport: http('https://rpc.testnet3.goat.network') 
        });

        let receipt;
        try {
          receipt = await viemWaitForTransactionReceipt(publicClient, {
            hash: txHash as `0x${string}`,
            timeout: 120_000, // 2 minutes timeout
            pollingInterval: 2_000,
          });
      console.log('[PAYMENT] ERC20 receipt received', {
        requestId,
        blockNumber: receipt.blockNumber?.toString(),
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString(),
      });
    } catch (waitError: unknown) {
      const err = waitError as Error & { code?: string; message?: string };
      console.error('[PAYMENT] ERC20 PAYMENT FAILED - Receipt wait error:', {
        requestId,
        txHash,
        code: err.code,
        message: err.message,
      });
      
      if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout') || err.message?.includes('not found')) {
        throw new Error(`ERC20 Transaction submitted but receipt not available within timeout. Tx: ${txHash}. Check explorer: https://explorer.testnet3.goat.network/tx/${txHash}`);
      }
      throw new Error(`Failed to get ERC20 transaction receipt: ${err.message}`);
    }

    // Verify receipt
    console.log('[PAYMENT] Verifying ERC20 receipt...', { requestId, txHash });
    
    // Get transaction details for additional verification
    const tx = await publicClient.getTransaction({
      hash: txHash as `0x${string}`,
    });

    console.log('[PAYMENT] ERC20 Transaction details:', {
      txHash,
      txFrom: tx?.from,
      txTo: tx?.to,
      txValue: tx?.value?.toString(),
      txChainId: tx?.chainId?.toString(),
      receiptStatus: receipt.status,
    });

    if (!tx) {
      throw new Error('ERC20 Transaction details not found on-chain');
    }

    // Verify transaction is successful
    if (receipt.status !== 'success') {
      throw new Error(`ERC20 Transaction reverted on-chain. Status: ${receipt.status}`);
    }

    // Verify chain ID
    const providerChainId = BigInt(await publicClient.getChainId());
    if (providerChainId !== BigInt(targetChainId)) {
      throw new Error(`Wrong chain: provider is on chain ${providerChainId}, expected ${targetChainId} (GOAT Testnet3)`);
    }

    // Verify sender
    const senderOk = tx.from?.toLowerCase() === wallet.toLowerCase();
    if (!senderOk) {
      throw new Error(`Wrong sender: tx.from = ${tx.from}, expected buyer = ${wallet}`);
    }

    // Verify recipient (token contract)
    const recipientOk = tx.to?.toLowerCase() === tokenAddress.toLowerCase();
    if (!recipientOk) {
      throw new Error(`Wrong recipient: tx.to = ${tx.to}, expected token contract = ${tokenAddress}`);
    }

    // Verify ERC-20 Transfer event
    const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
    const transferLogs = receipt.logs.filter((log: any) => {
      try {
        const decoded = decodeEventLog({
          abi: transferAbi,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === 'Transfer';
      } catch {
        return false;
      }
    });

    if (transferLogs.length === 0) {
      throw new Error('No Transfer event found in ERC20 transaction');
    }

    // Find the transfer that matches expected amount, sender, recipient
    let matchedTransfer = null;
    const expectedAmount = BigInt(amount);
    
    for (const log of transferLogs) {
      try {
        const decoded = decodeEventLog({
          abi: transferAbi,
          data: log.data,
          topics: log.topics,
        });
        
        const { from, to: transferTo, value } = decoded.args as { from: string; to: string; value: bigint };
        
        if (from.toLowerCase() === wallet.toLowerCase() &&
            transferTo.toLowerCase() === to.toLowerCase() &&
            value === expectedAmount) {
          matchedTransfer = { from, to: transferTo, value };
          break;
        }
      } catch (e) {
        // Ignore decode errors
      }
    }

    if (!matchedTransfer) {
      throw new Error(`No matching Transfer event found: expected from=${wallet}, to=${to}, amount=${amount}`);
    }

    // All checks passed
    console.log('[PAYMENT] ===== ERC20 PAYMENT VERIFIED =====', {
      requestId,
      txHash,
      blockNumber: receipt.blockNumber?.toString(),
      from: matchedTransfer.from,
      to: matchedTransfer.to,
      value: matchedTransfer.value.toString(),
      valueFormatted: (Number(matchedTransfer.value) / 1e18).toString(),
      chainId: targetChainId,
      network: 'GOAT Testnet3',
      explorerUrl: `https://explorer.testnet3.goat.network/tx/${txHash}`,
    });

    return txHash;
  }, [wallet, switchChain, walletType, chainId]);

  const transferNative = React.useCallback(async (
      to: string,
      amount: string
    ): Promise<string> => {
      const current = providerRef.current;
      if (!current) throw new Error('Wallet not connected');
      if (!wallet) throw new Error('No account available');

      // GOAT Testnet3 chain ID - MUST be declared first, before any reference
      const targetChainId = 48816; // GOAT Testnet3
      const targetChainIdHex = `0x${targetChainId.toString(16)}`;

      // Request deduplication guard
      const requestId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const requestNum = ++txRequestCountRef.current;

      // Log the payment initiation with all required details
      console.log('[PAYMENT] ===== PAYMENT INITIATED =====', {
        requestId,
        requestNum,
        selectedWalletProvider: walletType,
        selectedWalletAddress: wallet,
        currentWalletChainId: chainId,
        expectedChainId: targetChainId,
        expectedChainIdHex: targetChainIdHex,
        sellerAddress: to,
        buyerAddress: wallet,
        amount: amount,
        amountInBTC: (Number(BigInt(amount)) / 1e18).toString(),
        rpcUrl: 'https://rpc.testnet3.goat.network',
        inFlight: txInFlightRef.current,
      });

      // Concurrency guard - prevent multiple concurrent eth_sendTransaction calls
      if (txInFlightRef.current) {
        console.error('[PAYMENT] CONCURRENT REQUEST DETECTED - blocking duplicate', { requestId, requestNum });
        throw new Error('Another transaction is already in progress. Please wait.');
      }
      txInFlightRef.current = true;

      // Ensure we're on the correct chain (GOAT Testnet3 = 48816)
      const currentChainIdHex = (await current.request({ method: 'eth_chainId' })) as string;
      const currentChainId = parseInt(currentChainIdHex, 16);

      if (currentChainId !== targetChainId) {
        console.log('[PAYMENT] Chain mismatch, switching...', { currentChainId, targetChainId });
        await switchChain(targetChainId);
      }

      // Verify chain again after switch
      const verifyChainIdHex = (await current.request({ method: 'eth_chainId' })) as string;
      const verifyChainId = parseInt(verifyChainIdHex, 16);
      if (verifyChainId !== targetChainId) {
        throw new Error(`Chain verification failed after switch: wallet reports ${verifyChainId}, expected ${targetChainId}`);
      }

      // Pre-flight: Get actual gas estimate and fee data for accurate balance check
      const valueHex = '0x' + BigInt(amount).toString(16);
      const requiredAmount = BigInt(amount);

      // Get actual gas estimate from the network
      let estimatedGas: bigint;
      try {
        const estimatedGasHex = await current.request({
          method: 'eth_estimateGas',
          params: [{
            from: wallet,
            to,
            value: valueHex,
          }],
        }) as string;
        estimatedGas = BigInt(estimatedGasHex);
      } catch (estimateErr) {
        console.error('[PAYMENT] Pre-flight gas estimation failed:', estimateErr);
        throw new Error(`Gas estimation failed: ${estimateErr instanceof Error ? estimateErr.message : String(estimateErr)}. Cannot verify balance.`);
      }

      // Get actual gas price from the network (legacy)
      let gasPrice: bigint;
      try {
        const gasPriceHex = await current.request({ method: 'eth_gasPrice' }) as string;
        gasPrice = BigInt(gasPriceHex);
      } catch (feeErr) {
        console.error('[PAYMENT] Pre-flight gas price fetch failed:', feeErr);
        throw new Error(`Gas price fetch failed: ${feeErr instanceof Error ? feeErr.message : String(feeErr)}. Cannot verify balance.`);
      }

      // Calculate exact gas cost using actual estimates
      const GOAT_TESTNET3_GAS_CAP = BigInt(16777216);
      // Add 20% buffer for the balance check (same as used for actual tx)
      const bufferedGas = estimatedGas * BigInt(120) / BigInt(100);
      const gasLimit = bufferedGas > GOAT_TESTNET3_GAS_CAP ? GOAT_TESTNET3_GAS_CAP : bufferedGas;
      const estimatedGasCost = gasLimit * gasPrice;
      const totalRequired = requiredAmount + estimatedGasCost;

      // Get actual balance
      const balanceHex = await current.request({
        method: 'eth_getBalance',
        params: [wallet, 'latest'],
      }) as string;
      const balance = BigInt(balanceHex);

      console.log('[PAYMENT] balance', balance.toString());
      console.log('[PAYMENT] paymentValue', requiredAmount.toString());
      console.log('[PAYMENT] gasLimit', gasLimit.toString());
      console.log('[PAYMENT] gasPrice', gasPrice.toString());
      console.log('[PAYMENT] estimatedGasCost', estimatedGasCost.toString());
      console.log('[PAYMENT] totalRequired', totalRequired.toString());

      console.log('[PAYMENT] Balance check:', {
        wallet,
        balance: balance.toString(),
        balanceInBTC: (Number(balance) / 1e18).toString(),
        requiredAmount: requiredAmount.toString(),
        requiredInBTC: (Number(requiredAmount) / 1e18).toString(),
        estimatedGasCost: estimatedGasCost.toString(),
        estimatedGasCostInBTC: (Number(estimatedGasCost) / 1e18).toString(),
        totalRequired: totalRequired.toString(),
        totalRequiredInBTC: (Number(totalRequired) / 1e18).toString(),
        sufficient: balance >= totalRequired,
      });

      if (balance < totalRequired) {
        const balanceDisplay = (Number(balance) / 1e18).toString();
        const requiredDisplay = (Number(totalRequired) / 1e18).toString();
        throw new Error(
          `Insufficient balance. Wallet has ${balanceDisplay} BTC, but ${requiredDisplay} BTC is required (amount + gas). ` +
          `Please fund the buyer wallet (${wallet}) with TBTC on GOAT Testnet3 (chainId 48816).`
        );
      }

      // GOAT Testnet3 uses LEGACY gas pricing (not EIP-1559)
      // Use the gasPrice we already fetched and gasLimit we already calculated
      console.log('[PAYMENT] Using LEGACY gas pricing for GOAT Testnet3', {
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
      });

      // ============================================================
      // NONCE DIAGNOSTICS: Compare MetaMask provider vs direct GOAT RPC
      // ============================================================
      console.log('[PAYMENT] ===== NONCE DIAGNOSTICS START =====');
      
      // 1. Query through the exact MetaMask provider (current)
      let metamaskChainId: number | null = null;
      let metamaskLatestNonce: number | null = null;
      let metamaskPendingNonce: number | null = null;
      try {
        const chainIdHex = await current.request({ method: 'eth_chainId' }) as string;
        metamaskChainId = parseInt(chainIdHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] MetaMask eth_chainId failed:', e);
      }
      try {
        const nonceHex = await current.request({ method: 'eth_getTransactionCount', params: [wallet, 'latest'] }) as string;
        metamaskLatestNonce = parseInt(nonceHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] MetaMask eth_getTransactionCount(latest) failed:', e);
      }
      try {
        const nonceHex = await current.request({ method: 'eth_getTransactionCount', params: [wallet, 'pending'] }) as string;
        metamaskPendingNonce = parseInt(nonceHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] MetaMask eth_getTransactionCount(pending) failed:', e);
      }

      // 2. Query the direct GOAT RPC
      let directGoatChainId: number | null = null;
      let directGoatLatestNonce: number | null = null;
      let directGoatPendingNonce: number | null = null;
      const GOAT_RPC_URL = 'https://rpc.testnet3.goat.network';
      async function rpcCall(method: string, params: any[]): Promise<any> {
        try {
          const response = await fetch(GOAT_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
          });
          const data = await response.json();
          if (data.error) {
            console.warn(`[PAYMENT] Direct GOAT RPC ${method} error:`, data.error);
            return null;
          }
          return data.result;
        } catch (e) {
          console.warn(`[PAYMENT] Direct GOAT RPC ${method} fetch error:`, e);
          return null;
        }
      }
      try {
        const chainIdHex = await rpcCall('eth_chainId', []);
        if (chainIdHex) directGoatChainId = parseInt(chainIdHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] Direct GOAT eth_chainId failed:', e);
      }
      try {
        const nonceHex = await rpcCall('eth_getTransactionCount', [wallet, 'latest']);
        if (nonceHex) directGoatLatestNonce = parseInt(nonceHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] Direct GOAT eth_getTransactionCount(latest) failed:', e);
      }
      try {
        const nonceHex = await rpcCall('eth_getTransactionCount', [wallet, 'pending']);
        if (nonceHex) directGoatPendingNonce = parseInt(nonceHex, 16);
      } catch (e) {
        console.warn('[PAYMENT] Direct GOAT eth_getTransactionCount(pending) failed:', e);
      }

      // 3. Log both side by side
      console.log('[PAYMENT] ===== NONCE DIAGNOSTICS =====', {
        metamaskChainId,
        metamaskChainIdHex: metamaskChainId ? '0x' + metamaskChainId.toString(16) : null,
        metamaskLatestNonce,
        metamaskLatestNonceHex: metamaskLatestNonce ? '0x' + metamaskLatestNonce.toString(16) : null,
        metamaskPendingNonce,
        metamaskPendingNonceHex: metamaskPendingNonce ? '0x' + metamaskPendingNonce.toString(16) : null,
        directGoatChainId,
        directGoatChainIdHex: directGoatChainId ? '0x' + directGoatChainId.toString(16) : null,
        directGoatLatestNonce,
        directGoatLatestNonceHex: directGoatLatestNonce ? '0x' + directGoatLatestNonce.toString(16) : null,
        directGoatPendingNonce,
        directGoatPendingNonceHex: directGoatPendingNonce ? '0x' + directGoatPendingNonce.toString(16) : null,
        chainIdMatch: metamaskChainId === directGoatChainId,
        latestNonceMatch: metamaskLatestNonce === directGoatLatestNonce,
        pendingNonceMatch: metamaskPendingNonce === directGoatPendingNonce,
      });
      console.log('[PAYMENT] ===== NONCE DIAGNOSTICS END =====');

      // 4. Use the CORRECT nonce (prefer direct GOAT RPC pending, fallback to MetaMask pending)
      const correctNonce = directGoatPendingNonce ?? metamaskPendingNonce;
      if (correctNonce === null) {
        throw new Error('Failed to fetch nonce from both MetaMask and direct GOAT RPC');
      }
      
      // Fetch fresh pending nonce immediately before sending
      let nonce: number = correctNonce;
      console.log('[PAYMENT] Fresh pending nonce (selected):', { 
        nonce, 
        nonceHex: `0x${nonce.toString(16)}`, 
        wallet,
        source: directGoatPendingNonce !== null ? 'direct-goat-rpc' : 'metamask-provider'
      });

      // Build transaction parameters (legacy format with nonce)
      const txParams = {
        from: wallet,
        to,
        value: valueHex,
        gas: '0x' + gasLimit.toString(16),
        gasPrice: '0x' + gasPrice.toString(16),
        nonce: '0x' + nonce.toString(16),
        chainId: targetChainIdHex,
      };

      // COMPREHENSIVE DIAGNOSTICS - Log everything before sending
      const diagnostics = async () => {
        try {
          const actualChainIdHex = await current.request({ method: 'eth_chainId' });
          const actualChainId = parseInt(actualChainIdHex as string, 16);
          const accounts = (await current.request({ method: 'eth_accounts' })) as string[];

          console.log('[PAYMENT] ===== PRE-FLIGHT DIAGNOSTICS =====', {
            walletChainId: actualChainId,
            walletChainIdHex: actualChainIdHex,
            requestedChainId: targetChainId,
            requestedChainIdHex: targetChainIdHex,
            chainMatch: actualChainId === targetChainId,
            accounts: accounts,
            from: wallet,
            fromMatchesAccount: accounts.includes(wallet),
          });

          // Check network details from the currently selected wallet provider
          try {
            const networkVersion = await current.request({ method: 'net_version' });
            console.log('[PAYMENT] selected provider net_version:', networkVersion);
          } catch (e) {
            console.warn('[PAYMENT] net_version failed:', e);
          }
        } catch (e) {
          console.warn('[PAYMENT] Diagnostics failed:', e);
        }
      };
      await diagnostics();

      // Log transaction details (safe - no secrets)
      console.log('[PAYMENT] ===== TRANSACTION DEBUG LOG =====', {
        chainId: targetChainId,
        chainIdHex: targetChainIdHex,
        from: wallet,
        to,
        amount: amount,
        amountHex: valueHex,
        amountInBTC: (Number(BigInt(amount)) / 1e18).toString(),
        gasLimit: gasLimit.toString(),
        gasLimitHex: '0x' + gasLimit.toString(16),
        gasPrice: gasPrice.toString(),
        gasPriceHex: '0x' + gasPrice.toString(16),
        nonce: nonce.toString(),
        nonceHex: '0x' + nonce.toString(16),
        txParams,
        isNative: true,
        token: 'BTC (native gas token on GOAT Testnet3)',
        network: 'GOAT Testnet3',
        dataField: 'none (native transfer)',
      });
      console.log('[PAYMENT] Exact params sent to MetaMask:', JSON.stringify(txParams, null, 2));

      // Send transaction via wallet with nonce-too-low retry
      console.log('[PAYMENT] requesting wallet transaction', { requestId, method: 'eth_sendTransaction' });
      let txHash = '';
      let txSent = false;
      let retryCount = 0;
      const MAX_NONCE_RETRIES = 1;

      while (!txSent && retryCount <= MAX_NONCE_RETRIES) {
        try {
          txHash = await current.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          }) as string;
          console.log('[PAYMENT] tx hash', { requestId, txHash, attempt: retryCount + 1 });
          txSent = true;
        } catch (err: unknown) {
          const providerError = err as { code?: number; message?: string; data?: unknown };
          const errorMsg = providerError.message || '';
          
          // Check for nonce-too-low error
          if (errorMsg.toLowerCase().includes('nonce too low') && retryCount < MAX_NONCE_RETRIES) {
            retryCount++;
            console.warn('[PAYMENT] Nonce too low, retrying with fresh nonce...', { 
              attempt: retryCount, 
              error: errorMsg 
            });
            
            // Fetch fresh nonce and retry
            try {
              const freshNonceHex = await current.request({
                method: 'eth_getTransactionCount',
                params: [wallet, 'pending'],
              }) as string;
              nonce = parseInt(freshNonceHex, 16);
              console.log('[PAYMENT] Fresh pending nonce (retry):', { nonce, nonceHex: `0x${nonce.toString(16)}`, wallet });
              txParams.nonce = '0x' + nonce.toString(16);
            } catch (nonceErr) {
              console.error('[PAYMENT] Failed to fetch fresh nonce on retry:', nonceErr);
              throw new Error(`Failed to fetch fresh nonce for retry: ${nonceErr instanceof Error ? nonceErr.message : String(nonceErr)}`);
            }
            continue;
          }
          
          // Any other error - log and throw
          console.error('[PAYMENT] PAYMENT FAILED - Provider error:', {
            requestId,
            code: providerError.code,
            message: providerError.message,
            data: providerError.data,
            txParams,
          });
          const enhancedError = new Error(
            providerError.message || 'Transaction rejected by wallet'
          );
          (enhancedError as any).code = providerError.code;
          (enhancedError as any).data = providerError.data;
          throw enhancedError;
        }
      }
      // Release concurrency guard after successful transaction submission
            txInFlightRef.current = false;

            // Wait for transaction receipt and verify using DIRECT GOAT RPC polling
            // MetaMask provider's RPC may not return receipts reliably; use direct GOAT Testnet3 RPC
            console.log('[PAYMENT] tx submitted', { requestId, txHash });

            const POLL_INTERVAL_MS = 3000; // 3 seconds
            const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
            const startTime = Date.now();

            let receipt: any = null;
            let txDetails: any = null;
            let blockNumber: string | number | null = null;

            async function pollDirectRPC(method: string, params: any[]): Promise<any> {
              const GOAT_RPC_URL = 'https://rpc.testnet3.goat.network';
              try {
                const response = await fetch(GOAT_RPC_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
                });
                const data = await response.json();
                console.log(`[PAYMENT] direct RPC ${method} response`, { requestId, txHash, result: data.result ? 'present' : 'null', error: data.error });
                if (data.error) {
                  console.warn(`[PAYMENT] direct RPC ${method} error:`, data.error);
                  return null;
                }
                return data.result;
              } catch (e) {
                console.warn(`[PAYMENT] direct RPC ${method} fetch error:`, e);
                return null;
              }
            }
      
            while (Date.now() - startTime < MAX_POLL_TIME_MS) {
              const elapsedMs = Date.now() - startTime;
              console.log('[PAYMENT] checking transaction (direct RPC)', { requestId, txHash, elapsedMs });
        
              // Check if transaction exists
              const txResult = await pollDirectRPC('eth_getTransactionByHash', [txHash]);
              if (txResult) {
                txDetails = txResult;
                blockNumber = txResult.blockNumber;
              }
        
              // Check for receipt
              const receiptResult = await pollDirectRPC('eth_getTransactionReceipt', [txHash]);
              if (receiptResult) {
                receipt = receiptResult;
                blockNumber = receiptResult.blockNumber;
                console.log('[PAYMENT] receipt found (direct RPC)', { requestId, txHash, status: receiptResult.status, blockNumber: receiptResult.blockNumber });
                break;
              }
        
              if (txDetails) {
                console.log('[PAYMENT] receipt pending (direct RPC)', { requestId, txHash, elapsedMs, blockNumber: blockNumber?.toString() });
              } else {
                console.log('[PAYMENT] transaction not yet visible on direct RPC', { requestId, txHash, elapsedMs });
              }
        
              // Wait before next poll
              await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
      
            if (!receipt) {
              console.error('[PAYMENT] RECEIPT POLLING TIMEOUT (direct RPC)', { requestId, txHash, totalTimeMs: Date.now() - startTime });
              // Check if transaction was found but no receipt yet
              if (txDetails) {
                console.warn('[PAYMENT] TRANSACTION MINED STATUS UNKNOWN - transaction found but receipt unavailable', { requestId, txHash, txDetails });
                throw new Error(`Transaction ${txHash} found on-chain but receipt not available after ${MAX_POLL_TIME_MS / 1000}s. Transaction may still be confirming. Check explorer: https://explorer.testnet3.goat.network/tx/${txHash}`);
              }
              throw new Error(`Transaction ${txHash} not found on-chain after ${MAX_POLL_TIME_MS / 1000}s. Check explorer: https://explorer.testnet3.goat.network/tx/${txHash}`);
            }
      
            console.log('[PAYMENT] receipt status', { requestId, txHash, status: receipt.status, blockNumber: receipt.blockNumber });
      
            // Get full transaction details for verification if not already fetched
            if (!txDetails) {
              txDetails = await pollDirectRPC('eth_getTransactionByHash', [txHash]);
            }
      
            console.log('[PAYMENT] transaction verified', { 
              requestId, 
              txHash, 
              from: txDetails?.from, 
              to: txDetails?.to, 
              value: txDetails?.value,
              chainId: txDetails?.chainId,
              receiptStatus: receipt.status 
            });
      
            // Verify receipt
            console.log('[PAYMENT] Verifying receipt...', { requestId, txHash });
      
            // Check receipt status (can be '0x1' or 'success' depending on provider)
            const receiptStatus = receipt.status === '0x1' || receipt.status === 'success' || receipt.status === 1 || receipt.status === true;
            if (!receiptStatus) {
              throw new Error(`Transaction reverted on-chain. Receipt status: ${receipt.status}`);
            }
      
            // Verify sender
            const senderOk = txDetails?.from?.toLowerCase() === wallet.toLowerCase();
            if (!senderOk) {
              throw new Error(`Wrong sender: tx.from = ${txDetails?.from}, expected buyer = ${wallet}`);
            }
      
            // Verify recipient
            const recipientOk = txDetails?.to?.toLowerCase() === to.toLowerCase();
            if (!recipientOk) {
              throw new Error(`Wrong recipient: tx.to = ${txDetails?.to}, expected seller = ${to}`);
            }
      
            // Verify amount
            const expectedAmount = BigInt(amount);
            const txValue = BigInt(txDetails?.value || '0');
            const amountOk = txValue === expectedAmount;
            if (!amountOk) {
              throw new Error(`Wrong amount: tx.value = ${txValue.toString()}, expected = ${expectedAmount.toString()}`);
            }
      
            // Verify chain ID from transaction (can be hex string, number, or undefined)
            let txChainIdValid = false;
            if (txDetails?.chainId) {
              const txChainId = typeof txDetails.chainId === 'string' ? parseInt(txDetails.chainId, 16) : txDetails.chainId;
              txChainIdValid = txChainId === targetChainId;
            } else {
              // Some providers don't include chainId in eth_getTransactionByHash
              txChainIdValid = true;
            }
            if (!txChainIdValid) {
              throw new Error(`Wrong chain: transaction chainId = ${txDetails?.chainId}, expected ${targetChainId} (GOAT Testnet3)`);
            }
      
            // All checks passed
            console.log('[PAYMENT] ===== PAYMENT VERIFIED =====', {
              requestId,
              txHash,
              blockNumber: receipt.blockNumber,
              from: txDetails?.from,
              to: txDetails?.to,
              value: txDetails?.value,
              valueInBTC: (Number(txValue) / 1e18).toString(),
              chainId: targetChainId,
              network: 'GOAT Testnet3',
              explorerUrl: `https://explorer.testnet3.goat.network/tx/${txHash}`,
            });
      
            return txHash;
          }, [wallet, switchChain, walletType, chainId]);

  const addChain = async (chainId: number) => {
    const current = providerRef.current;
    if (!current) return;

    // GOAT Testnet3 native gas token is BTC (18 decimals)
    const chainParams = {
      chainId: `0x${chainId.toString(16)}`,
      chainName: 'GOAT Testnet3',
      nativeCurrency: {
        name: 'Bitcoin',
        symbol: 'BTC',
        decimals: 18,
      },
      rpcUrls: ['https://rpc.testnet3.goat.network'],
      blockExplorerUrls: ['https://explorer.testnet3.goat.network'],
    };

    console.log('[PAYMENT] addChain: Adding/updating GOAT Testnet3 network with params:', JSON.stringify(chainParams, null, 2));

    await current.request({
      method: 'wallet_addEthereumChain',
      params: [chainParams],
    });
    
    // Verify the network was added correctly
    try {
      const actualChainIdHex = await current.request({ method: 'eth_chainId' });
      console.log('[PAYMENT] addChain Network added successfully. Current chainId:', actualChainIdHex);
    } catch (e) {
      console.warn('[PAYMENT] addChain Could not verify chainId after add:', e);
    }
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
    signTypedData,
    transferErc20,
    transferNative,
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
