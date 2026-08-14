/**
 * Verification Manager
 *
 * Central orchestrator for the verification process.
 * Routes verification requests to configured providers, collects verdicts,
 * and produces a standardized Verification Result.
 */

import type {
  VerificationRequest,
  VerificationVerdict,
  VerificationResult,
  VerificationStatus,
  VerifierConfig,
  VerificationManagerConfig,
  IVerifier,
  VerifierRegistry,
  verifierRegistry,
  VerificationDashboardView,
  SellerCompletionSubmission,
  BuyerDecisionSubmission,
  AdminOverrideSubmission,
} from "./types.js";
import { BaseVerifier, MockVerifier } from "./providers/base.js";
import {
  SafetyVerifier,
  TermsVerifier,
  ReputationVerifier,
  SellerCompletionVerifier,
  BuyerApprovalVerifier,
  AdminVerifier,
} from "./providers/verifiers.js";

/**
 * Central Verification Manager
 * Responsible for:
 * - Managing verifier instances
 * - Routing requests to verifiers
 * - Collecting and aggregating verdicts
 * - Producing final verification result
 */
export class VerificationManager {
  private verifiers: IVerifier[] = [];
  private config: VerificationManagerConfig;
  private initialized: boolean = false;

  constructor(config: Partial<VerificationManagerConfig> = {}) {
    this.config = {
      verifiers: config.verifiers ?? this.getDefaultVerifierConfigs(),
      stopOnRequiredFailure: config.stopOnRequiredFailure ?? true,
      overallTimeoutMs: config.overallTimeoutMs ?? 60000,
    };
    // Don't initialize in constructor - use async init()
  }

  /**
   * Async initialization - must be called after construction
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.initializeVerifiers();
    this.initialized = true;
  }

  /**
   * Static factory method to create and initialize a VerificationManager
   */
  static async create(config: Partial<VerificationManagerConfig> = {}): Promise<VerificationManager> {
    const manager = new VerificationManager(config);
    await manager.init();
    return manager;
  }

  /**
   * Get default verifier configurations
   */
  private getDefaultVerifierConfigs(): VerifierConfig[] {
    return [
      {
        id: "safety-verifier",
        name: "Safety Transformer Verifier",
        enabled: true,
        priority: 10,
        required: true,
        timeoutMs: 5000,
      },
      {
        id: "terms-verifier",
        name: "Terms Compliance Verifier",
        enabled: true,
        priority: 20,
        required: false,
        timeoutMs: 5000,
      },
      {
        id: "reputation-verifier",
        name: "Reputation Verifier",
        enabled: true,
        priority: 30,
        required: false,
        timeoutMs: 10000,
      },
      {
        id: "seller-completion-verifier",
        name: "Seller Completion Verifier",
        enabled: true,
        priority: 40,
        required: true,
        timeoutMs: 5000,
      },
      {
        id: "buyer-approval-verifier",
        name: "Buyer Approval Verifier",
        enabled: true,
        priority: 50,
        required: true,
        timeoutMs: 5000,
      },
    ];
  }

  /**
   * Initialize verifier instances from configurations
   */
  private async initializeVerifiers(): Promise<void> {
    this.verifiers = [];

    for (const verifierConfig of this.config.verifiers) {
      if (verifierConfig.enabled === false) continue;

      const verifier = await this.createVerifier(verifierConfig);
      if (verifier) {
        this.verifiers.push(verifier);
      }
    }

    // Sort by priority (lower = higher priority = runs first)
    this.verifiers.sort((a, b) => (a.config.priority ?? 0) - (b.config.priority ?? 0));
  }

  /**
   * Factory method to create verifier instances from config
   * In production, this would use a registry or DI container
   */
  private async createVerifier(config: VerifierConfig): Promise<IVerifier | null> {
    // Map verifier IDs to concrete implementations
    switch (config.id) {
      case "safety-verifier":
        return new SafetyVerifier(config);
      case "terms-verifier":
        // Import dynamically to avoid circular deps
        return await this.createTermsVerifier(config);
      case "reputation-verifier":
        return await this.createReputationVerifier(config);
      case "seller-completion-verifier":
        return new SellerCompletionVerifier(config);
      case "buyer-approval-verifier":
        return new BuyerApprovalVerifier(config);
      case "admin-verifier":
        return new AdminVerifier(config);
      case "mock-verifier":
        return new MockVerifier(config);
      default:
        console.warn(`[VerificationManager] Unknown verifier ID: ${config.id}`);
        return null;
    }
  }

