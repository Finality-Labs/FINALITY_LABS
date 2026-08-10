/**
 * Safety Transformer Verifier
 * This verifier checks the deal against the Safety Transformer policy
 * (from packages/chain/src/safety.ts) before allowing settlement.
 * It's an example of a "real" verifier that enforces business logic.
 */

import type { VerificationRequest, VerificationVerdict, VerifierConfig, VerifierConfigInput } from "../types.js";
import { BaseVerifier } from "./base.js";

// SafetyPolicy interface copied from @finality/chain to avoid cross-package import issues
interface SafetyPolicy {
  vaultBalance: number;
  maxSingleTrade: number;
  dailyBudget: number;
  anomalyMultiplier: number;
  normal?: number;
  dailySpent?: number;
}

interface SafetyResult {
  allow: boolean;
  reason: string;
}

const DEFAULT_NORMAL = 50;

/**
 * Evaluate a single trade amount (USDC) against the safety policy.
 * Returns { allow:false, reason } on the FIRST rule that blocks.
 */
function evaluate(amount: number, policy: SafetyPolicy): SafetyResult {
  const normal = policy.normal ?? DEFAULT_NORMAL;
  const dailySpent = policy.dailySpent ?? 0;

  if (!(amount > 0) || Number.isNaN(amount)) {
    return { allow: false, reason: 'amount must be a positive number' };
  }

  if (amount > policy.maxSingleTrade) {
    return {
      allow: false,
      reason: `exceeds maxSingleTrade (${amount} > ${policy.maxSingleTrade})`,
    };
  }

  if (amount > policy.vaultBalance) {
    return {
      allow: false,
      reason: `exceeds vaultBalance (${amount} > ${policy.vaultBalance})`,
    };
  }

  if (dailySpent + amount > policy.dailyBudget) {
    return {
      allow: false,
      reason: `exceeds dailyBudget (${dailySpent} + ${amount} > ${policy.dailyBudget})`,
    };
  }

  if (amount > policy.anomalyMultiplier * normal) {
    return {
      allow: false,
      reason: `anomaly: amount ${amount} exceeds ${policy.anomalyMultiplier}x normal pattern (${policy.anomalyMultiplier * normal})`,
    };
  }

  return { allow: true, reason: 'ok' };
}

export interface SafetyVerifierConfig extends VerifierConfig {
  /** Safety policy to evaluate against */
  policy?: SafetyPolicy;
}

/**
 * Verifier that runs the Safety Transformer evaluation on the deal
 */
export class SafetyVerifier extends BaseVerifier {
  private policy: SafetyPolicy;

