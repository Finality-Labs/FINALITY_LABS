/**
 * Finality Labs - API Types
 * Type definitions for all backend API contracts
 */

// ============================================
// API Configuration
// ============================================

export interface ApiConfig {
  intakeBaseUrl: string;
  negotiateWsUrl: string;
  chainBaseUrl: string;
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  intakeBaseUrl: process.env.NEXT_PUBLIC_INTAKE_URL || 'http://localhost:3001',
  negotiateWsUrl: process.env.NEXT_PUBLIC_NEGOTIATE_WS_URL || 'ws://localhost:3002',
  chainBaseUrl: process.env.NEXT_PUBLIC_CHAIN_URL || 'http://localhost:3003',
};

// ============================================
// Intake Types (Port 3001)
// ============================================

export interface PartyIdentity {
  agentRegistry: string;
  agentId: string;
  wallet: string;
  maxUnitPrice?: number; // buyer
  floorUnitPrice?: number; // seller
}

export interface Intent {
  resource: string;
  qty: number;
  unit: string;
  maxUnitPrice: number;
  requirements: Record<string, unknown>;
  agentRegistry: string;
  agentId: string;
  wallet: string;
}

export interface Offer {
  resource: string;
  unit: string;
  unitPrice: number;
  terms: string;
  requirements: Record<string, unknown>;
  agentRegistry: string;
  agentId: string;
  wallet: string;
  pulseMinutes?: number;
  active?: boolean;
  registryVersion?: number;
}

export interface MatchParty {
  agentRegistry: string;
  agentId: string;
  wallet: string;
}

/** Details of a real match, returned by the matchmaker so clients can render
 * the match card (buyer agent, seller agent, resource, proposed price,
 * constraints) without hardcoding values. */
export interface MatchDetails {
  buyer: MatchParty;
  seller: MatchParty;
  resource: string;
  unit: string;
  qty: number;
  /** Proposed price per unit (the seller's asking price for an intent match). */
  unitPrice: number;
  /** Constraints the matched counterparty carries (requirements). */
  requirements: Record<string, unknown>;
  terms?: string;
}

export interface CreateIntentResponse {
  intentId: string;
  matched?: boolean;
  roomId?: string;
  wssUrl?: string;
  match?: MatchDetails;
}

export interface CreateOfferResponse {
  offerId: string;
  matched?: boolean;
  roomId?: string;
  wssUrl?: string;
  match?: MatchDetails;
}

export interface MatchLookupResponse {
  matched: boolean;
  roomId?: string;
  wssUrl?: string;
  match?: MatchDetails;
}

export interface OfferPulseResponse {
  pulsed: boolean;
  active: boolean;
  matched?: boolean;
  roomId?: string;
  wssUrl?: string;
}

export interface OfferRegistryState {
  offerId: string;
  active: boolean;
  registryVersion: number;
  offer: Offer;
}

export interface AgentRegistryFeed {
  agentId: string;
  offers: Array<{
    active: boolean;
    registryVersion: number;
    offer: Offer;
  }>;
}

export interface ReputationResponse {
  agentId: string;
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
  mode?: 'offchain' | 'live';
}

export interface IdentityResponse {
  ok: boolean;
  registered: boolean;
}

export interface RegistryNotifyResponse {
  notified: boolean;
  changed: boolean;
}

// ============================================
// Negotiation WebSocket Types (Port 3002)
// ============================================

export type NegotiationRole = 'buyer' | 'seller';
export type MessageType = 'counteroffer' | 'accept' | 'reject' | 'close' | 'system' | 'join';

export interface Terms {
  unitPrice: number;
  qty: number;
  terms: string;
  requirements?: Record<string, unknown>;
  argument?: string;
}

export interface Envelope {
  type: MessageType;
  from: NegotiationRole;
  round: number;
  payload?: Record<string, unknown>;
  ts?: number;
}

export interface JoinMessage {
  type: 'join';
  role: NegotiationRole;
  identity: PartyIdentity;
}

export type SystemEnvelope =
  | { type: 'system'; kind: 'error'; message: string; ts: number }
  | { type: 'system'; kind: 'deal-closed'; deal: ClosedDeal; transcriptHash: string; ts: number }
  | { type: 'system'; kind: 'constraint-hit'; lastTerms: Terms | null; reason: string; ts: number }
  | { type: 'system'; kind: 'info'; message: string; ts: number }
  | {
      // Reconnect snapshot sent to a party joining a room mid-negotiation.
      type: 'system';
      kind: 'resume';
      transcript: Array<{ type: string; from: NegotiationRole; round: number; payload: unknown; ts: number }>;
      turn: NegotiationRole | null;
      round: number;
      lastTerms: Terms | null;
      ts: number;
    };

