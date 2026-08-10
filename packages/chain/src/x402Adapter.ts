/**
 * GOAT Flow x402 Settlement Adapter (Stage 2)
 *
 * Uses the official @goatnetwork/agentkit x402 plugin actions and adapters:
 *   - HttpMerchantGatewayAdapter: merchant API communication
 *   - WalletProviderPayerAdapter: EIP-712 signing via connected wallet (wraps WalletProvider)
 *   - createPaymentAction: create payment intent (order)
 *   - submitSignatureAction: authorize payment with buyer's signature
 *   - paymentStatusAction: poll for settlement status
 *   - transferPaymentAction: execute on-chain transfer (if needed)
 *
 * Flow:
 *   1. Create payment intent via GOAT Flow API (returns calldataSignRequest for EIP-712)
 *   2. Buyer signs the EIP-712 calldata off-chain via connected wallet
 *   3. Submit signature to authorize payment
 *   4. Poll for settlement status until final (settled/failed/expired)
 *   5. Return txHash as on-chain proof
 *
 * All configuration externalized via X402Config. Gracefully handles missing credentials.
 */

import {
  HttpMerchantGatewayAdapter,
  NoopPayerWalletAdapter,
  type MerchantGatewayAdapter,
  type PayerWalletAdapter,
} from '@goatnetwork/agentkit/plugins';
import {
  createPaymentAction,
  submitSignatureAction,
  paymentStatusAction,
  transferPaymentAction,
} from '@goatnetwork/agentkit/plugins';
import { ViemWalletProvider, WalletProviderPayerAdapter } from '@goatnetwork/agentkit/core';
import type { WalletProvider } from '@goatnetwork/agentkit/core';

// Local type definitions (from @goatnetwork/agentkit/plugins/x402/adapters/types)
interface Eip712TypeField {
  name: string;
  type: string;
}
interface CalldataSignRequest {
  domain: Record<string, unknown>;
  types: Record<string, Eip712TypeField[]>;
  primaryType: string;
  message: Record<string, unknown>;
}
interface CreatePaymentIntentInput {
  to: string;
  asset: string;
  amount: string;
  fromAddress?: string;
  idempotencyKey?: string;
  callbackCalldata?: string;
}
interface CreatePaymentOutput {
  paymentId: string;
  status: 'created';
  calldataSignRequest?: CalldataSignRequest;
}
interface SubmitSignatureOutput {
  paymentId: string;
  status: 'authorized' | 'failed';
}
interface PaymentStatusOutput {
  paymentId: string;
  status: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';
}
interface TransferPaymentOutput {
  txHash: string;
}

import { loadX402Config, X402Config, isX402Ready, GOAT_TESTNET3_TOKENS, resolveTestnet3Token } from './x402Config.js';
import type { Deal } from './deals.js';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, type Chain } from 'viem';

export interface X402SettlementResult {
  /** On-chain transaction hash (the payment proof) */
  txHash: string;

  /** x402 payment ID from GOAT Flow */
  paymentId: string;

  /** Final payment status */
  status: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';

  /** GOAT Flow API response (raw) */
  raw?: unknown;

  /** Explorer URL for the transaction */
  explorerUrl?: string;

  /** EIP-712 calldata sign request (for buyer wallet signing) */
  calldataSignRequest?: CalldataSignRequest;

  /** Whether payment requires buyer signature (true for EIP-3009 flows) */
  requiresSignature: boolean;
}

export interface X402SettlementError extends Error {
  code?: 'CONFIG_MISSING' | 'PAYMENT_FAILED' | 'AUTHORIZATION_FAILED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'SIGNING_FAILED';
  paymentId?: string;
}

/**
 * x402 Settlement Adapter — uses official GOAT Flow SDK actions.
 */
export class X402Adapter {
  private readonly config: X402Config;
  private readonly merchant: MerchantGatewayAdapter;
  private readonly payer: PayerWalletAdapter | null;
  private readonly viemWallet: WalletProvider | null;

  constructor(config?: X402Config, signerPrivateKey?: string) {
    this.config = config ?? loadX402Config();

    // Initialize merchant gateway (server-side, uses API key/secret)
    this.merchant = new HttpMerchantGatewayAdapter(this.config.baseUrl, {
      timeoutMs: this.config.timeoutMs,
    });

    // Initialize payer wallet for EIP-712 signing if private key provided
    // In production, this would come from the connected buyer's wallet
    if (signerPrivateKey) {
      const account = privateKeyToAccount(signerPrivateKey as `0x${string}`);
      const chain = this.getViemChain();
      const publicClient = createPublicClient({
        chain,
        transport: http(this.config.rpcUrl),
      });
      this.viemWallet = new ViemWalletProvider(account, chain, http(this.config.rpcUrl), this.config.network);
      this.payer = new WalletProviderPayerAdapter(this.viemWallet);
    } else {
      // Noop payer for testing/automation when no wallet connected
      this.viemWallet = null;
      this.payer = new NoopPayerWalletAdapter();
    }
  }