  constructor(config: VerifierConfigInput & Partial<{ policy: SafetyPolicy }> = {}) {
    super({
      id: config.id ?? "safety-verifier",
      name: config.name ?? "Safety Transformer Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 10, // Run early
      required: config.required ?? true, // Required by default
      timeoutMs: config.timeoutMs ?? 5000,
    });
    this.policy = config.policy ?? {
      vaultBalance: 10_000,
      maxSingleTrade: 50,
      dailyBudget: 500,
      anomalyMultiplier: 10,
      normal: 50,
      dailySpent: 0,
    };
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    const { totalUsdc } = request.deal;

    const verdict = evaluate(totalUsdc, this.policy);

    if (verdict.allow) {
      return this.createVerdict(request, "verified", {
        proof: `safety-check-passed-${request.requestId}`,
        metadata: {
          totalUsdc,
          policy: {
            maxSingleTrade: this.policy.maxSingleTrade,
            vaultBalance: this.policy.vaultBalance,
            dailyBudget: this.policy.dailyBudget,
            anomalyMultiplier: this.policy.anomalyMultiplier,
          },
        },
      });
    } else {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Safety check failed: ${verdict.reason}`,
        metadata: {
          totalUsdc,
          reason: verdict.reason,
        },
      });
    }
  }
}

/**
 * Reputation Verifier
 *
 * Checks the reputation of both parties via the ERC-8004 reputation registry
 * or the local reputation provider.
 */
export interface ReputationVerifierConfig extends VerifierConfig {
  /** Minimum reputation score required */
  minScore?: number;
  /** Minimum completed deals required */
  minDeals?: number;
}

export class ReputationVerifier extends BaseVerifier {
  private minScore: number;
  private minDeals: number;

  constructor(config: VerifierConfigInput & Partial<{ minScore: number; minDeals: number }> = {}) {
    super({
      id: config.id ?? "reputation-verifier",
      name: config.name ?? "Reputation Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 20,
      required: config.required ?? false, // Optional by default
      timeoutMs: config.timeoutMs ?? 10000,
    });
    this.minScore = config.minScore ?? 0;
    this.minDeals = config.minDeals ?? 0;
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    // In a real implementation, this would call the ERC-8004 Reputation Registry
    // or the local ReputationProvider from packages/chain/src/reputationProvider.ts

    // For now, we'll do a basic check using the mock reputation data
    // This would be replaced with actual on-chain calls in production

    const buyerAgentId = request.deal.buyer.agentId;
    const sellerAgentId = request.deal.seller.agentId;

    // Simulated reputation check - in reality this would call getSummary
    const buyerReputation = await this.checkReputation(buyerAgentId);
    const sellerReputation = await this.checkReputation(sellerAgentId);

    const buyerPassed = buyerReputation.score >= this.minScore && buyerReputation.deals >= this.minDeals;
    const sellerPassed = sellerReputation.score >= this.minScore && sellerReputation.deals >= this.minDeals;

    if (buyerPassed && sellerPassed) {
      return this.createVerdict(request, "verified", {
        proof: `reputation-check-passed-${request.requestId}`,
        metadata: {
          buyer: buyerReputation,
          seller: sellerReputation,
          minScore: this.minScore,
          minDeals: this.minDeals,
        },
      });
    } else {
      const reasons: string[] = [];
      if (!buyerPassed) {
        reasons.push(`Buyer reputation insufficient (score: ${buyerReputation.score}, deals: ${buyerReputation.deals})`);
      }
      if (!sellerPassed) {
        reasons.push(`Seller reputation insufficient (score: ${sellerReputation.score}, deals: ${sellerReputation.deals})`);
      }

      return this.createVerdict(request, "rejected", {
        rejectionReason: reasons.join("; "),
        metadata: {
          buyer: buyerReputation,
          seller: sellerReputation,
          minScore: this.minScore,
          minDeals: this.minDeals,
        },
      });
    }
  }

  /**
   * Check reputation for an agent - placeholder for real implementation
   */
  private async checkReputation(agentId: string): Promise<{ score: number; deals: number }> {
    // TODO: Replace with actual call to ERC-8004 getSummary or ReputationProvider
    // For now, return mock data based on agentId
    const mockData: Record<string, { score: number; deals: number }> = {
      "1": { score: 100, deals: 5 },
      "2": { score: 100, deals: 3 },
    };
    return mockData[agentId] ?? { score: 0, deals: 0 };
  }
}

/**
 * Seller Completion Verifier
 *
 * Allows the seller to mark the agreed work or service as completed.
 * This is the first step in the approval workflow - the seller submits
 * completion with optional proof (delivery hash, artifact URL, etc.).
 */
export interface SellerCompletionVerifierConfig extends VerifierConfig {
  /** Whether to require proof of completion */
  requireProof?: boolean;
  /** Timeout for seller to submit completion (milliseconds) */
  completionTimeoutMs?: number;
}

/**
 * State for seller completion tracking
 */
export interface SellerCompletionState {
  /** The request ID this completion is for */
  requestId: string;
  /** Whether seller has submitted completion */
  submitted: boolean;
  /** Seller's proof of completion (hash, URL, etc.) */
  proof?: string;
  /** Seller's notes about the completion */
  notes?: string;
  /** When completion was submitted */
  submittedAt?: string;
  /** Seller agent ID who submitted */
  sellerAgentId: string;
}

/**
 * Verifier for seller completion step in the approval workflow
 */
export class SellerCompletionVerifier extends BaseVerifier {
  private requireProof: boolean;
  private completionTimeoutMs: number;
  // In-memory store for completion states (in production, use persistent storage)
  private static completionStates: Map<string, SellerCompletionState> = new Map();

  constructor(config: VerifierConfigInput & Partial<{ requireProof: boolean; completionTimeoutMs: number }> = {}) {
    super({
      id: config.id ?? "seller-completion-verifier",
      name: config.name ?? "Seller Completion Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 40, // Run after standard verifiers
      required: config.required ?? true, // Required by default for approval workflow
      timeoutMs: config.timeoutMs ?? 5000,
    });
    this.requireProof = config.requireProof ?? true;
    this.completionTimeoutMs = config.completionTimeoutMs ?? 86400000; // 24 hours default
  }

  /**
   * Submit completion as the seller
   * This is called externally when the seller marks work as done
   */
  static submitCompletion(
    requestId: string,
    sellerAgentId: string,
    proof: string,
    notes?: string
  ): SellerCompletionState {
    const state: SellerCompletionState = {
      requestId,
      submitted: true,
      proof,
      notes,
      submittedAt: new Date().toISOString(),
      sellerAgentId,
    };
    this.completionStates.set(requestId, state);
    return state;
  }

  /**
   * Get the completion state for a request
   */
  static getCompletionState(requestId: string): SellerCompletionState | undefined {
    return this.completionStates.get(requestId);
  }

  /**
   * Clear completion state (e.g., after verification completes)
   */
  static clearCompletionState(requestId: string): void {
    this.completionStates.delete(requestId);
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    const state = SellerCompletionVerifier.getCompletionState(request.requestId);

    // Check if seller has submitted completion
    if (!state || !state.submitted) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: "Seller has not submitted completion yet",
        metadata: {
          step: "seller-completion",
          requiresAction: "seller-submit",
        },
      });
    }

    // Verify the seller submitting matches the deal seller
    if (state.sellerAgentId !== request.deal.seller.agentId) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Completion submitted by wrong seller (expected: ${request.deal.seller.agentId}, got: ${state.sellerAgentId})`,
        metadata: { step: "seller-completion", mismatch: true },
      });
    }

    // Check if proof is required and provided
    if (this.requireProof && !state.proof) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: "Proof of completion is required but not provided",
        metadata: { step: "seller-completion", requiresProof: true },
      });
    }

    // Check completion timeout
    if (state.submittedAt) {
      const submittedTime = new Date(state.submittedAt).getTime();
      const now = Date.now();
      if (now - submittedTime > this.completionTimeoutMs) {
        return this.createVerdict(request, "rejected", {
          rejectionReason: `Completion submission expired (timeout: ${this.completionTimeoutMs}ms)`,
          metadata: { step: "seller-completion", expired: true },
        });
      }
    }

    // All checks passed - seller has completed
    return this.createVerdict(request, "verified", {
      proof: state.proof ?? `seller-completion-${request.requestId}`,
      metadata: {
        step: "seller-completion",
        sellerNotes: state.notes,
        submittedAt: state.submittedAt,
        sellerAgentId: state.sellerAgentId,
      },
    });
  }
}