// Client -> Server messages
export type ClientMessage =
  | {
      type: 'join';
      role: NegotiationRole;
      identity: PartyIdentity;
    }
  | {
      type: 'counteroffer';
      from: NegotiationRole;
      round: number;
      payload: Terms;
      ts?: number;
    }
  | {
      type: 'accept';
      from: NegotiationRole;
      round: number;
      payload: Terms;
      ts?: number;
    }
  | {
      type: 'reject';
      from: NegotiationRole;
      round: number;
      payload: {
        reason: string;
      };
      ts?: number;
    }
  | {
      type: 'close';
      from: NegotiationRole;
      round: number;
      payload: {
        reason: string;
      };
      ts?: number;
    };

// Server -> Client messages
export type ServerMessage =
  | { type: 'counteroffer'; from: NegotiationRole; round: number; payload: Terms; ts: number }
  | { type: 'accept'; from: NegotiationRole; round: number; ts: number }
  | { type: 'reject'; from: NegotiationRole; round: number; reason: string; ts: number }
  | { type: 'close'; from: NegotiationRole; round: number; reason: string; ts: number }
  | SystemEnvelope;

export type NegotiationMessage = ClientMessage | ServerMessage;

export interface ClosedDeal {
  buyer: { agentRegistry: string; agentId: string; wallet: string };
  seller: { agentRegistry: string; agentId: string; wallet: string };
  unitPrice: number;
  qty: number;
  terms: string;
  totalUsdc: number;
}

export interface DealResult {
  roomId: string;
  transcriptHash: string;
  deal: ClosedDeal;
}

export interface NegotiationConfig {
  maxRounds: number;
  minDelta: number;
}

export const DEFAULT_NEGOTIATION_CONFIG: NegotiationConfig = {
  maxRounds: 10,
  minDelta: 0.01,
};

// ============================================
// Chain Types (Port 3003)
// ============================================

export interface Deal {
  roomId: string;
  transcriptHash: string;
  buyer: PartyIdentity & { onchainAgentId?: string };
  seller: PartyIdentity & { onchainAgentId?: string };
  unitPrice: number;
  qty: number;
  terms: string;
  totalUsdc: number;
}

/** x402 Payment Challenge — returned as HTTP 402 when payment requires buyer authorization. */
export interface X402PaymentChallenge {
  paymentId: string;
  amount: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  recipient: string;
  chainId: number;
  network: string;
  dealId: string;
  calldataSignRequest: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  expiresAt: string;
}

export interface DealResponse {
  ok: boolean;
  mode: 'mock' | 'live' | 'x402';
  txHash: string;
  explorerUrl?: string;
  reputation: {
    buyer: { agentId: string } & ReputationResult;
    seller: { agentId: string } & ReputationResult;
  };
  x402Challenge?: X402PaymentChallenge;
}

