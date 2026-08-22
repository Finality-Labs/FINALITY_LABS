/**
 * Settlement Persistence Module
 *
 * Persists all settlement information from the x402 payment flow.
 * Uses in-memory storage for Stage 3 (replaceable with database in production).
 * Only persists values returned/verified by GOAT Flow SDK.
 */

import type { Deal } from './deals.js';
import type { X402SettlementResult } from './x402Adapter.js';

export type SettlementMode = 'x402' | 'live' | 'mock';

export type SettlementStatus = 'pending' | 'created' | 'authorized' | 'settled' | 'failed' | 'expired' | 'rejected';

export interface SettlementRecord {
  /** Unique internal settlement ID */
  id: string;

  /** GOAT Flow payment ID (primary external identifier) */
  paymentId: string;

  /** Optional compatibility field for systems expecting orderId */
  orderId?: string;

  /** Deal reference */
  dealId: string;
  roomId: string;
  transcriptHash: string;

  /** Settlement mode */
  mode: SettlementMode;

  /** Settlement status */
  status: SettlementStatus;

  /** Payment status from GOAT Flow */
  paymentStatus?: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';

  /** On-chain transaction hash (returned by GOAT Flow when settled) */
  txHash?: string;

  /** Explorer URL for the transaction */
  explorerUrl?: string;

  /** Payer (buyer) wallet address */
  payerWallet: string;

  /** Recipient (payTo/merchant) wallet address */
  payToWallet: string;

  /** Token symbol (e.g., GOAT, USDC) */
  token?: string;

  /** Token contract address (if ERC-20) */
  tokenAddress?: string;

  /** Amount in smallest unit (wei) as returned by GOAT Flow */
  amountWei?: string;

  /** Amount in human-readable format (for display) */
  amountDisplay?: string;

  /** Token decimals */
  tokenDecimals?: number;

  /** Chain ID (GOAT Testnet3 = 48816) */
  chainId: number;

  /** Network name */
  network: string;

  /** GOAT Flow base URL used */
  flowBaseUrl?: string;

  /** EIP-712 calldata sign request (for audit) */
  calldataSignRequest?: Record<string, unknown>;

  /** Raw GOAT Flow API responses (for audit) */
  rawResponses?: Record<string, unknown>;

  /** Error information if settlement failed */
  error?: {
    code?: string;
    message: string;
    timestamp: number;
  };

  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  settledAt?: number;
  authorizedAt?: number;
}

/** In-memory settlement store (replace with database in production) */
const settlementStore = new Map<string, SettlementRecord>();

/** Index by paymentId for fast lookup */
const paymentIdIndex = new Map<string, string>();

/** Index by roomId for deal lookups */
const roomIdIndex = new Map<string, string[]>();

/**
 * Generate unique settlement ID
 */
function generateSettlementId(): string {
  return `stl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new settlement record from deal and x402 result
 */
export function createSettlementRecord(
  deal: Deal,
  x402Result: X402SettlementResult,
  config: {
    payToWallet: string;
    token?: string;
    tokenAddress?: string;
    tokenDecimals: number;
    chainId: number;
    network: string;
    flowBaseUrl?: string;
  }
): SettlementRecord {
  const now = Date.now();
  const id = generateSettlementId();

  const record: SettlementRecord = {
    id,
    paymentId: x402Result.paymentId,
    orderId: x402Result.paymentId, // compatibility alias
    dealId: deal.roomId,
    roomId: deal.roomId,
    transcriptHash: deal.transcriptHash,
    mode: 'x402',
    status: mapPaymentStatusToSettlementStatus(x402Result.status),
    paymentStatus: x402Result.status,
    txHash: x402Result.txHash || undefined,
    explorerUrl: x402Result.explorerUrl,
    payerWallet: deal.buyer.wallet,
    payToWallet: config.payToWallet,
    token: config.token,
    tokenAddress: config.tokenAddress,
    amountWei: undefined, // Would need to be captured from createPaymentIntent
    tokenDecimals: config.tokenDecimals,
    chainId: config.chainId,
    network: config.network,
    flowBaseUrl: config.flowBaseUrl,
    calldataSignRequest: x402Result.calldataSignRequest as Record<string, unknown> | undefined,
    rawResponses: x402Result.raw as Record<string, unknown> | undefined,
    createdAt: now,
    updatedAt: now,
  };

  // Set settledAt if status is settled
  if (record.status === 'settled') {
    record.settledAt = now;
  }
  if (record.status === 'authorized') {
    record.authorizedAt = now;
  }

  return record;
}

/**
 * Create a settlement record for live on-chain mode
 */
export function createLiveSettlementRecord(
  deal: Deal,
  txHash: string,
  config: {
    payToWallet: string;
    chainId: number;
    network: string;
    settleToken?: string;
    tokenDecimals: number;
  }
): SettlementRecord {
  const now = Date.now();
  const id = generateSettlementId();

  return {
    id,
    paymentId: `live_${deal.roomId}_${now}`,
    dealId: deal.roomId,
    roomId: deal.roomId,
    transcriptHash: deal.transcriptHash,
    mode: 'live',
    status: 'settled',
    paymentStatus: 'settled',
    txHash,
    explorerUrl: config.network === 'goat-mainnet'
      ? `https://explorer.goat.network/tx/${txHash}`
      : `https://explorer.testnet3.goat.network/tx/${txHash}`,
    payerWallet: deal.buyer.wallet,
    payToWallet: config.payToWallet,
    tokenAddress: config.settleToken,
    tokenDecimals: config.tokenDecimals,
    chainId: config.chainId,
    network: config.network,
    createdAt: now,
    updatedAt: now,
    settledAt: now,
  };
}

/**
 * Create a settlement record for mock mode
 */