/**
 * Buyer Approval Verifier
 *
 * Allows the buyer to review the seller's delivery and either Approve
 * or Reject the deal. This is the final step in the approval workflow.
 * If the buyer approves, returns a Verified verdict.
 * If the buyer rejects, returns a Rejected verdict with the provided reason.
 */
export interface BuyerApprovalVerifierConfig extends VerifierConfig {
  /** Timeout for buyer to approve/reject (milliseconds) */
  approvalTimeoutMs?: number;
  /** Whether to auto-approve after timeout (for testing) */
  autoApproveAfterTimeout?: boolean;
}

/** Buyer decision: approve or reject */
export type BuyerDecision = "approve" | "reject";

/** State for buyer approval tracking */
export interface BuyerApprovalState {
  /** The request ID this approval is for */
  requestId: string;
  /** Buyer's decision */
  decision?: BuyerDecision;
  /** Rejection reason (if decision is reject) */
  rejectionReason?: string;
  /** Buyer's notes */
  notes?: string;
  /** When decision was made */
  decidedAt?: string;
  /** Buyer agent ID who decided */
  buyerAgentId: string;
}

/**
 * Verifier for buyer approval step in the approval workflow
 */
export class BuyerApprovalVerifier extends BaseVerifier {
  private approvalTimeoutMs: number;
  private autoApproveAfterTimeout: boolean;
  // In-memory store for approval states (in production, use persistent storage)
  private static approvalStates: Map<string, BuyerApprovalState> = new Map();