/** Authorization request for x402 payment (buyer signature submission). */
export interface X402AuthorizeRequest {
  paymentId: string;
  signature: string;
  calldataSignRequest?: {
    domain: Record<string, unknown>;
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}

/** Authorization response for x402 payment. */
export interface X402AuthorizeResponse {
  ok: boolean;
  mode: 'x402';
  txHash: string;
  explorerUrl?: string;
  paymentId: string;
  status: 'created' | 'authorized' | 'settled' | 'failed' | 'expired';
  error?: string;
}

/** Payment states for the on-chain ERC-20 payment flow */
export type PaymentState = 
  | 'payment_pending'
  | 'payment_submitted'
  | 'payment_confirming'
  | 'payment_verified'
  | 'payment_failed';

/** On-chain ERC-20 payment verification request */
export interface PaymentVerificationRequest {
  txHash: string;
}

/** On-chain ERC-20 payment verification response */
export interface PaymentVerificationResponse {
  ok: boolean;
  verified: boolean;
  paymentState: PaymentState;
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

/** Payment info needed to execute the payment (native or ERC-20) */
export interface DealPaymentInfo {
  roomId: string;
  dealId: string;
  totalUsdc: number;
  amount: string; // amount in base units (wei for native, smallest unit for ERC-20)
  tokenAddress: string; // token contract address, or "native" for native token
  tokenSymbol: string;
  tokenDecimals: number;
  isNative: boolean; // true for native token transfer, false for ERC-20
  sellerAddress: string;
  buyerAddress: string;
  chainId: number;
  network: string;
  rpcUrl: string;
  explorerBaseUrl: string;
}

export interface ReputationResult {
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
  mode: 'offchain' | 'live';
}

export interface RegisterResponse {
  ok: boolean;
  agentId?: string;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
}

export interface ChainModeResponse {
  mode: 'mock' | 'live';
  network: string;
  liveReady: boolean;
  reason?: string;
}

export interface HealthResponse {
  ok: boolean;
  services: {
    intake: number;
    negotiate: number;
    chain: number;
  };
  chain: ChainModeResponse;
}

// ============================================
// Orchestrator Types (Port 3000)
// ============================================

export interface RunDealRequest {
  resource: string;
  qty: number;
  buyerMax: number;
  sellerFloor: number;
  gpu?: string;
  buyerWallet?: string;
  sellerWallet?: string;
  buyerAgentId?: string;
  sellerAgentId?: string;
  buyerTimeoutMs?: number;
  sellerTimeoutMs?: number;
  forceDeterministic?: boolean;
}

export interface AgentResult {
  kind: 'deal-closed' | 'constraint-hit' | 'error';
  unitPrice?: number;
  qty?: number;
  terms?: string;
  transcriptHash?: string;
  message?: string;
}

export interface SettlementRecord {
  roomId: string;
  response: {
    ok: boolean;
    status: number;
    body?: unknown;
    error?: string;
  };
  recordedAt: string;
}

export interface ReputationData {
  '1': ReputationSummary;
  '2': ReputationSummary;
}

export interface ReputationSummary {
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
  mode: 'offchain' | 'live';
}

export interface RunDealResponse {
  matched: boolean;
  result?: AgentResult;
  sellerResult?: AgentResult;
  settlement?: SettlementRecord;
  total?: number | null;
  reputation?: ReputationData;
  log: string[];
  fallback?: {
    kind: 'no-match' | 'no-deal';
    message: string;
    suggestedAction?: string;
  };
}

// ============================================
// ERC-8004 Agent Registration Types
// ============================================

export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

export interface AgentRegistrationForm {
  name: string;
  description: string;
  image?: string;
  services: AgentService[];
  x402Support: boolean;
  active: boolean;
  supportedTrust: ('reputation' | 'crypto-economic' | 'tee-attestation')[];
  agentURI?: string;
  gistId?: string;
}

export interface GistUploadResult {
  rawUrl: string;
  htmlUrl: string;
  id: string;
  createdAt: string;
}

export interface RegistrationResponse {
  ok: boolean;
  mode: 'mock' | 'live';
  agentId?: string;
  txHash?: string;
  explorerUrl?: string;
  agentURI?: string;
  gist?: GistUploadResult;
  error?: string;
  details?: unknown;
}

export interface ValidateUriResponse {
  ok: boolean;
  valid: boolean;
  registration?: object;
  error?: string;
}

export interface Erc8004Config {
  network: string;
  chainId: number;
  identityRegistry: string;
  explorer: string;
  rpcUrl: string;
  backupRpcUrl: string;
  gistConfigured: boolean;
  mode: 'mock' | 'live';
  liveReady: boolean;
  reason?: string;
  serviceTypes: Array<{ value: string; label: string }>;
  trustModels: string[];
}

/** A registered ERC-8004 agent discovered on-chain for a wallet (read-only). */
export interface Erc8004DiscoveredAgent {
  agentId: string;
  wallet: string;
  owner: string;
  agentURI: string;
  txHash: string;
  explorerUrl: string;
  metadata?: {
    name?: string;
    description?: string;
    image?: string;
    services?: Array<Record<string, unknown>>;
    x402Support?: boolean;
    active?: boolean;
    supportedTrust?: string[];
  };
}

/** Response of GET /erc8004/agents-by-wallet */
export interface Erc8004AgentsByWalletResponse {
  ok: boolean;
  wallet?: string;
  network?: {
    chainId: number;
    network: string;
    identityRegistry: string;
    rpcUrl: string;
    explorer: string;
  };
  agents: Erc8004DiscoveredAgent[];
  error?: string;
}

// ============================================
// Verification Types
// ============================================

export type VerificationStatus = 
  | 'pending'
  | 'seller_completed'
  | 'waiting_for_buyer'
  | 'verified'
  | 'rejected'
  | 'disputed'
  | 'error';

export interface VerificationVerdict {
  verdictId: string;
  requestId: string;
  status: 'verified' | 'rejected' | 'error';
  verifierId: string;
  verifierName: string;
  proof?: string;
  rejectionReason?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  notes?: string;
  submittedBy?: string;
}

export interface VerificationRequest {
  requestId: string;
  roomId: string;
  transcriptHash: string;
  deal: {
    buyer: PartyIdentity & { onchainAgentId?: string };
    seller: PartyIdentity & { onchainAgentId?: string };
    unitPrice: number;
    qty: number;
    terms: string;
    totalUsdc: number;
  };
  context?: Record<string, unknown>;
  createdAt: string;
  currentStatus?: VerificationStatus;
  verificationProvider?: string;
  sellerCompletedAt?: string;
  buyerDecisionAt?: string;
  finalVerdictAt?: string;
  submittedProofs?: Array<{
    verifierId: string;
    verifierName: string;
    proof?: string;
    notes?: string;
    submittedAt: string;
  }>;
  rejectionReasons?: Array<{
    verifierId: string;
    verifierName: string;
    reason: string;
    at: string;
  }>;
}

export interface VerificationDashboardView {
  requestId: string;
  roomId: string;
  transcriptHash: string;
  deal: VerificationRequest['deal'];
  currentStatus: VerificationStatus;
  verificationProvider: string;
  createdAt: string;
  sellerCompletedAt?: string;
  buyerDecisionAt?: string;
  finalVerdictAt?: string;
  submittedProofs: Array<{
    verifierId: string;
    verifierName: string;
    proof?: string;
    notes?: string;
    submittedAt: string;
  }>;
  rejectionReasons: Array<{
    verifierId: string;
    verifierName: string;
    reason: string;
    at: string;
  }>;
  verdicts: VerificationVerdict[];
  canSellerComplete: boolean;
  canBuyerApprove: boolean;
  canBuyerReject: boolean;
  canAdminOverride: boolean;
}

export interface SellerCompletionSubmission {
  requestId: string;
  sellerAgentId: string;
  proof: string;
  notes?: string;
}

export interface BuyerDecisionSubmission {
  requestId: string;
  buyerAgentId: string;
  decision: 'approve' | 'reject';
  rejectionReason?: string;
  notes?: string;
}

export interface AdminOverrideSubmission {
  requestId: string;
  adminAgentId: string;
  decision: 'verified' | 'rejected' | 'error';
  rejectionReason?: string;
  notes?: string;
}

// Response of the approval-workflow action endpoints (seller completion,
// buyer decision, admin override). Carries the updated real settlement record
// whose `verification` reflects the re-run result.
export interface VerificationActionResponse {
  ok: boolean;
  record: RoomSettlementRecord;
}

export interface VerificationListResponse {
  verifications: VerificationDashboardView[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================
// Room Settlement / Verification Read Types (negotiate :3002)
// Mirrors the in-memory SettlementRecord produced by the existing
// verification flow (packages/negotiate/src/settle.ts) and served over
// GET /settlements/:roomId. Carries the REAL closed deal + REAL verification.
// ============================================

export interface RoomSettlementRecord {
  roomId: string;
  response: {
    ok: boolean;
    status: number;
    body?: unknown;
    error?: string;
  };
  recordedAt: string;
  verification?: {
    requestId?: string;
    status: VerificationStatus;
    passed: boolean;
    finalStatus?: VerificationStatus;
    startedAt?: string;
    completedAt?: string;
    verdicts: Array<{
      verdictId?: string;
      verifierId: string;
      verifierName: string;
      status: string;
      proof?: string;
      rejectionReason?: string;
      timestamp?: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  deal?: ClosedDeal;
  transcriptHash?: string;
  settlementBlocked?: boolean;
  settlementBlockReason?: string;
}

export type Role = 'buyer' | 'seller';

export interface ReputationView {
  agentId: string;
  score: number;
  count: number;
  mode: 'offchain' | 'live';
}

export interface BrainContext {
  role: Role;
  price: number;
  qty: number;
  terms: string;
  requirements: Record<string, unknown>;
  myReputation?: ReputationView;
  counterparty?: ReputationView;
  maxRounds: number;
  minDelta: number;
  hardMax?: number;
  persona?: string;
  seed?: number;
}

export interface TurnInput {
  round: number;
  lastTerms?: {
    unitPrice: number;
    qty: number;
    terms?: string;
    argument?: string;
  };
  history: Array<{
    from: Role;
    unitPrice: number;
    argument?: string;
  }>;
}

export type BrainDecision =
  | { action: 'counteroffer'; unitPrice: number; argument: string }
  | { action: 'accept'; unitPrice: number; argument: string }
  | { action: 'reject'; reason: string; argument: string }
  | { action: 'close'; reason: string; argument: string };

export interface AgentDeps {
  wsUrl: string;
  role: Role;
  identity: PartyIdentity;
  ctx: Omit<BrainContext, 'role'>;
  reputationFor?: (agentId: string) => Promise<ReputationView>;
  opts?: { timeoutMs?: number; log?: (s: string) => void; seed?: number };
}

export interface AgentResult {
  kind: 'deal-closed' | 'constraint-hit' | 'error';
  unitPrice?: number;
  qty?: number;
  terms?: string;
  transcriptHash?: string;
  message?: string;
}