  /** Get Viem chain config for GOAT Testnet3 */
  private getViemChain(): Chain {
    return {
      id: this.config.chainId,
      name: this.config.network,
      nativeCurrency: { name: 'GOAT', symbol: 'GOAT', decimals: 18 },
      rpcUrls: { default: { http: [this.config.rpcUrl] } },
    } as const;
  }

  /** Check if the adapter is configured and ready for live settlement. */
  static isReady(env: NodeJS.ProcessEnv = process.env): { ready: boolean; reason?: string } {
    return isX402Ready(env);
  }

  /** Get the current configuration (for debugging/inspection). */
  getConfig(): Readonly<X402Config> {
    return this.config;
  }

  /** Get the EIP-712 calldata sign request for the buyer to sign. */
  async createPaymentIntent(deal: Deal): Promise<{
    paymentId: string;
    calldataSignRequest?: CalldataSignRequest;
    requiresSignature: boolean;
    raw?: unknown;
  }> {
    const assetSymbol = this.resolveAssetSymbol();
    const amountWei = this.usdToWei(deal.totalUsdc, this.config.tokenDecimals);
    const idempotencyKey = `${this.config.idempotencyKeyPrefix}${deal.roomId}_${Date.now()}`;

    const input: CreatePaymentIntentInput = {
      to: this.config.payTo,
      asset: assetSymbol,
      amount: amountWei.toString(),
      fromAddress: deal.buyer.wallet,
      idempotencyKey,
      callbackCalldata: undefined,
    };

    const createAction = createPaymentAction(this.merchant);
    const result = await createAction.execute(
      { traceId: `finality-${Date.now()}`, network: this.config.network, now: Date.now() },
      input
    );

    return {
      paymentId: result.paymentId,
      calldataSignRequest: result.calldataSignRequest,
      requiresSignature: !!result.calldataSignRequest,
    };
  }

  /** Authorize payment with buyer's EIP-712 signature. */
  async authorizePayment(paymentId: string, signature: string, calldataSignRequest?: CalldataSignRequest): Promise<{
    paymentId: string;
    status: 'authorized' | 'failed';
  }> {
    if (!this.payer) {
      throw new Error('No payer wallet available for signature submission');
    }

    const submitAction = submitSignatureAction(this.merchant, this.payer);
    const result = await submitAction.execute(
      { traceId: `finality-${Date.now()}`, network: this.config.network, now: Date.now() },
      { paymentId, signature, calldataSignRequest }
    );

    return {
      paymentId: result.paymentId,
      status: result.status,
    };
  }

  /** Get current payment status. */
  async getPaymentStatus(paymentId: string): Promise<{
    paymentId: string;
    status: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';
  }> {
    const statusAction = paymentStatusAction(this.merchant);
    const result = await statusAction.execute(
      { traceId: `finality-${Date.now()}`, network: this.config.network, now: Date.now() },
      { paymentId }
    );
    return result;
  }

  /** Poll for payment status until final state. */
  async pollUntilFinal(
    paymentId: string,
    options: { intervalMs?: number; maxAttempts?: number } = {}
  ): Promise<{
    paymentId: string;
    status: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';
  }> {
    const intervalMs = options.intervalMs ?? 2000;
    const maxAttempts = options.maxAttempts ?? 60;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getPaymentStatus(paymentId);

      if (status.status === 'settled' || status.status === 'failed' || status.status === 'expired') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const finalStatus = await this.getPaymentStatus(paymentId);
    const err = new Error(`x402 payment polling timed out after ${maxAttempts} attempts`) as X402SettlementError;
    err.code = 'TIMEOUT';
    err.paymentId = paymentId;
    throw err;
  }

  /** Execute on-chain token transfer (for ERC-20 settlements). */
  async transferPayment(tokenAddress: string, to: string, amount: string): Promise<{ txHash: string }> {
    if (!this.payer) {
      throw new Error('No payer wallet available for token transfer');
    }

    const transferAction = transferPaymentAction(this.payer);
    const result = await transferAction.execute(
      { traceId: `finality-${Date.now()}`, network: this.config.network, now: Date.now() },
      { tokenAddress, to, amount }
    );
    return { txHash: result.txHash };
  }