  constructor(config: VerifierConfigInput & Partial<{ approvalTimeoutMs: number; autoApproveAfterTimeout: boolean }> = {}) {
    super({
      id: config.id ?? "buyer-approval-verifier",
      name: config.name ?? "Buyer Approval Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 50, // Run after seller completion
      required: config.required ?? true, // Required by default for approval workflow
      timeoutMs: config.timeoutMs ?? 5000,
    });
    this.approvalTimeoutMs = config.approvalTimeoutMs ?? 86400000; // 24 hours default
    this.autoApproveAfterTimeout = config.autoApproveAfterTimeout ?? false;
  }

  /**
   * Submit buyer's decision (approve or reject)
   * This is called externally when the buyer reviews the delivery
   */
  static submitDecision(
    requestId: string,
    buyerAgentId: string,
    decision: BuyerDecision,
    rejectionReason?: string,
    notes?: string
  ): BuyerApprovalState {
    if (decision === "reject" && !rejectionReason) {
      throw new Error("Rejection reason is required when decision is 'reject'");
    }
    const state: BuyerApprovalState = {
      requestId,
      decision,
      rejectionReason,
      notes,
      decidedAt: new Date().toISOString(),
      buyerAgentId,
    };
    this.approvalStates.set(requestId, state);
    return state;
  }

  /**
   * Get the approval state for a request
   */
  static getApprovalState(requestId: string): BuyerApprovalState | undefined {
    return this.approvalStates.get(requestId);
  }

