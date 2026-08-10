/**
 * Verification Layer Types
 *
 * This layer sits between Negotiation (Part 2) and Settlement (Part 3).
 * When a deal closes, instead of immediately proceeding to settlement,
 * a Verification Request is created and routed through the Verification Manager.
 */
import { z } from "zod";
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