export function createMockSettlementRecord(
  deal: Deal,
  txHash: string
): SettlementRecord {
  const now = Date.now();
  const id = generateSettlementId();

  return {
    id,
    paymentId: `mock_${deal.roomId}_${now}`,
    dealId: deal.roomId,
    roomId: deal.roomId,
    transcriptHash: deal.transcriptHash,
    mode: 'mock',
    status: 'settled',
    paymentStatus: 'settled',
    txHash,
    explorerUrl: undefined,
    payerWallet: deal.buyer.wallet,
    payToWallet: deal.seller.wallet,
    tokenAddress: undefined,
    tokenDecimals: 18,
    chainId: 84532, // Base Sepolia (mock)
    network: 'base-sepolia',
    createdAt: now,
    updatedAt: now,
    settledAt: now,
  };
}

/**
 * Create a settlement record for direct ERC-20 payment (buyer → seller on-chain)
 */
export function createDirectSettlementRecord(
  deal: Deal,
  txHash: string,
  explorerUrl: string,
  tokenSymbol: string
): SettlementRecord {
  const now = Date.now();
  const id = generateSettlementId();

  return {
    id,
    paymentId: `direct_${deal.roomId}_${now}`,
    dealId: deal.roomId,
    roomId: deal.roomId,
    transcriptHash: deal.transcriptHash,
    mode: 'live', // Direct on-chain payment is live mode
    status: 'settled',
    paymentStatus: 'settled',
    txHash,
    explorerUrl,
    payerWallet: deal.buyer.wallet,
    payToWallet: deal.seller.wallet,
    token: tokenSymbol,
    tokenAddress: undefined, // Will be set from config if needed
    tokenDecimals: 18,
    chainId: 48816,
    network: 'goat-testnet',
    createdAt: now,
    updatedAt: now,
    settledAt: now,
  };
}

/**
 * Update an existing settlement record with new status
 */
export function updateSettlementStatus(
  paymentId: string,
  status: SettlementStatus,
  updates: Partial<Pick<SettlementRecord, 'txHash' | 'explorerUrl' | 'paymentStatus' | 'rawResponses' | 'error'>> = {}
): SettlementRecord | null {
  const id = paymentIdIndex.get(paymentId);
  if (!id) return null;

  const record = settlementStore.get(id);
  if (!record) return null;

  const now = Date.now();
  record.status = status;
  record.paymentStatus = updates.paymentStatus ?? record.paymentStatus;
  record.txHash = updates.txHash ?? record.txHash;
  record.explorerUrl = updates.explorerUrl ?? record.explorerUrl;
  record.rawResponses = updates.rawResponses ?? record.rawResponses;
  record.error = updates.error ?? record.error;
  record.updatedAt = now;

  if (status === 'settled' && !record.settledAt) {
    record.settledAt = now;
  }
  if (status === 'authorized' && !record.authorizedAt) {
    record.authorizedAt = now;
  }

  return record;
}

/**
 * Get settlement record by paymentId
 */
export function getSettlementByPaymentId(paymentId: string): SettlementRecord | undefined {
  const id = paymentIdIndex.get(paymentId);
  if (!id) return undefined;
  return settlementStore.get(id);
}

/**
 * Get settlement record by internal ID
 */
export function getSettlementById(id: string): SettlementRecord | undefined {
  return settlementStore.get(id);
}

/**
 * Get all settlements for a roomId
 */
export function getSettlementsByRoomId(roomId: string): SettlementRecord[] {
  const ids = roomIdIndex.get(roomId) || [];
  return ids.map(id => settlementStore.get(id)!).filter(Boolean);
}

/**
 * Get all settlements (with optional filter)
 */
export function getAllSettlements(filter?: { mode?: SettlementMode; status?: SettlementStatus }): SettlementRecord[] {
  let records = Array.from(settlementStore.values());

  if (filter?.mode) {
    records = records.filter(r => r.mode === filter.mode);
  }
  if (filter?.status) {
    records = records.filter(r => r.status === filter.status);
  }

  return records.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Persist a settlement record
 */
export function persistSettlement(record: SettlementRecord): SettlementRecord {
  settlementStore.set(record.id, record);
  paymentIdIndex.set(record.paymentId, record.id);

  const roomIds = roomIdIndex.get(record.roomId) || [];
  if (!roomIds.includes(record.id)) {
    roomIds.push(record.id);
    roomIdIndex.set(record.roomId, roomIds);
  }

  return record;
}

/**
 * Clear all settlements (for testing)
 */
export function clearSettlements(): void {
  settlementStore.clear();
  paymentIdIndex.clear();
  roomIdIndex.clear();
}

/**
 * Map GOAT Flow payment status to settlement status
 */
export function mapPaymentStatusToSettlementStatus(
  paymentStatus: 'created' | 'authorized' | 'settled' | 'failed' | 'expired'
): SettlementStatus {
  switch (paymentStatus) {
    case 'created':
      return 'created';
    case 'authorized':
      return 'authorized';
    case 'settled':
      return 'settled';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

/**
 * Get settlement statistics
 */
export function getSettlementStats(): {
  total: number;
  byMode: Record<SettlementMode, number>;
  byStatus: Record<SettlementStatus, number>;
} {
  const records = Array.from(settlementStore.values());
  const byMode: Record<SettlementMode, number> = { x402: 0, live: 0, mock: 0 };
  const byStatus: Record<SettlementStatus, number> = {
    pending: 0, created: 0, authorized: 0, settled: 0, failed: 0, expired: 0, rejected: 0
  };

  for (const r of records) {
    byMode[r.mode]++;
    byStatus[r.status]++;
  }

  return {
    total: records.length,
    byMode,
    byStatus,
  };
}