  /**
   * Create TermsVerifier - using dynamic import to avoid circular deps
   */
  private async createTermsVerifier(config: VerifierConfig): Promise<IVerifier> {
    // We'll instantiate it directly here since we're in the same package
    const { TermsVerifier } = await import("./providers/verifiers");
    return new TermsVerifier(config);
  }

  /**
   * Create ReputationVerifier
   */
  private async createReputationVerifier(config: VerifierConfig): Promise<IVerifier> {
    const { ReputationVerifier } = await import("./providers/verifiers");
    return new ReputationVerifier(config);
  }

  /**
   * Register a custom verifier instance
   * Useful for testing or adding verifiers at runtime
   */
  registerVerifier(verifier: IVerifier): void {
    // Remove existing verifier with same ID if any
    this.verifiers = this.verifiers.filter((v) => v.id !== verifier.id);
    this.verifiers.push(verifier);
    // Re-sort by priority
    this.verifiers.sort((a, b) => (a.config.priority ?? 0) - (b.config.priority ?? 0));
  }

  /**
   * Unregister a verifier by ID
   */
  unregisterVerifier(verifierId: string): void {
    this.verifiers = this.verifiers.filter((v) => v.id !== verifierId);
  }

  /**
   * Get all registered verifiers
   */
  getVerifiers(): IVerifier[] {
    return [...this.verifiers];
  }

  /**
   * Run the full verification process for a request
   */
  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const startedAt = new Date().toISOString();
    const verdicts: VerificationVerdict[] = [];

