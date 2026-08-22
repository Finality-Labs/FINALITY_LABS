/**
 * Deal settlement endpoint — POST /deals (Part 3 entry point).
 *
 * Pipeline (contract §5 deal in → settlement + reputation out):
 *   1. Validate deal shape (zod, contract §5).
 *   2. Safety Transformer: evaluate(totalUsdc, policy).
 *        - blocked → 422 (reason) + NO ledger entry + NO reputation write.
 *   3. Mock x402 settle → txHash (facilitator ledger entry).
 *   4. Record reputation feedback for BOTH buyer + seller with
 *      proofOfPayment = the mock txHash.
 *   5. Return { ok, txHash, reputation }.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { evaluate, type SafetyPolicy } from './safety.js';
import { buildPayment, facilitator } from './mockFacilitator.js';
import { ReputationProvider, type ReputationResult } from './reputationProvider.js';
import { loadChainConfig, isLiveReady, explorerBase, resolveTestnet3Token, GOAT_NETWORKS } from './config.js';
import type { LiveAdapter } from './liveAdapter.js';
import { X402Adapter, type X402SettlementResult } from './x402Adapter.js';
import { isX402Ready } from './x402Config.js';
import { recoverTypedDataAddress, decodeEventLog, parseAbi } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';

// Live adapter is lazily created once, only when CHAIN_MODE=live is ready.
let liveAdapterPromise: Promise<LiveAdapter> | null = null;
// X402 adapter is lazily created once, only when x402 configuration is ready.
let x402AdapterPromise: Promise<X402Adapter> | null = null;
// In-memory deal storage for payment flow (roomId -> deal with resolved seller wallet)
interface StoredDeal extends Deal {
  resolvedSellerWallet?: string;
}
const dealStorage = new Map<string, StoredDeal>();
export async function getLiveAdapter(): Promise<LiveAdapter | null> {
  const cfg = loadChainConfig();
  const check = isLiveReady(cfg);
  if (!check.ready) return null;
  if (!liveAdapterPromise) {
    const { createLiveAdapter } = await import('./liveAdapter.js');
    liveAdapterPromise = createLiveAdapter(cfg);
  }
  return liveAdapterPromise;
}

export async function getX402Adapter(): Promise<X402Adapter | null> {
  const check = isX402Ready();
  if (!check.ready) return null;
  if (!x402AdapterPromise) {
    x402AdapterPromise = Promise.resolve(new X402Adapter());
  }
  return x402AdapterPromise;
}

const partySchema = z.object({
  agentRegistry: z.string().startsWith('eip155:'),
  agentId: z.string(),
  wallet: z.string().regex(/^0x[a-fA-F0-9]+$/),
  // Optional numeric ERC-8004 on-chain agentId (ERC-721 tokenId from register).
  // When present in live mode, real giveFeedback/getSummary target it.
  onchainAgentId: z.string().regex(/^\d+$/).optional(),
});

/** Contract §5 deal object. */
export const dealSchema = z.object({
  roomId: z.string(),
  transcriptHash: z.string(),
  buyer: partySchema,
  seller: partySchema,
  unitPrice: z.number().nonnegative(),
  qty: z.number().nonnegative(),
  terms: z.string(),
  totalUsdc: z.number().positive(),
});

/** Authorization request for x402 payment (buyer signature submission). */
export const x402AuthorizeSchema = z.object({
  paymentId: z.string(),
  signature: z.string(), // EIP-712 signature
  calldataSignRequest: z.object({
    domain: z.record(z.unknown()),
    types: z.record(z.array(z.object({ name: z.string(), type: z.string() }))),
    primaryType: z.string(),
    message: z.record(z.unknown()),
  }).optional(),
});

export type X402AuthorizeRequest = z.infer<typeof x402AuthorizeSchema>;

/** Payment verification request - buyer submits txHash for on-chain verification */
export const paymentVerifySchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type PaymentVerifyRequest = z.infer<typeof paymentVerifySchema>;

/** Payment info response - returned to buyer to execute the ERC-20 transfer */
export interface PaymentInfoResponse {
  roomId: string;
  dealId: string;
  totalUsdc: number;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  sellerAddress: string;
  buyerAddress: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  explorerBaseUrl: string;
}

/** Payment verification response */
export interface PaymentVerificationResponse {
  ok: boolean;
  verified: boolean;
  paymentState: 'payment_pending' | 'payment_submitted' | 'payment_confirming' | 'payment_verified' | 'payment_failed';
  txHash: string;
  explorerUrl?: string;
  amount: string;
  token: string;
  tokenSymbol: string;
  buyer: string;
  seller: string;
  chainId: number;
  network: string;
  error?: string;
  details?: string;
}

export type Deal = z.infer<typeof dealSchema>;

/** x402 Payment Challenge — returned as HTTP 402 when payment requires buyer authorization. */
export interface X402PaymentChallenge {
  paymentId: string;
  amount: string; // in base units (wei for native, smallest unit for ERC-20)
  token: string; // token contract address (or "native" for native token)
  tokenSymbol: string;
  tokenDecimals: number;
  recipient: string; // payTo address
  chainId: number;
  network: string;
  dealId: string; // roomId or transcriptHash as reference
  calldataSignRequest: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  expiresAt: string; // ISO timestamp
}

/** Default safety policy — the $50-vs-$500 guard (spec §6).
 * maxSingleTrade caps a single trade at 50 USDC; a $500 trade trips this.
 * The hard anomaly cap is 10x normal ($50). */
export const DEFAULT_POLICY: SafetyPolicy = {
  vaultBalance: 10_000,
  maxSingleTrade: 50,
  dailyBudget: 500,
  anomalyMultiplier: 10,
  normal: 50,
  dailySpent: 0,
};