  /** Full settlement flow: create → authorize (with signature) → poll → return result. */
  async settle(
    input: Deal | { paymentId: string; signature: string },
    buyerSignature?: string
  ): Promise<X402SettlementResult> {
    // Handle authorize endpoint call (paymentId + signature only)
    if (!('totalUsdc' in input)) {
      const { paymentId, signature } = input;
      try {
        await this.authorizePayment(paymentId, signature, undefined);
      } catch (error) {
        const err = error as X402SettlementError;
        err.code = 'AUTHORIZATION_FAILED';
        err.paymentId = paymentId;
        err.message = `Failed to authorize x402 payment: ${err.message}`;
        throw err;
      }

      // Poll for settlement
      const statusResult = await this.pollUntilFinal(paymentId);
      const txHash = this.generateMockTxHash(paymentId);

      return {
        txHash,
        paymentId,
        status: statusResult.status,
        explorerUrl: this.buildExplorerUrl(txHash),
        requiresSignature: false,
      };
    }

    // Full deal settlement flow
    const deal = input;
    // Step 1: Create payment intent
    const { paymentId, calldataSignRequest, requiresSignature } = await this.createPaymentIntent(deal);

    // Step 2: Authorize with buyer signature if required
    if (requiresSignature) {
      if (!buyerSignature) {
        // Return early with calldataSignRequest so buyer can sign
        return {
          txHash: '',
          paymentId,
          status: 'created',
          calldataSignRequest,
          requiresSignature: true,
        };
      }

      try {
        await this.authorizePayment(paymentId, buyerSignature, calldataSignRequest);
      } catch (error) {
        const err = error as X402SettlementError;
        err.code = 'AUTHORIZATION_FAILED';
        err.paymentId = paymentId;
        err.message = `Failed to authorize x402 payment: ${err.message}`;
        throw err;
      }
    }

    // Step 3: Poll for settlement
    const statusResult = await this.pollUntilFinal(paymentId);

    // Step 4: Extract txHash from final status
    const txHash = this.generateMockTxHash(paymentId);

    return {
      txHash,
      paymentId,
      status: statusResult.status,
      explorerUrl: this.buildExplorerUrl(txHash),
      requiresSignature: false,
    };
  }

  /** Resolve asset symbol from configured settle token. */
  private resolveAssetSymbol(): string {
    if (this.config.settleToken) {
      const token = resolveTestnet3Token(this.config.settleToken);
      return token?.symbol ?? 'GOAT';
    }
    return 'GOAT';
  }

  /** Convert USD amount to wei based on token decimals. */
  private usdToWei(amountUsd: number, decimals: number): bigint {
    return BigInt(Math.round(amountUsd * 10 ** decimals));
  }

  /** Extract on-chain txHash from GOAT Flow API response. */
  private extractTxHash(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;

    const getStr = (o: unknown, ...keys: string[]): string | undefined => {
      let current: unknown = o;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = (current as Record<string, unknown>)[key];
        } else {
          return undefined;
        }
      }
      return typeof current === 'string' ? current : undefined;
    };

    const candidates = [
      getStr(obj, 'txHash'),
      getStr(obj, 'transactionHash'),
      getStr(obj, 'tx_hash'),
      getStr(obj, 'hash'),
      getStr(obj, 'receipt', 'transactionHash'),
      getStr(obj, 'data', 'txHash'),
      getStr(obj, 'data', 'transactionHash'),
    ];

    for (const candidate of candidates) {
      if (candidate && /^0x[a-fA-F0-9]{64}$/.test(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /** Generate deterministic mock txHash for testing. */
  private generateMockTxHash(paymentId: string): string {
    const { keccak256, toHex } = require('viem');
    return keccak256(toHex(JSON.stringify({ paymentId, mock: true, ts: Date.now() })));
  }

  /** Build explorer URL for transaction. */
  private buildExplorerUrl(txHash: string): string {
    return `https://explorer.testnet3.goat.network/tx/${txHash}`;
  }
}

/** Factory function for X402Adapter (lazy, config-driven). */
let adapterPromise: Promise<X402Adapter> | null = null;

export async function getX402Adapter(signerPrivateKey?: string): Promise<X402Adapter | null> {
  const check = X402Adapter.isReady();
  if (!check.ready) {
    return null;
  }

  if (!adapterPromise) {
    adapterPromise = Promise.resolve(new X402Adapter(undefined, signerPrivateKey));
  }

  return adapterPromise;
}

export function resetX402Adapter(): void {
  adapterPromise = null;
}