/**
 * Finality Labs - Verification Types
 * Type definitions matching the verification layer backend (packages/verification)
 */

// ============================================
// Verification Status Types
// ============================================

export type VerificationStatus = 
  | 'pending' 
  | 'seller-completed' 
  | 'waiting-for-buyer' 
  | 'verified' 
  | 'rejected' 
  | 'disputed' 
  | 'error';

export type VerificationStatusDisplay = 
  | 'Pending' 
  | 'Seller Completed' 
  | 'Waiting for Buyer' 
  | 'Verified' 
  | 'Rejected' 
  | 'Disputed' 
  | 'Error';

export const VERIFICATION_STATUS_MAP: Record<VerificationStatus, VerificationStatusDisplay> = {
  'pending': 'Pending',
  'seller-completed': 'Seller Completed',
  'waiting-for-buyer': 'Waiting for Buyer',
  'verified': 'Verified',
  'rejected': 'Rejected',
  'disputed': 'Disputed',
  'error': 'Error',
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  'pending': 'warning',
  'seller-completed': 'default',
  'waiting-for-buyer': 'default',
  'verified': 'success',
  'rejected': 'error',
  'disputed': 'error',
  'error': 'error',
};

// ============================================
// Verification Request Types
// ============================================

export interface VerificationRequest {
  requestId: string;
  roomId: string;
  transcriptHash: string;
  deal: {
    buyer: {
      agentRegistry: string;
      agentId: string;
      wallet: string;
    };
    seller: {
      agentRegistry: string;
      agentId: string;
      wallet: string;
    };
    unitPrice: number;
    qty: number;
    terms: string;
    totalUsdc: number;
  };
  context?: Record<string, unknown>;
  createdAt: string;
}

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
}

export interface VerificationResult {
  request: VerificationRequest;
  verdicts: VerificationVerdict[];
  finalStatus: VerificationStatus;
  passed: boolean;
  startedAt: string;
  completedAt: string;
}

// ============================================
// Verifier Types
// ============================================

export interface VerifierConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  required: boolean;
  timeoutMs: number;
}

export interface VerifierConfigInput extends Partial<VerifierConfig> {}

// ============================================
// Seller Completion Types
// ============================================

export interface SellerCompletionState {
  requestId: string;
  submitted: boolean;
  proof?: string;
  notes?: string;
  submittedAt?: string;
  sellerAgentId: string;
}

export interface SubmitCompletionInput {
  requestId: string;
  sellerAgentId: string;
  proof: string;
  notes?: string;
}

// ============================================
// Buyer Approval Types
// ============================================

export type BuyerDecision = 'approve' | 'reject';

export interface BuyerApprovalState {
  requestId: string;
  decision?: BuyerDecision;
  rejectionReason?: string;
  notes?: string;
  decidedAt?: string;
  buyerAgentId: string;
}

export interface SubmitDecisionInput {
  requestId: string;
  buyerAgentId: string;
  decision: BuyerDecision;
  rejectionReason?: string;
  notes?: string;
}

// ============================================
// Admin Override Types
// ============================================

export interface AdminOverrideState {
  requestId: string;
  decision: 'verified' | 'rejected' | 'error';
  rejectionReason?: string;
  notes?: string;
  overriddenAt: string;
  adminAgentId: string;
}

export interface ApplyOverrideInput {
  requestId: string;
  adminAgentId: string;
  decision: 'verified' | 'rejected' | 'error';
  rejectionReason?: string;
  notes?: string;
}

// ============================================
// Verification Manager Types
// ============================================

export interface VerificationManagerConfig {
  verifiers: VerifierConfig[];
  stopOnRequiredFailure: boolean;
  overallTimeoutMs: number;
}

export interface VerificationStats {
  totalRequests: number;
  pending: number;
  sellerCompleted: number;
  waitingForBuyer: number;
  verified: number;
  rejected: number;
  disputed: number;
  error: number;
  avgProcessingTimeMs: number;
  passRate: number;
}

// ============================================
// Verification Filter & Query Types
// ============================================

export interface VerificationFilters {
  status?: VerificationStatus[];
  verifierId?: string;
  role?: 'buyer' | 'seller' | 'admin';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface VerificationSort {
  field: 'createdAt' | 'completedAt' | 'status' | 'verifierId' | 'totalUsdc';
  direction: 'asc' | 'desc';
}

// ============================================
// Provider Registration Types
// ============================================

export interface VerificationProvider {
  id: string;
  name: string;
  description: string;
  version: string;
  config: VerifierConfig;
  capabilities: string[];
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: string;
}

export interface ProviderRegistrationInput {
  id: string;
  name: string;
  description: string;
  version: string;
  config: VerifierConfigInput;
  capabilities: string[];
}

// ============================================
// API Response Types
// ============================================

export interface VerificationListResponse {
  verifications: VerificationResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VerificationDetailResponse extends VerificationResult {
  // Additional details for the detail view
  currentStep?: string;
  nextAction?: string;
  nextActionRole?: 'buyer' | 'seller' | 'admin';
}