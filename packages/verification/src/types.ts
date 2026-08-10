/**
 * Verification Layer Types
 *
 * This layer sits between Negotiation (Part 2) and Settlement (Part 3).
 * When a deal closes, instead of immediately proceeding to settlement,
 * a Verification Request is created and routed through the Verification Manager.
 */

import { z } from "zod";

/** Unique identifier for a verification request */
export type VerificationRequestId = string & { readonly brand: unique symbol };

/** Unique identifier for a verifier provider */
export type VerifierId = string & { readonly brand: unique symbol };

/** Verification status - user-friendly statuses for the dashboard */
export type VerificationStatus =
  | "pending"
  | "seller_completed"
  | "waiting_for_buyer"
  | "verified"
  | "rejected"
  | "disputed"
  | "error";

/** Internal status for verifier aggregation */
export type VerifierStatus = "verified" | "rejected" | "error";

/** Extended verification request with dashboard-friendly fields */
export const extendedVerificationRequestSchema = z.object({
  requestId: z.string(),
  roomId: z.string(),
  transcriptHash: z.string(),
  deal: z.object({
    buyer: z.object({
      agentRegistry: z.string(),
      agentId: z.string(),
      wallet: z.string(),
    }),
    seller: z.object({
      agentRegistry: z.string(),
      agentId: z.string(),
      wallet: z.string(),
    }),
    unitPrice: z.number().nonnegative(),
    qty: z.number().nonnegative(),
    terms: z.string(),
    totalUsdc: z.number().positive(),
  }),
  context: z.record(z.unknown()).optional().default({}),
  createdAt: z.string().datetime(),
  /** Dashboard-specific fields */
  currentStatus: z.enum(["pending", "seller_completed", "waiting_for_buyer", "verified", "rejected", "disputed", "error"]).default("pending"),
  verificationProvider: z.string().optional(),
  sellerCompletedAt: z.string().datetime().optional(),
  buyerDecisionAt: z.string().datetime().optional(),
  finalVerdictAt: z.string().datetime().optional(),
  submittedProofs: z.array(z.object({
    verifierId: z.string(),
    verifierName: z.string(),
    proof: z.string().optional(),
    notes: z.string().optional(),
    submittedAt: z.string().datetime(),
  })).optional().default([]),
  rejectionReasons: z.array(z.object({
    verifierId: z.string(),
    verifierName: z.string(),
    reason: z.string(),
    at: z.string().datetime(),
  })).optional().default([]),
});

export type ExtendedVerificationRequest = z.infer<typeof extendedVerificationRequestSchema>;