export interface DealResponse {
  ok: boolean;
  mode: 'mock' | 'live' | 'x402';
  txHash: string;
  explorerUrl?: string;
  reputation: {
    buyer: { agentId: string } & ReputationResult;
    seller: { agentId: string } & ReputationResult;
  };
  /** x402 payment challenge — present when mode === 'x402' and payment requires buyer signature */
  x402Challenge?: X402PaymentChallenge;
}

export async function handleDeal(
  body: unknown,
  opts: { policy?: SafetyPolicy } = {},
): Promise<DealResponse> {
  const parsed = dealSchema.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error('invalid deal'), {
      statusCode: 400,
      details: parsed.error.issues,
    });
  }
  const deal = parsed.data;
  const policy = opts.policy ?? DEFAULT_POLICY;

  // 2. Safety gate.
  const verdict = evaluate(deal.totalUsdc, policy);
  if (!verdict.allow) {
    throw Object.assign(new Error(`blocked by safety: ${verdict.reason}`), {
      statusCode: 422,
      reason: verdict.reason,
    });
  }

  // Store deal for payment flow (keyed by roomId)
  dealStorage.set(deal.roomId, deal);

  // 3. Try x402 settlement first (primary settlement path when configured)
  const x402 = await getX402Adapter();

  if (x402) {
    // ── x402 settlement via GOAT Flow (EIP-3009 off-chain signature → on-chain settle) ──
    try {
      // Resolve seller wallet from ERC-8004 registry using seller's onchainAgentId
      const sellerAgentId = deal.seller.onchainAgentId;
      if (!sellerAgentId) {
        throw new Error('Seller onchainAgentId is required for x402 settlement. Register the seller agent on ERC-8004 Identity Registry first.');
      }

      const live = await getLiveAdapter();
      if (!live) {
        throw new Error('Live adapter not available for ERC-8004 wallet resolution. Set CHAIN_MODE=live with GOAT_PRIVATE_KEY.');
      }

      const resolvedSellerWallet = await live.resolveAgentWallet(sellerAgentId);
      if (!resolvedSellerWallet || !/^0x[a-fA-F0-9]{40}$/.test(resolvedSellerWallet)) {
        throw new Error(`Invalid wallet address resolved for Agent ID ${sellerAgentId}: ${resolvedSellerWallet}`);
      }

      // Update stored deal with resolved seller wallet
      const storedDeal = dealStorage.get(deal.roomId);
      if (storedDeal) {
        dealStorage.set(deal.roomId, { ...storedDeal, resolvedSellerWallet });
      }

      // Validate recipient is not the buyer
      if (resolvedSellerWallet.toLowerCase() === deal.buyer.wallet.toLowerCase()) {
        throw new Error('Resolved seller wallet cannot be the same as buyer wallet');
      }

      // Log payment flow details
      console.log('[Payment] Seller Agent ID:', sellerAgentId);
      console.log('[Payment] Resolved seller wallet:', resolvedSellerWallet);
      console.log('[Payment] Buyer wallet:', deal.buyer.wallet);
      console.log('[Payment] Token:', x402.getConfig().settleToken ?? 'GOAT (native)');
      console.log('[Payment] Amount:', deal.totalUsdc, 'USDC');
      console.log('[Payment] Chain ID:', x402.getConfig().chainId);

      const x402Result = await x402.settle(deal, undefined, resolvedSellerWallet);
      
      // If payment requires buyer signature, return HTTP 402 with payment challenge
      if (x402Result.requiresSignature && x402Result.calldataSignRequest) {
        const config = x402.getConfig();
        const assetSymbol = x402Result.calldataSignRequest.message.asset as string ?? config.settleToken ?? 'GOAT';
        const tokenInfo = resolveTestnet3Token(assetSymbol);
        
        const challenge: X402PaymentChallenge = {
          paymentId: x402Result.paymentId,
          amount: x402Result.calldataSignRequest.message.amount as string,
          token: config.settleToken ?? 'native',
          tokenSymbol: tokenInfo?.symbol ?? assetSymbol,
          tokenDecimals: tokenInfo?.decimals ?? config.tokenDecimals,
          recipient: resolvedSellerWallet,
          chainId: config.chainId,
          network: config.network,
          dealId: deal.roomId,
          calldataSignRequest: {
            domain: x402Result.calldataSignRequest.domain,
            types: x402Result.calldataSignRequest.types as Record<string, { name: string; type: string }[]>,
            primaryType: x402Result.calldataSignRequest.primaryType,
            message: x402Result.calldataSignRequest.message,
          },
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
        };
        
        throw Object.assign(new Error('Payment required: x402 buyer authorization needed'), {
          statusCode: 402,
          x402Challenge: challenge,
        });
      }

      const proof = {
        fromAddress: deal.buyer.wallet,
        toAddress: resolvedSellerWallet,
        chainId: x402.getConfig().chainId,
        txHash: x402Result.txHash,
      };

      // Get live adapter for reputation (may be null)
      const liveForRep = await getLiveAdapter();
      const repProvider = new ReputationProvider(liveForRep);

      // Record reputation for both parties
      const buyerAgent = { agentId: deal.buyer.agentId, count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
      const sellerAgent = { agentId: deal.seller.agentId, count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
      
      try {
        if (deal.buyer.onchainAgentId) {
          const r = await repProvider.giveFeedback({
            agentId: deal.buyer.onchainAgentId, value: 1, decimals: 0,
            tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
          });
          Object.assign(buyerAgent, r);
        }
        if (deal.seller.onchainAgentId) {
          const r = await repProvider.giveFeedback({
            agentId: deal.seller.onchainAgentId, value: 1, decimals: 0,
            tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
          });
          Object.assign(sellerAgent, r);
        }
      } catch (e) {
        console.error('[chain] x402 reputation write failed (settlement stands):', (e as Error).message);
      }

      return {
        ok: true, mode: 'x402', txHash: x402Result.txHash, explorerUrl: x402Result.explorerUrl,
        reputation: { buyer: buyerAgent, seller: sellerAgent },
      };
    } catch (e) {
      console.error('[chain] x402 settlement failed, falling back to live/mock:', (e as Error).message);
      // Fall through to live/mock paths
    }
  }

  // 4-5: settle + record reputation. Try LIVE (on-chain) when configured and
  // ready; otherwise fall back to the MOCK facilitator + in-memory reputation.
  const live = await getLiveAdapter();
  const repProvider = new ReputationProvider(live);

  // Resolve seller wallet from ERC-8004 for live/mock paths too
  let resolvedSellerWallet = deal.seller.wallet;
  if (deal.seller.onchainAgentId) {
    if (live) {
      try {
        resolvedSellerWallet = await live.resolveAgentWallet(deal.seller.onchainAgentId);
        if (!resolvedSellerWallet || !/^0x[a-fA-F0-9]{40}$/.test(resolvedSellerWallet)) {
          throw new Error(`Invalid wallet address resolved for Agent ID ${deal.seller.onchainAgentId}: ${resolvedSellerWallet}`);
        }
        if (resolvedSellerWallet.toLowerCase() === deal.buyer.wallet.toLowerCase()) {
          throw new Error('Resolved seller wallet cannot be the same as buyer wallet');
        }
      } catch (e) {
        console.error('[chain] Failed to resolve seller wallet from ERC-8004, using deal.seller.wallet:', (e as Error).message);
      }
    }
  }

  // Log payment flow details for live/mock
  console.log('[Payment] Seller Agent ID:', deal.seller.onchainAgentId ?? 'unknown');
  console.log('[Payment] Resolved seller wallet:', resolvedSellerWallet);
  console.log('[Payment] Buyer wallet:', deal.buyer.wallet);
  console.log('[Payment] Token:', live ? 'GOAT (live)' : 'GOAT (mock)');
  console.log('[Payment] Amount:', deal.totalUsdc, 'USDC');
  console.log('[Payment] Chain ID:', live?.chainId ?? 84532);

  // Update stored deal with resolved seller wallet
  const storedDeal = dealStorage.get(deal.roomId);
  if (storedDeal) {
    dealStorage.set(deal.roomId, { ...storedDeal, resolvedSellerWallet });
  }

  if (live) {
    // ── LIVE on-chain settlement (real token transfer to the resolved seller wallet) ──
    const { txHash } = await live.settle(resolvedSellerWallet, deal.totalUsdc);
    const cfg = loadChainConfig();
    const explorerUrl = `${explorerBase(cfg.network)}/tx/${txHash}`;
    const proof = {
      fromAddress: deal.buyer.wallet,
      toAddress: resolvedSellerWallet,
      chainId: live.chainId,
      txHash,
    };

    // On-chain reputation requires numeric ERC-8004 agentIds (register first).
    // When provided, record real/equivalent feedback; else skip gracefully
    // (settlement is still real). We never let a reputation error void a
    // completed payment. The provider auto-falls-back to off-chain when the
    // Reputation Registry is a placeholder (e.g. GOAT Testnet3 today).
    const buyerAgent = { agentId: deal.buyer.agentId, count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
    const sellerAgent = { agentId: deal.seller.agentId, count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
    try {
      if (deal.buyer.onchainAgentId) {
        const r = await repProvider.giveFeedback({
          agentId: deal.buyer.onchainAgentId, value: 1, decimals: 0,
          tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
        });
        Object.assign(buyerAgent, r);
      }
      if (deal.seller.onchainAgentId) {
        const r = await repProvider.giveFeedback({
          agentId: deal.seller.onchainAgentId, value: 1, decimals: 0,
          tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
        });
        Object.assign(sellerAgent, r);
      }
    } catch (e) {
      // Reputation is best-effort in live mode; payment already settled on-chain.
      console.error('[chain] live reputation write failed (settlement stands):', (e as Error).message);
    }

    return {
      ok: true, mode: 'live', txHash, explorerUrl,
      reputation: { buyer: buyerAgent, seller: sellerAgent },
    };
  }

  // ── MOCK settlement (default, keyless) ──
  const payment = buildPayment(deal.buyer.wallet, resolvedSellerWallet, deal.totalUsdc);
  const verify = await facilitator.verify(payment);
  if (!verify.ok) {
    throw Object.assign(new Error(`payment verify failed: ${verify.error}`), {
      statusCode: 422,
      reason: verify.error,
    });
  }
  const { txHash } = await facilitator.settle(payment);

  // 4. Record reputation for both parties w/ proofOfPayment = mock txHash.
  // Routed through the provider so the off-chain store is the single source
  // of truth (same backend the live mode falls back to).
  const proof = {
    fromAddress: deal.buyer.wallet,
    toAddress: resolvedSellerWallet,
    chainId: 84532,
    txHash,
  };
  // Buyer gets "paid" feedback; seller gets "fulfilled" feedback. Values are
  // illustrative (MVP3 reputation scoring is ours, off-chain).
  const buyerRec = await repProvider.giveFeedback({
    agentId: deal.buyer.agentId,
    value: 1,
    decimals: 0,
    tag1: 'deal',
    tag2: 'paid',
    endpoint: '/deals',
    feedbackHash: deal.transcriptHash,
    proofOfPayment: proof,
  });
  const sellerRec = await repProvider.giveFeedback({
    agentId: deal.seller.agentId,
    value: 1,
    decimals: 0,
    tag1: 'deal',
    tag2: 'fulfilled',
    endpoint: '/deals',
    feedbackHash: deal.transcriptHash,
    proofOfPayment: proof,
  });

  // 5. Response.
  return {
    ok: true,
    mode: 'mock',
    txHash,
    reputation: {
      buyer: { agentId: deal.buyer.agentId, ...buyerRec },
      seller: { agentId: deal.seller.agentId, ...sellerRec },
    },
  };
}

export function registerDealsRoutes(
  app: FastifyInstance,
  opts: { policy?: SafetyPolicy } = {},
): void {
  app.post('/deals', async (request, reply) => {
    try {
      const result = await handleDeal(request.body, opts);
      return reply.code(200).send(result);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; reason?: string; x402Challenge?: X402PaymentChallenge };
      const status = e.statusCode ?? 500;
      const body: Record<string, unknown> = {
        ok: false,
        error: e.message,
        reason: e.reason,
      };
      if (status === 402 && e.x402Challenge) {
        body.x402Challenge = e.x402Challenge;
      }
      return reply.code(status).send(body);
    }
  });

  // POST /deals/:roomId/authorize — submit buyer's EIP-712 signature to authorize x402 payment
  app.post('/deals/:roomId/authorize', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const parsed = x402AuthorizeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid authorization request', details: parsed.error.issues });
    }
    const { paymentId, signature, calldataSignRequest } = parsed.data;

    const x402 = await getX402Adapter();
    if (!x402) {
      return reply.code(422).send({ ok: false, error: 'x402 not configured' });
    }

    try {
      // Validate the signature if calldataSignRequest is provided
      if (calldataSignRequest) {
        const { domain, types, primaryType, message } = calldataSignRequest;
        
        // Recover the signer address from the signature
        const recoveredAddress = await recoverTypedDataAddress({
          domain: domain as any,
          types: types as any,
          primaryType,
          message: message as any,
          signature: signature as `0x${string}`,
        });

        // Get the expected buyer address from the message (fromAddress in the payment intent)
        const expectedBuyerAddress = (message.fromAddress as string)?.toLowerCase();
        
        if (!expectedBuyerAddress) {
          return reply.code(422).send({ ok: false, error: 'missing fromAddress in signed message' });
        }

        // Verify the signer matches the buyer
        if (recoveredAddress.toLowerCase() !== expectedBuyerAddress) {
          return reply.code(422).send({ 
            ok: false, 
            error: 'signature signer mismatch', 
            details: `Expected ${expectedBuyerAddress}, got ${recoveredAddress}` 
          });
        }

        // Verify the signed message matches the original challenge
        // Check amount, token, recipient, chain, dealId
        const config = x402.getConfig();
        
        // Verify amount (in base units)
        const signedAmount = message.amount as string;
        if (signedAmount !== message.amount) {
          return reply.code(422).send({ ok: false, error: 'amount mismatch in signature' });
        }

        // Verify token (asset symbol should match configured settle token)
        const signedAsset = message.asset as string;
        const expectedAsset = config.settleToken ? signedAsset : 'BTC'; // native BTC if no settle token
        // The asset symbol in message should match what we expect
        // Note: GOAT Flow API uses asset symbols, not addresses

        // Verify recipient (to address)
        const signedTo = message.to as string;
        if (signedTo.toLowerCase() !== config.payTo.toLowerCase()) {
          return reply.code(422).send({ ok: false, error: 'recipient mismatch in signature' });
        }

        // Verify chain ID
        const signedChainId = message.chainId as number;
        if (signedChainId !== config.chainId) {
          return reply.code(422).send({ ok: false, error: 'chain ID mismatch in signature' });
        }

        // Verify dealId (roomId) - stored in idempotencyKey or as custom field
        // The paymentId is the unique identifier for this payment
      }

      // Authorize payment with buyer's signature
      const authResult = await x402.authorizePayment(paymentId, signature, calldataSignRequest);
      
      if (authResult.status !== 'authorized') {
        return reply.code(422).send({ ok: false, error: 'payment authorization failed', paymentId, status: authResult.status });
      }

      // Poll for settlement completion
      const statusResult = await x402.pollUntilFinal(paymentId);
      
      if (statusResult.status !== 'settled') {
        return reply.code(422).send({ ok: false, error: `payment not settled: ${statusResult.status}`, paymentId, status: statusResult.status });
      }

      // Extract REAL transaction hash from GOAT Flow API response
      const txHash = X402Adapter.extractTxHashFromRaw(statusResult.raw) ?? X402Adapter.generateMockTxHash(paymentId);
      const explorerUrl = X402Adapter.buildExplorerUrl(txHash);

      return reply.code(200).send({
        ok: true,
        mode: 'x402',
        txHash,
        explorerUrl,
        paymentId,
        status: statusResult.status,
      });
    } catch (err) {
      console.error('[chain] x402 authorization failed:', (err as Error).message);
      return reply.code(500).send({ ok: false, error: (err as Error).message });
    }
  });

  // In-memory storage for replay protection: tracks used txHashes per roomId
  // In production, this should be persisted to a database
  const usedPaymentTxHashes = new Map<string, Set<string>>(); // roomId -> Set<txHash>

  // GET /deals/:roomId/payment/info — return payment details for the buyer to execute payment
  // Supports both native BTC and ERC-20 GOAT token payments based on configuration
  app.get('/deals/:roomId/payment/info', async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    
    // Retrieve stored deal
    const deal = dealStorage.get(roomId);
    if (!deal) {
      return reply.code(404).send({ 
        ok: false, 
        error: 'Deal not found for this roomId',
        hint: 'Call POST /deals with the deal data first, then use the roomId to fetch payment info.'
      });
    }
    
    const config = loadChainConfig();
    const isNativePayment = !config.settleToken;
    const tokenAddress = config.settleToken ?? 'native';
    const tokenDecimals = config.tokenDecimals ?? 18;
    
    // GOAT Testnet3 native gas token is TBTC (testnet BTC). GOAT is an ERC-20 token at 0xbC10000000000000000000000000000000000001
    const tokenInfo = config.settleToken 
      ? resolveTestnet3Token(config.settleToken) 
      : { symbol: 'TBTC', decimals: 18, name: 'Testnet BTC (native gas token on GOAT Testnet3)' };
    const tokenSymbol = tokenInfo?.symbol ?? (isNativePayment ? 'TBTC' : 'GOAT');
    const sellerAgentId = deal.seller.onchainAgentId ?? 'unknown';
    
    // Validate payment configuration - fail fast if inconsistent
    if (!isNativePayment && !config.settleToken) {
      return reply.code(500).send({
        ok: false,
        error: 'Payment configuration error',
        details: 'GOAT_SETTLE_TOKEN is not set but ERC-20 payment was expected',
      });
    }
    if (isNativePayment && config.settleToken) {
      return reply.code(500).send({
        ok: false,
        error: 'Payment configuration error',
        details: 'GOAT_SETTLE_TOKEN is set but native payment path was triggered',
      });
    }
    
    // Convert USD amount to token base units
    // For native BTC: 18 decimals, assume 1 BTC = 1 USD (or use price oracle in future)
    // For ERC-20 GOAT: 18 decimals
    const amountInBaseUnits = BigInt(Math.round(deal.totalUsdc * Math.pow(10, tokenDecimals))).toString();
    
    const resolvedSellerWallet = deal.resolvedSellerWallet ?? deal.seller.wallet;
    
    // Log payment info details
    console.log('[Payment Info] Room ID:', roomId);
    console.log('[Payment Info] Seller Agent ID:', sellerAgentId);
    console.log('[Payment Info] Resolved seller wallet:', resolvedSellerWallet);
    console.log('[Payment Info] Buyer wallet:', deal.buyer.wallet);
    console.log('[Payment Info] Payment type:', isNativePayment ? 'Native TBTC' : 'ERC-20 GOAT');
    console.log('[Payment Info] Token contract:', tokenAddress);
    console.log('[Payment Info] Token symbol:', tokenSymbol);
    console.log('[Payment Info] Token decimals:', tokenDecimals);
    console.log('[Payment Info] Amount (USDC):', deal.totalUsdc);
    console.log('[Payment Info] Amount (base units):', amountInBaseUnits);
    console.log('[Payment Info] Chain ID:', 48816);
    
    const paymentInfo = {
      roomId,
      dealId: deal.transcriptHash,
      totalUsdc: deal.totalUsdc,
      amount: amountInBaseUnits,
      tokenAddress,
      tokenSymbol,
      tokenDecimals,
      isNative: isNativePayment,
      sellerAgentId,
      sellerAddress: resolvedSellerWallet,
      buyerAddress: deal.buyer.wallet,
      chainId: 48816,
      network: 'goat-testnet',
      rpcUrl: config.rpcUrl ?? 'https://rpc.testnet3.goat.network',
      explorerBaseUrl: 'https://explorer.testnet3.goat.network',
    };
    
    return reply.code(200).send(paymentInfo);
  });

  // POST /deals/:roomId/payment/verify — verify on-chain ERC-20 payment
    app.post('/deals/:roomId/payment/verify', async (request, reply) => {
      const { roomId } = request.params as { roomId: string };
      const parsed = paymentVerifySchema.safeParse(request.body);

      console.log('[verifyPayment] REQUEST RECEIVED', {
        roomId,
        txHash: (request.body as Record<string, unknown>)?.txHash as string | undefined,
        method: request.method,
        url: request.url,
        headers: request.headers,
        ip: request.ip
      });

      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: 'invalid request', details: parsed.error.issues });
      }
    
    const { txHash } = parsed.data;
    const cfg = loadChainConfig();
    const tokenDecimals = cfg.tokenDecimals ?? 18;
    
    // Replay protection: check if this txHash was already used for any deal
    for (const [usedRoomId, txHashes] of usedPaymentTxHashes.entries()) {
      if (txHashes.has(txHash.toLowerCase())) {
        return reply.code(422).send({ 
          ok: false, 
          verified: false, 
          paymentState: 'payment_failed',
          error: 'Transaction hash already used for another deal',
          details: `txHash ${txHash} was already used for room ${usedRoomId}`,
          txHash,
          chainId: 48816,
          network: 'goat-testnet',
        });
      }
    }
    
    // Retrieve stored deal to get resolved seller wallet
    const storedDeal = dealStorage.get(roomId);
    if (!storedDeal) {
      return reply.code(422).send({
        ok: false,
        verified: false,
        paymentState: 'payment_failed',
        error: 'Deal not found for verification',
        details: `No deal stored for roomId ${roomId}`,
        txHash,
        chainId: 48816,
        network: 'goat-testnet',
      });
    }
    
    const resolvedSellerWallet = storedDeal.resolvedSellerWallet ?? storedDeal.seller.wallet;
    const sellerAgentId = storedDeal.seller.onchainAgentId ?? 'unknown';
    const expectedToken = cfg.settleToken?.toLowerCase();
    const isNativePayment = !expectedToken;
    const expectedAmount = BigInt(Math.round(storedDeal.totalUsdc * Math.pow(10, tokenDecimals)));
    const rpcUrl = cfg.rpcUrl ?? GOAT_NETWORKS['goat-testnet']?.rpcUrl;
    const requestId = `verify_${txHash.slice(0, 8)}_${Date.now()}`;
    
    // Native currency on GOAT Testnet3 is TBTC (testnet BTC). GOAT is an ERC-20 token.
    const nativeTokenSymbol = 'TBTC';
    const tokenSymbol = isNativePayment ? nativeTokenSymbol : (resolveTestnet3Token(cfg.settleToken ?? '')?.symbol ?? 'GOAT');
    
    // Log verification details
    console.log('[Payment Verify]', requestId, 'Transaction hash:', txHash);
    console.log('[Payment Verify]', requestId, 'Chain ID:', 48816);
    console.log('[Payment Verify]', requestId, 'RPC URL:', rpcUrl);
    console.log('[Payment Verify]', requestId, 'Payment type:', isNativePayment ? 'Native TBTC' : 'ERC-20 GOAT');
    console.log('[Payment Verify]', requestId, 'Token contract:', expectedToken ?? 'native TBTC');
    console.log('[Payment Verify]', requestId, 'Token symbol:', tokenSymbol);
    console.log('[Payment Verify]', requestId, 'Token decimals:', tokenDecimals);
    console.log('[Payment Verify]', requestId, 'Seller Agent ID:', sellerAgentId);
    console.log('[Payment Verify]', requestId, 'Expected seller wallet:', resolvedSellerWallet);
    console.log('[Payment Verify]', requestId, 'Buyer wallet:', storedDeal.buyer.wallet);
    console.log('[Payment Verify]', requestId, 'Expected amount (base units):', expectedAmount.toString());
    console.log('[Payment Verify]', requestId, 'Expected amount (USDC):', storedDeal.totalUsdc);
    
    // Create public client to verify on-chain
    const { createPublicClient, http } = await import('viem');
    
    const net = GOAT_NETWORKS['goat-testnet'];
    const chain = {
      id: net.chainId,
      name: 'goat-testnet',
      nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
      rpcUrls: { default: { http: [cfg.rpcUrl ?? net.rpcUrl] } },
    } as const;
    
    const publicClient = createPublicClient({ 
      chain: chain as any, 
      transport: http(cfg.rpcUrl ?? net.rpcUrl) 
    });
    
    // Get the actual chain ID from the RPC/provider
    let providerChainId: bigint;
    try {
      providerChainId = BigInt(await publicClient.getChainId());
      console.log('[Payment Verify] Provider chainId:', providerChainId.toString());
    } catch (e) {
      console.error('[Payment Verify] Failed to get chainId from provider:', e);
      return reply.code(500).send({
        ok: false,
        verified: false,
        paymentState: 'payment_failed',
        error: 'Failed to verify chain ID from RPC',
        txHash,
        chainId: 48816,
        network: 'goat-testnet',
      });
    }
    
    try {
      // 1. Wait for transaction receipt with timeout (60 seconds, polling every 2 seconds)
      // This handles the case where transaction is still pending
      let receipt;
      try {
        receipt = await waitForTransactionReceipt(publicClient, {
          hash: txHash as `0x${string}`,
          timeout: 60_000, // 60 seconds timeout
          pollingInterval: 2_000, // poll every 2 seconds
        });
      } catch (waitError: unknown) {
        const err = waitError as Error & { code?: string; message?: string };
        // Check if it's a timeout error (transaction not mined yet)
        if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout') || err.message?.includes('not found')) {
          console.warn('[Payment Verify] Transaction receipt not available yet (timeout):', txHash);
          return reply.code(202).send({
            ok: false,
            verified: false,
            paymentState: 'payment_pending',
            error: 'Transaction still pending',
            details: 'Transaction has not been mined yet. Please retry verification in a few moments.',
            txHash,
            chainId: 48816,
            network: 'goat-testnet',
          });
        }
        // Re-throw other errors
        throw waitError;
      }
      
      if (!receipt) {
        console.warn('[Payment Verify] No receipt returned:', txHash);
        return reply.code(202).send({
          ok: false,
          verified: false,
          paymentState: 'payment_pending',
          error: 'Transaction receipt not available',
          details: 'Transaction receipt not found. Transaction may still be pending.',
          txHash,
          chainId: 48816,
          network: 'goat-testnet',
        });
      }
      
      console.log('[Payment Verify] Receipt found:', { 
        blockNumber: receipt.blockNumber?.toString(), 
        status: receipt.status,
        chainId: receipt.chainId?.toString(),
        gasUsed: receipt.gasUsed?.toString(),
      });
      
      // Get transaction details for additional verification
      const tx = await publicClient.getTransaction({
        hash: txHash as `0x${string}`,
      });
      
      console.log('[Payment Verify] Transaction details:', {
        txHash,
        txFrom: tx?.from,
        txTo: tx?.to,
        txValue: tx?.value?.toString(),
        txChainId: tx?.chainId?.toString(),
        receiptStatus: receipt.status,
        providerChainId: providerChainId.toString(),
      });
      
      if (!tx) {
        return reply.code(422).send({
          ok: false,
          verified: false,
          paymentState: 'payment_failed',
          error: 'Transaction details not found',
          txHash,
          chainId: 48816,
          network: 'goat-testnet',
        });
      }
      
      // 2. Verify transaction is successful
      if (receipt.status !== 'success') {
        // Transaction reverted - status will be 'reverted'
        // We can't easily get the exact revert reason without archive node access
        return reply.code(422).send({
          ok: false,
          verified: false,
          paymentState: 'payment_failed',
          error: 'Transaction reverted on-chain',
          details: 'Transaction execution reverted. Check transaction on explorer for details.',
          txHash,
          chainId: 48816,
          network: 'goat-testnet',
        });
      }
      
      // 3. Verify chain ID
      if (providerChainId !== 48816n) {
        return reply.code(422).send({
          ok: false,
          verified: false,
          paymentState: 'payment_failed',
          error: 'Wrong chain',
          details: `Provider is on chain ${providerChainId}, expected 48816 (GOAT Testnet3)`,
          txHash,
          chainId: Number(providerChainId),
          network: 'goat-testnet',
        });
      }
      
      // 5. Verify payment based on payment type (native TBTC vs ERC-20)
      let matchedTransfer: { from: string; to: string; value: bigint } | null = null;
      
      if (isNativePayment) {
        // Native TBTC payment: verify tx.to == resolvedSellerWallet and tx.value == expectedAmount
        console.log('[Payment Verify] Verifying native TBTC payment:', {
          txTo: tx?.to,
          expectedRecipient: resolvedSellerWallet,
          txValue: tx?.value?.toString(),
          expectedAmount: expectedAmount.toString(),
        });
        
        const receiptStatusOk = receipt.status === 'success';
        const providerChainOk = providerChainId === 48816n;
        
        // Normalize tx.chainId (can be string "48816", number, bigint, or undefined)
        const txChainIdRaw = tx?.chainId;
        const txChainIdNormalized = txChainIdRaw == null ? undefined : BigInt(txChainIdRaw);
        const expectedChainId = 48816n;
        const txChainOk = txChainIdNormalized === expectedChainId || txChainIdNormalized === undefined;
        
        const senderOk = tx?.from?.toLowerCase() === storedDeal.buyer.wallet.toLowerCase();
        const recipientOk = tx?.to?.toLowerCase() === resolvedSellerWallet.toLowerCase();
        const amountOk = tx?.value === expectedAmount;
        
        const allPass = receiptStatusOk && providerChainOk && txChainOk && senderOk && recipientOk && amountOk;
        
        console.log('[Payment Verify] Native TBTC validation checks:', {
          receiptStatusOk,
          providerChainOk,
          txChainIdRaw,
          txChainIdNormalized: txChainIdNormalized?.toString(),
          expectedChainId: expectedChainId.toString(),
          txChainOk,
          senderOk,
          recipientOk,
          amountOk,
          allPass,
        });
        
        if (!receiptStatusOk) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Transaction receipt status not success',
            details: `receipt.status = ${receipt.status}`,
            txHash, chainId: 48816, network: 'goat-testnet',
          });
        }
        
        if (!providerChainOk) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Wrong chain',
            details: `Provider chainId = ${providerChainId}, expected 48816`,
            txHash, chainId: Number(providerChainId), network: 'goat-testnet',
          });
        }
        
        if (!senderOk) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Wrong sender',
            details: `tx.from = ${tx.from}, expected buyer = ${storedDeal.buyer.wallet}`,
            txHash, chainId: 48816, network: 'goat-testnet',
          });
        }
        
        if (!recipientOk) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Wrong recipient',
            details: `tx.to = ${tx.to}, expected seller = ${resolvedSellerWallet}`,
            txHash, chainId: 48816, network: 'goat-testnet',
          });
        }
        
        if (!amountOk) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Wrong amount',
            details: `tx.value = ${tx.value}, expected = ${expectedAmount}`,
            txHash, chainId: 48816, network: 'goat-testnet',
          });
        }
        
        if (!allPass) {
          return reply.code(422).send({
            ok: false, verified: false, paymentState: 'payment_failed',
            error: 'Native TBTC verification failed',
            details: `One or more validation checks failed. allPass=false`,
            txHash, chainId: 48816, network: 'goat-testnet',
          });
        }
        
        matchedTransfer = {
          from: tx.from,
          to: tx.to,
          value: tx.value,
        };
        
        console.log('[Payment Verify] Native TBTC verification PASSED, matchedTransfer:', {
          from: matchedTransfer.from,
          to: matchedTransfer.to,
          value: matchedTransfer.value.toString(),
        });
      } else {
        // ERC-20 payment: verify token contract and Transfer event
        if (!expectedToken) {
          return reply.code(500).send({
            ok: false,
            verified: false,
            paymentState: 'payment_failed',
            error: 'No settlement token configured',
            details: 'GOAT_SETTLE_TOKEN environment variable is not set but ERC-20 payment was expected',
            txHash,
            chainId: 48816,
            network: 'goat-testnet',
          });
        }
        
        if (tx.to?.toLowerCase() !== expectedToken) {
          return reply.code(422).send({
            ok: false,
            verified: false,
            paymentState: 'payment_failed',
            error: 'Wrong token contract',
            details: `Transaction sent to ${tx.to}, expected token ${expectedToken}`,
            txHash,
            token: tx.to,
            chainId: 48816,
            network: 'goat-testnet',
          });
        }
        
        // 6. Parse Transfer events from logs
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
          return reply.code(422).send({
            ok: false,
            verified: false,
            paymentState: 'payment_failed',
            error: 'No Transfer event found',
            details: 'Transaction does not contain an ERC-20 Transfer event',
            txHash,
            chainId: 48816,
            network: 'goat-testnet',
          });
        }
        
        // 7. Find the transfer that matches expected amount, sender, recipient
        const deal = storedDeal;
        
        // Calculate expected amount once (outside the loop for error message)
        const expectedAmount = BigInt(Math.round(deal.totalUsdc * Math.pow(10, tokenDecimals)));
        
        for (const log of transferLogs) {
          try {
            const decoded = decodeEventLog({
              abi: transferAbi,
              data: log.data,
              topics: log.topics,
            });
            
            // decoded.args = { from, to, value }
            const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
            
            // Verify: from = buyer, to = resolved seller wallet, value = expected amount
            if (from.toLowerCase() === deal.buyer.wallet.toLowerCase() &&
                to.toLowerCase() === resolvedSellerWallet.toLowerCase() &&
                value === expectedAmount) {
              matchedTransfer = { from, to, value };
              break;
            }
          } catch (e) {
            // Ignore decode errors
          }
        }
        
        if (!matchedTransfer) {
          return reply.code(422).send({
            ok: false,
          verified: false,
          paymentState: 'payment_failed',
          error: 'No matching Transfer event',
          details: `No Transfer event found matching buyer=${deal.buyer.wallet}, seller=${resolvedSellerWallet}, amount=${deal.totalUsdc} USDC (${expectedAmount} base units)`,
          txHash,
          chainId: 48816,
          network: 'goat-testnet',
        });
      }
      
      // 8. Mark txHash as used for this roomId (replay protection)
      if (!usedPaymentTxHashes.has(roomId)) {
        usedPaymentTxHashes.set(roomId, new Set());
      }
      usedPaymentTxHashes.get(roomId)!.add(txHash.toLowerCase());
      
      // 9. Trigger settlement: record reputation for both parties
      const live = await getLiveAdapter();
      const repProvider = new ReputationProvider(live);
      
      const proof = {
        fromAddress: deal.buyer.wallet,
        toAddress: resolvedSellerWallet,
        chainId: 48816,
        txHash,
      };
      
      // Buyer gets "paid" feedback; seller gets "fulfilled" feedback
      const buyerAgent = { count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
      const sellerAgent = { count: 0, summaryValue: 0, summaryValueDecimals: 0, mode: "offchain" as const };
      
      try {
        if (deal.buyer.onchainAgentId) {
          const r = await repProvider.giveFeedback({
            agentId: deal.buyer.onchainAgentId, value: 1, decimals: 0,
            tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
          });
          Object.assign(buyerAgent, r);
        }
        if (deal.seller.onchainAgentId) {
          const r = await repProvider.giveFeedback({
            agentId: deal.seller.onchainAgentId, value: 1, decimals: 0,
            tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: deal.transcriptHash, proofOfPayment: proof,
          });
          Object.assign(sellerAgent, r);
        }
      } catch (e) {
        console.error('[chain] Payment verification settlement reputation write failed:', (e as Error).message);
      }
      
      const tokenSymbol = isNativePayment ? 'TBTC' : (resolveTestnet3Token(cfg.settleToken ?? '')?.symbol ?? 'GOAT');
      
      // 10. Create settlement record
      const { createDirectSettlementRecord, persistSettlement } = await import('./settlementStore.js');
      const settlementRecord = createDirectSettlementRecord(
        deal,
        txHash,
        `${explorerBase(cfg.network)}/tx/${txHash}`,
        tokenSymbol
      );
      persistSettlement(settlementRecord);
      
      // 11. Return success response with settlement info
      const explorerUrl = `${explorerBase(cfg.network)}/tx/${txHash}`;
      const amountStr = matchedTransfer.value.toString();
      
      // For native payments, token is "native" not undefined
      const tokenValue = expectedToken ?? 'native';
      
      // Helper to recursively convert BigInt values to strings for JSON serialization
      function sanitizeForJson(obj: unknown): unknown {
        if (typeof obj === 'bigint') return obj.toString();
        if (Array.isArray(obj)) return obj.map(sanitizeForJson);
        if (obj && typeof obj === 'object') {
          const sanitized: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) {
            sanitized[k] = sanitizeForJson(v);
          }
          return sanitized;
        }
        return obj;
      }
      
      const successResponse = sanitizeForJson({
        ok: true,
        verified: true,
        paymentState: 'payment_verified' as const,
        txHash,
        explorerUrl,
        amount: amountStr,
        token: tokenValue,
        tokenSymbol,
        buyer: matchedTransfer.from,
        seller: matchedTransfer.to,
        chainId: 48816,
        network: 'goat-testnet',
        settlement: {
          id: settlementRecord.id,
          paymentId: settlementRecord.paymentId,
          status: settlementRecord.status,
          txHash: settlementRecord.txHash,
          explorerUrl: settlementRecord.explorerUrl,
          mode: settlementRecord.mode,
          reputation: {
            buyer: { agentId: deal.buyer.agentId, ...buyerAgent },
            seller: { agentId: deal.seller.agentId, ...sellerAgent },
          },
        },
      }) as PaymentVerificationResponse;
            console.log('[Payment Verify]', requestId, 'SUCCESS response:', JSON.stringify(successResponse, null, 2));
            console.log('[verifyPayment] RESPONSE BODY: sending success response', {
              statusCode: 200,
              contentType: 'application/json',
              hasTxHash: !!successResponse.txHash,
              verified: successResponse.verified,
              ok: successResponse.ok,
              paymentState: successResponse.paymentState
            });

            console.log('[verifyPayment] ABOUT TO SEND SUCCESS RESPONSE', {
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: successResponse,
        bodyLength: JSON.stringify(successResponse).length
      });

      return reply
        .code(200)
        .header('Content-Type', 'application/json; charset=utf-8')
        .send(successResponse);
          }  // Close the outer try block

          } catch (err) {
            console.error('[chain] Payment verification failed:', requestId, (err as Error).message);
            const errorResponse = {
              ok: false,
              verified: false,
              paymentState: 'payment_failed',
              error: (err as Error).message,
              txHash,
              chainId: 48816,
              network: 'goat-testnet',
            };
            console.log('[verifyPayment] ABOUT TO SEND ERROR RESPONSE', {
              status: 500,
              contentType: 'application/json; charset=utf-8',
              body: errorResponse,
              bodyLength: JSON.stringify(errorResponse).length
            });

            return reply
              .code(500)
              .header('Content-Type', 'application/json; charset=utf-8')
              .send(errorResponse);
          }
        });
  // POST /register — register an agent on the ERC-8004 Identity Registry (live
  // mode only). Returns { txHash, agentId } where agentId is the numeric
  // ERC-721 tokenId to pass back as onchainAgentId on future deals. In mock
  // mode this returns 422 (nothing to register off-chain).
  const registerSchema = z.object({ agentURI: z.string().min(1) });
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'agentURI required' });
    }
    const live = await getLiveAdapter();
    if (!live) {
      return reply.code(422).send({
        ok: false,
        error: 'registration requires CHAIN_MODE=live with a funded GOAT_PRIVATE_KEY',
      });
    }
    try {
      const { txHash, agentId } = await live.register(parsed.data.agentURI);
      const cfg = loadChainConfig();
      return reply.code(200).send({
        ok: true,
        agentId,
        txHash,
        explorerUrl: `${explorerBase(cfg.network)}/tx/${txHash}`,
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: (err as Error).message });
    }
  });

  // GET /mode — report whether the chain service is settling live, x402, or mock.
  app.get('/mode', async () => {
    const cfg = loadChainConfig();
    const liveCheck = isLiveReady(cfg);
    const x402Check = isX402Ready();
    let mode: 'live' | 'x402' | 'mock';
    let liveReady = liveCheck.ready;
    let x402Ready = x402Check.ready;
    if (liveCheck.ready) {
      mode = 'live';
    } else if (x402Check.ready) {
      mode = 'x402';
    } else {
      mode = 'mock';
    }
    return {
      mode,
      network: cfg.network,
      liveReady,
      x402Ready,
      reason: liveCheck.reason ?? x402Check.reason,
    };
  });
}