    // Create a promise that rejects after overall timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Verification timed out after ${this.config.overallTimeoutMs}ms`)), this.config.overallTimeoutMs);
    });

    // Run all verifiers in parallel with individual timeouts
    const verificationPromise = this.runVerifiers(request, verdicts);

    try {
      await Promise.race([verificationPromise, timeoutPromise]);
    } catch (error) {
      // If timeout, add an error verdict
      const errorVerdict = this.createErrorVerdict(request, String(error));
      verdicts.push(errorVerdict);
    }

    const completedAt = new Date().toISOString();

    // Determine final status
    const finalStatus = this.aggregateStatus(verdicts);
    const passed = finalStatus === "verified";

    return {
      request,
      verdicts,
      finalStatus,
      passed,
      startedAt,
      completedAt,
    };
  }

  /**
   * Run all enabled verifiers
   */
  private async runVerifiers(request: VerificationRequest, verdicts: VerificationVerdict[]): Promise<void> {
    const verifierPromises = this.verifiers.map(async (verifier) => {
      const verifierConfig = this.config.verifiers.find((vc) => vc.id === verifier.id);
      const timeoutMs = verifierConfig?.timeoutMs ?? 5000;

      try {
        // Create a timeout promise for this verifier
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Verifier ${verifier.name} timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        const verdict = await Promise.race([verifier.verify(request), timeoutPromise]);
        verdicts.push(verdict);

        // Check if we should stop on required failure
        if (this.config.stopOnRequiredFailure && verdict.status === "rejected" && verifier.config.required) {
          // We could cancel other verifiers here, but for simplicity we let them complete
          // In a production system, you might want to use AbortController
        }
      } catch (error) {
        // Verifier error - create error verdict
        const errorVerdict = this.createErrorVerdict(request, String(error), verifier.id, verifier.name);
        verdicts.push(errorVerdict);

        if (this.config.stopOnRequiredFailure && verifier.config.required) {
          // Could stop here, but we continue for now
        }
      }
    });

    await Promise.all(verifierPromises);
  }

  /**
   * Create an error verdict
   */
  private createErrorVerdict(
    request: VerificationRequest,
    error: string,
    verifierId = "unknown",
    verifierName = "Unknown Verifier"
  ): VerificationVerdict {
    return {
      verdictId: `verdict_${crypto.randomUUID()}`,
      requestId: request.requestId,
      status: "error",
      verifierId,
      verifierName,
      rejectionReason: `Verifier error: ${error}`,
      timestamp: new Date().toISOString(),
      metadata: { error: true },
    };
  }

  /**
   * Aggregate verdicts into final status
   */
  private aggregateStatus(verdicts: VerificationVerdict[]): VerificationStatus {
    if (verdicts.length === 0) {
      return "error";
    }

    // Check for any required verifier that rejected or errored
    for (const verdict of verdicts) {
      const verifierConfig = this.config.verifiers.find((vc) => vc.id === verdict.verifierId);
      if (verifierConfig?.required && (verdict.status === "rejected" || verdict.status === "error")) {
        return verdict.status;
      }
    }

    // Check if any verifier rejected (even non-required)
    if (verdicts.some((v) => v.status === "rejected")) {
      return "rejected";
    }

    // Check if any verifier errored
    if (verdicts.some((v) => v.status === "error")) {
      return "error";
    }

    // All verified
    return "verified";
  }

  /**
   * Create a verification request from a deal result (from negotiation)
   */
  static createRequestFromDeal(
    dealResult: {
      roomId: string;
      transcriptHash: string;
      deal: {
        buyer: { agentRegistry: string; agentId: string; wallet: string };
        seller: { agentRegistry: string; agentId: string; wallet: string };
        unitPrice: number;
        qty: number;
        terms: string;
        totalUsdc: number;
      };
    },
    context: Record<string, unknown> = {},
    requestId?: string
  ): VerificationRequest {
    return {
      requestId: requestId ?? `req_${crypto.randomUUID()}`,
      roomId: dealResult.roomId,
      transcriptHash: dealResult.transcriptHash,
      deal: dealResult.deal,
      context,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Health check all verifiers
   /** Health check all verifiers */
     async healthCheck(): Promise<Record<string, boolean>> {
       const results: Record<string, boolean> = {};
       for (const verifier of this.verifiers) {
         try {
           results[verifier.id] = await verifier.healthCheck?.() ?? true;
         } catch {
           results[verifier.id] = false;
         }
       }
       return results;
     }

     /**
      * Get a dashboard-friendly view of a verification request
      * This combines the verification request with verdicts and computes role-specific actions
      */
     getDashboardView(request: VerificationRequest, verdicts: VerificationVerdict[], currentAgentId?: string, currentAgentRole?: "buyer" | "seller" | "admin"): VerificationDashboardView {
       // Determine current status from verdicts
       let currentStatus: VerificationStatus = "pending";
       const sellerCompletionVerdict = verdicts.find(v => v.verifierId === "seller-completion-verifier");
       const buyerApprovalVerdict = verdicts.find(v => v.verifierId === "buyer-approval-verifier");
       const adminOverrideVerdict = verdicts.find(v => v.verifierId === "admin-verifier");

       if (adminOverrideVerdict) {
         currentStatus = adminOverrideVerdict.status === "verified" ? "verified" : adminOverrideVerdict.status === "rejected" ? "rejected" : "disputed";
       } else if (buyerApprovalVerdict) {
         if (buyerApprovalVerdict.status === "verified") {
           currentStatus = "verified";
         } else if (buyerApprovalVerdict.status === "rejected") {
           currentStatus = "rejected";
         }
       } else if (sellerCompletionVerdict) {
         if (sellerCompletionVerdict.status === "verified") {
           currentStatus = "waiting_for_buyer";
         } else {
           currentStatus = "seller_completed";
         }
       }

       // Collect submitted proofs and rejection reasons
       const submittedProofs = verdicts
         .filter(v => v.proof)
         .map(v => ({
           verifierId: v.verifierId,
           verifierName: v.verifierName,
           proof: v.proof,
           notes: (v.metadata?.notes as string) || (v.metadata?.sellerNotes as string) || (v.metadata?.buyerNotes as string) || (v.metadata?.adminNotes as string),
           submittedAt: v.timestamp,
         }));

       const rejectionReasons = verdicts
         .filter(v => v.rejectionReason)
         .map(v => ({
           verifierId: v.verifierId,
           verifierName: v.verifierName,
           reason: v.rejectionReason!,
           at: v.timestamp,
         }));

       // Determine role-specific actions
       const deal = request.deal;
       const canSellerComplete = currentStatus === "pending" && currentAgentRole === "seller" && currentAgentId === deal.seller.agentId;
       const canBuyerApprove = currentStatus === "waiting_for_buyer" && currentAgentRole === "buyer" && currentAgentId === deal.buyer.agentId;
       const canBuyerReject = currentStatus === "waiting_for_buyer" && currentAgentRole === "buyer" && currentAgentId === deal.buyer.agentId;
       const canAdminOverride = currentAgentRole === "admin"; // Admins can always override

       // Get timestamps from verdicts
       const sellerCompletedAt = sellerCompletionVerdict?.timestamp;
       const buyerDecisionAt = buyerApprovalVerdict?.timestamp;
       const finalVerdictAt = adminOverrideVerdict?.timestamp ?? buyerApprovalVerdict?.timestamp;

       return {
         requestId: request.requestId,
         roomId: request.roomId,
         transcriptHash: request.transcriptHash,
         deal: request.deal,
         currentStatus,
         verificationProvider: "finality-verification-manager",
         createdAt: request.createdAt,
         sellerCompletedAt,
         buyerDecisionAt,
         finalVerdictAt,
         submittedProofs,
         rejectionReasons,
         verdicts,
         canSellerComplete,
         canBuyerApprove,
         canBuyerReject,
         canAdminOverride,
       };
     }

     /**
      * Submit seller completion
      */
     async submitSellerCompletion(submission: SellerCompletionSubmission): Promise<VerificationVerdict> {
       SellerCompletionVerifier.submitCompletion(
         submission.requestId,
         submission.sellerAgentId,
         submission.proof,
         submission.notes
       );
    
       // Return a mock verdict - in production this would trigger re-verification
       const mockRequest: VerificationRequest = {
         requestId: submission.requestId,
         roomId: "",
         transcriptHash: "",
         deal: { buyer: { agentRegistry: "", agentId: "", wallet: "" }, seller: { agentRegistry: "", agentId: "", wallet: "" }, unitPrice: 0, qty: 0, terms: "", totalUsdc: 0 },
         context: {},
         createdAt: new Date().toISOString(),
       };
    
       return {
         verdictId: `verdict_${crypto.randomUUID()}`,
         requestId: submission.requestId,
         status: "verified",
         verifierId: "seller-completion-verifier",
         verifierName: "Seller Completion Verifier",
         proof: submission.proof,
         timestamp: new Date().toISOString(),
         metadata: { notes: submission.notes, step: "seller-completion", sellerAgentId: submission.sellerAgentId },
       };
     }

     /**
      * Submit buyer decision (approve/reject)
      */
     async submitBuyerDecision(submission: BuyerDecisionSubmission): Promise<VerificationVerdict> {
       BuyerApprovalVerifier.submitDecision(
         submission.requestId,
         submission.buyerAgentId,
         submission.decision,
         submission.rejectionReason,
         submission.notes
       );

       const mockRequest: VerificationRequest = {
         requestId: submission.requestId,
         roomId: "",
         transcriptHash: "",
         deal: { buyer: { agentRegistry: "", agentId: "", wallet: "" }, seller: { agentRegistry: "", agentId: "", wallet: "" }, unitPrice: 0, qty: 0, terms: "", totalUsdc: 0 },
         context: {},
         createdAt: new Date().toISOString(),
       };

       return {
         verdictId: `verdict_${crypto.randomUUID()}`,
         requestId: submission.requestId,
         status: submission.decision === "approve" ? "verified" : "rejected",
         verifierId: "buyer-approval-verifier",
         verifierName: "Buyer Approval Verifier",
         proof: submission.decision === "approve" ? `buyer-approved-${submission.requestId}` : undefined,
         rejectionReason: submission.rejectionReason,
         timestamp: new Date().toISOString(),
         metadata: { notes: submission.notes, step: "buyer-approval", decision: submission.decision, buyerAgentId: submission.buyerAgentId },
       };
     }

     /**
      * Submit admin override
      */
     async submitAdminOverride(submission: AdminOverrideSubmission): Promise<VerificationVerdict> {
       AdminVerifier.applyOverride(
         submission.requestId,
         submission.adminAgentId,
         submission.decision,
         submission.rejectionReason,
         submission.notes
       );

       const mockRequest: VerificationRequest = {
         requestId: submission.requestId,
         roomId: "",
         transcriptHash: "",
         deal: { buyer: { agentRegistry: "", agentId: "", wallet: "" }, seller: { agentRegistry: "", agentId: "", wallet: "" }, unitPrice: 0, qty: 0, terms: "", totalUsdc: 0 },
         context: {},
         createdAt: new Date().toISOString(),
       };

       return {
         verdictId: `verdict_${crypto.randomUUID()}`,
         requestId: submission.requestId,
         status: submission.decision,
         verifierId: "admin-verifier",
         verifierName: "Admin Verifier",
         proof: submission.decision === "verified" ? `admin-override-verified-${submission.requestId}` : undefined,
         rejectionReason: submission.rejectionReason,
         timestamp: new Date().toISOString(),
         metadata: { notes: submission.notes, step: "admin-override", decision: submission.decision, adminAgentId: submission.adminAgentId },
       };
     }

     /**
      * Re-run verification for a request (after seller/buyer/admin action)
      */
     async reverify(request: VerificationRequest): Promise<VerificationResult> {
       return this.verify(request);
     }
   }

/**
 * Default Verification Manager instance (singleton pattern for convenience)
 */
let defaultManager: VerificationManager | null = null;

export function getVerificationManager(config?: Partial<VerificationManagerConfig>): VerificationManager {
  if (!defaultManager) {
    defaultManager = new VerificationManager(config);
  }
  return defaultManager;
}

export function setVerificationManager(manager: VerificationManager): void {
  defaultManager = manager;
}

// Export the registry
export { verifierRegistry } from "./types.js";