/** Extended verdict with dashboard-friendly fields */
export const extendedVerificationVerdictSchema = z.object({
  verdictId: z.string(),
  requestId: z.string(),
  status: z.enum(["verified", "rejected", "error"]),
  verifierId: z.string(),
  verifierName: z.string(),
  proof: z.string().optional(),
  rejectionReason: z.string().optional(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional().default({}),
  /** Dashboard fields */
  notes: z.string().optional(),
  submittedBy: z.string().optional(), // agentId of who submitted
});

export type ExtendedVerificationVerdict = z.infer<typeof extendedVerificationVerdictSchema>;

/** Input to a verification request - contains the closed deal from negotiation */
export const verificationRequestSchema = z.object({
  /** Unique ID for this verification request */
  requestId: z.string(),
  /** The roomId from the negotiation */
  roomId: z.string(),
  /** The transcript hash from the deal close */
  transcriptHash: z.string(),
  /** The closed deal details */
  deal: z.object({
    buyer: z.object({
      agentRegistry: z.string(),
      agentId: z.string(),
      wallet: z.string(),
    }),
    seller: z.object({
      agentRegistry: z.string(),
      agentId: z.string(),
      wallet: z.string(),
    }),
    unitPrice: z.number().nonnegative(),
    qty: z.number().nonnegative(),
    terms: z.string(),
    totalUsdc: z.number().positive(),
  }),
  /** Optional context/metadata for the verifier */
  context: z.record(z.unknown()).optional().default({}),
  /** Timestamp when the request was created */
  createdAt: z.string().datetime(),
});

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;

/** Output from a verification provider */
export const verificationVerdictSchema = z.object({
  /** Unique ID for this verdict */
  verdictId: z.string(),
  /** The request this verdict responds to */
  requestId: z.string(),
  /** Verification status */
  status: z.enum(["verified", "rejected", "error"]),
  /** The verifier that produced this verdict */
  verifierId: z.string(),
  /** Human-readable name of the verifier */
  verifierName: z.string(),
  /** Optional proof (hash, signature, receipt, etc.) */
  proof: z.string().optional(),
  /** Rejection reason (required if status is rejected) */
  rejectionReason: z.string().optional(),
  /** Timestamp when verdict was produced */
  timestamp: z.string().datetime(),
  /** Optional additional metadata */
  metadata: z.record(z.unknown()).optional().default({}),
});

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;

/** Verifier configuration */
export interface VerifierConfig {
  /** Unique identifier for this verifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether this verifier is enabled */
  enabled: boolean;
  /** Priority (lower = higher priority, runs first) */
  priority: number;
  /** Whether this verifier is required (if false, failures can be skipped) */
  required: boolean;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

/** Constructor config type with optional fields for defaults */
export type VerifierConfigInput = Partial<VerifierConfig>;

/** Result of the verification process */
export interface VerificationResult {
  /** The original request */
  request: VerificationRequest;
  /** All verdicts from all verifiers that ran */
  verdicts: VerificationVerdict[];
  /** Final aggregated status */
  finalStatus: VerificationStatus;
  /** Whether verification passed overall */
  passed: boolean;
  /** Started timestamp */
  startedAt: string;
  /** Completed timestamp */
  completedAt: string;
}

/** Provider interface - every verifier must implement this */
export interface IVerifier {
  /** Unique identifier for this verifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Configuration for this verifier */
  readonly config: Required<VerifierConfig>;

  /**
   * Verify a request and return a verdict
   * @param request The verification request
   * @returns The verdict (must include status, verifierId, verifierName, timestamp)
   */
  verify(request: VerificationRequest): Promise<VerificationVerdict>;

  /**
   * Optional health check
   */
  healthCheck?(): Promise<boolean>;
}

/** Verification Manager configuration */
export interface VerificationManagerConfig {
  /** List of verifier configurations */
  verifiers: VerifierConfig[];
  /** Whether to stop on first required verifier failure */
  stopOnRequiredFailure: boolean;
  /** Overall timeout for the entire verification process */
  overallTimeoutMs: number;
}

/** Verifier Registry - for pluggable architecture */
export interface IVerifierRegistry {
  /** Register a verifier class */
  register(verifierId: string, verifierClass: new (config: VerifierConfig) => IVerifier): void;
  /** Unregister a verifier */
  unregister(verifierId: string): void;
  /** Get a verifier class by ID */
  get(verifierId: string): (new (config: VerifierConfig) => IVerifier) | undefined;
  /** List all registered verifier IDs */
  list(): string[];
  /** Create a verifier instance from config */
  create(config: VerifierConfig): IVerifier | null;
}

/** Default verifier registry implementation */
export class VerifierRegistry implements IVerifierRegistry {
  private registry: Map<string, new (config: VerifierConfig) => IVerifier> = new Map();

  register(verifierId: string, verifierClass: new (config: VerifierConfig) => IVerifier): void {
    this.registry.set(verifierId, verifierClass);
  }

  unregister(verifierId: string): void {
    this.registry.delete(verifierId);
  }

  get(verifierId: string): (new (config: VerifierConfig) => IVerifier) | undefined {
    return this.registry.get(verifierId);
  }

  list(): string[] {
    return [...this.registry.keys()];
  }

  create(config: VerifierConfig): IVerifier | null {
    const VerifierClass = this.registry.get(config.id);
    if (!VerifierClass) {
      console.warn(`[VerifierRegistry] Unknown verifier ID: ${config.id}`);
      return null;
    }
    return new VerifierClass(config);
  }
}

/** Default verifier registry instance */
export const verifierRegistry = new VerifierRegistry();

/** Dashboard view of a verification request */
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
  /** Role-specific actions */
  canSellerComplete: boolean;
  canBuyerApprove: boolean;
  canBuyerReject: boolean;
  canAdminOverride: boolean;
}

/** Seller completion submission */
export interface SellerCompletionSubmission {
  requestId: string;
  sellerAgentId: string;
  proof: string;
  notes?: string;
}

/** Buyer decision submission */
export interface BuyerDecisionSubmission {
  requestId: string;
  buyerAgentId: string;
  decision: "approve" | "reject";
  rejectionReason?: string;
  notes?: string;
}

/** Admin override submission */
export interface AdminOverrideSubmission {
  requestId: string;
  adminAgentId: string;
  decision: "verified" | "rejected" | "error";
  rejectionReason?: string;
  notes?: string;
}