  /**
   * Clear approval state (e.g., after verification completes)
   */
  static clearApprovalState(requestId: string): void {
    this.approvalStates.delete(requestId);
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    const state = BuyerApprovalVerifier.getApprovalState(request.requestId);

    // Check if buyer has made a decision
    if (!state || !state.decision) {
      // Check if we should auto-approve after timeout
      if (this.autoApproveAfterTimeout) {
        // For demo/testing purposes only
        return this.createVerdict(request, "verified", {
          proof: `auto-approved-after-timeout-${request.requestId}`,
          metadata: {
            step: "buyer-approval",
            autoApproved: true,
            timeoutMs: this.approvalTimeoutMs,
          },
        });
      }

      return this.createVerdict(request, "rejected", {
        rejectionReason: "Buyer has not submitted approval decision yet",
        metadata: {
          step: "buyer-approval",
          requiresAction: "buyer-decide",
        },
      });
    }

    // Verify the buyer deciding matches the deal buyer
    if (state.buyerAgentId !== request.deal.buyer.agentId) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Decision submitted by wrong buyer (expected: ${request.deal.buyer.agentId}, got: ${state.buyerAgentId})`,
        metadata: { step: "buyer-approval", mismatch: true },
      });
    }

    // Check approval timeout
    if (state.decidedAt) {
      const decidedTime = new Date(state.decidedAt).getTime();
      const now = Date.now();
      if (now - decidedTime > this.approvalTimeoutMs) {
        return this.createVerdict(request, "rejected", {
          rejectionReason: `Approval decision expired (timeout: ${this.approvalTimeoutMs}ms)`,
          metadata: { step: "buyer-approval", expired: true },
        });
      }
    }

    // Return verdict based on buyer's decision
    if (state.decision === "approve") {
      return this.createVerdict(request, "verified", {
        proof: `buyer-approved-${request.requestId}`,
        metadata: {
          step: "buyer-approval",
          decision: "approve",
          buyerNotes: state.notes,
          decidedAt: state.decidedAt,
          buyerAgentId: state.buyerAgentId,
        },
      });
    } else {
      return this.createVerdict(request, "rejected", {
        rejectionReason: state.rejectionReason ?? "Buyer rejected the delivery",
        metadata: {
          step: "buyer-approval",
          decision: "reject",
          buyerNotes: state.notes,
          decidedAt: state.decidedAt,
          buyerAgentId: state.buyerAgentId,
        },
      });
    }
  }
}

/**
 * Admin Verification Provider
 *
 * For testing and demonstrations. Allows an admin to override
 * the verification result directly. Useful for:
 * - Testing the verification flow without real buyer/seller
 * - Demos where you want to force a specific outcome
 * - Emergency overrides
 */
export interface AdminVerifierConfig extends VerifierConfig {
  /** Default decision if not overridden per-request */
  defaultDecision?: "verified" | "rejected" | "error";
  /** Default rejection reason */
  defaultRejectionReason?: string;
  /** Allowed admin agent IDs */
  allowedAdminIds?: string[];
}

/** State for admin override tracking */
export interface AdminOverrideState {
  /** The request ID this override is for */
  requestId: string;
  /** Admin's decision */
  decision: "verified" | "rejected" | "error";
  /** Rejection reason (if decision is rejected) */
  rejectionReason?: string;
  /** Admin's notes */
  notes?: string;
  /** When override was applied */
  overriddenAt: string;
  /** Admin agent ID who overrode */
  adminAgentId: string;
}

/**
 * Verifier for admin override (testing/demos)
 */
export class AdminVerifier extends BaseVerifier {
  private defaultDecision: "verified" | "rejected" | "error";
  private defaultRejectionReason: string;
  private allowedAdminIds: string[];
  // In-memory store for admin overrides
  private static adminOverrides: Map<string, AdminOverrideState> = new Map();

  constructor(config: VerifierConfigInput & Partial<{ defaultDecision: "verified" | "rejected" | "error"; defaultRejectionReason: string; allowedAdminIds: string[] }> = {}) {
    super({
      id: config.id ?? "admin-verifier",
      name: config.name ?? "Admin Verifier",
      enabled: config.enabled ?? false, // Disabled by default for safety
      priority: config.priority ?? 100, // Run last as override
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    });
    this.defaultDecision = config.defaultDecision ?? "verified";
    this.defaultRejectionReason = config.defaultRejectionReason ?? "Admin override";
    this.allowedAdminIds = config.allowedAdminIds ?? [];
  }

  /**
   * Apply admin override for a request
   */
  static applyOverride(
    requestId: string,
    adminAgentId: string,
    decision: "verified" | "rejected" | "error",
    rejectionReason?: string,
    notes?: string
  ): AdminOverrideState {
    if (decision === "rejected" && !rejectionReason) {
      throw new Error("Rejection reason is required when decision is 'rejected'");
    }
    const state: AdminOverrideState = {
      requestId,
      decision,
      rejectionReason,
      notes,
      overriddenAt: new Date().toISOString(),
      adminAgentId,
    };
    this.adminOverrides.set(requestId, state);
    return state;
  }

  /**
   * Get the admin override for a request
   */
  static getOverride(requestId: string): AdminOverrideState | undefined {
    return this.adminOverrides.get(requestId);
  }

  /**
   * Clear admin override
   */
  static clearOverride(requestId: string): void {
    this.adminOverrides.delete(requestId);
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    const override = AdminVerifier.getOverride(request.requestId);

    // If no override applied, use default decision
    if (!override) {
      if (this.defaultDecision === "verified") {
        return this.createVerdict(request, "verified", {
          proof: `admin-default-verified-${request.requestId}`,
          metadata: { step: "admin-override", defaultDecision: true },
        });
      } else if (this.defaultDecision === "rejected") {
        return this.createVerdict(request, "rejected", {
          rejectionReason: this.defaultRejectionReason,
          metadata: { step: "admin-override", defaultDecision: true },
        });
      } else {
        return this.createVerdict(request, "error", {
          rejectionReason: this.defaultRejectionReason,
          metadata: { step: "admin-override", defaultDecision: true, error: true },
        });
      }
    }

    // Verify admin is allowed (if allowedAdminIds is configured)
    if (this.allowedAdminIds.length > 0 && !this.allowedAdminIds.includes(override.adminAgentId)) {
      return this.createVerdict(request, "error", {
        rejectionReason: `Admin agent ${override.adminAgentId} not authorized for overrides`,
        metadata: { step: "admin-override", unauthorized: true },
      });
    }

    // Return verdict based on admin's decision
    if (override.decision === "verified") {
      return this.createVerdict(request, "verified", {
        proof: `admin-override-verified-${request.requestId}`,
        metadata: {
          step: "admin-override",
          adminNotes: override.notes,
          overriddenAt: override.overriddenAt,
          adminAgentId: override.adminAgentId,
        },
      });
    } else if (override.decision === "rejected") {
      return this.createVerdict(request, "rejected", {
        rejectionReason: override.rejectionReason ?? this.defaultRejectionReason,
        metadata: {
          step: "admin-override",
          adminNotes: override.notes,
          overriddenAt: override.overriddenAt,
          adminAgentId: override.adminAgentId,
        },
      });
    } else {
      return this.createVerdict(request, "error", {
        rejectionReason: override.rejectionReason ?? this.defaultRejectionReason,
        metadata: {
          step: "admin-override",
          adminNotes: override.notes,
          overriddenAt: override.overriddenAt,
          adminAgentId: override.adminAgentId,
          error: true,
        },
      });
    }
  }
}

/**
 * Terms Compliance Verifier
 *
 * Verifies that the deal terms match what was agreed in the negotiation
 * and comply with any additional business rules.
 */
export interface TermsVerifierConfig extends VerifierConfig {
  /** Allowed resource types */
  allowedResources?: string[];
  /** Maximum quantity per deal */
  maxQty?: number;
  /** Maximum total USDC per deal */
  maxTotalUsdc?: number;
}

export class TermsVerifier extends BaseVerifier {
  private allowedResources: string[];
  private maxQty: number;
  private maxTotalUsdc: number;

  constructor(config: VerifierConfigInput & Partial<{ allowedResources: string[]; maxQty: number; maxTotalUsdc: number }> = {}) {
    super({
      id: config.id ?? "terms-verifier",
      name: config.name ?? "Terms Compliance Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 30,
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    });
    this.allowedResources = config.allowedResources ?? ["gpu", "storage", "bandwidth", "compute"];
    this.maxQty = config.maxQty ?? 1000;
    this.maxTotalUsdc = config.maxTotalUsdc ?? 100000;
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    const { deal } = request;

    // Check resource type
    // Note: resource isn't directly in the deal object from negotiation,
    // but could be in context or derived from requirements
    const resource = (request.context?.resource as string) ?? "unknown";

    if (!this.allowedResources.includes(resource)) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Resource type '${resource}' not in allowed list: ${this.allowedResources.join(", ")}`,
        metadata: { resource, allowedResources: this.allowedResources },
      });
    }

    // Check quantity
    if (deal.qty > this.maxQty) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Quantity ${deal.qty} exceeds maximum ${this.maxQty}`,
        metadata: { qty: deal.qty, maxQty: this.maxQty },
      });
    }

    // Check total USDC
    if (deal.totalUsdc > this.maxTotalUsdc) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Total USDC ${deal.totalUsdc} exceeds maximum ${this.maxTotalUsdc}`,
        metadata: { totalUsdc: deal.totalUsdc, maxTotalUsdc: this.maxTotalUsdc },
      });
    }

    // Check price bounds are reasonable
    if (deal.unitPrice <= 0) {
      return this.createVerdict(request, "rejected", {
        rejectionReason: `Invalid unit price: ${deal.unitPrice}`,
        metadata: { unitPrice: deal.unitPrice },
      });
    }

    return this.createVerdict(request, "verified", {
      proof: `terms-compliance-passed-${request.requestId}`,
      metadata: {
        resource,
        qty: deal.qty,
        unitPrice: deal.unitPrice,
        totalUsdc: deal.totalUsdc,
      },
    });
  }
}