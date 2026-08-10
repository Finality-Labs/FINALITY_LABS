/**
 * Verification Layer - Main Entry Point
 *
 * This package provides the Verification Layer that sits between
 * Negotiation (Part 2) and Settlement (Part 3).
 */

export * from "./types.js";
export * from "./manager.js";
export * from "./providers/base.js";
export * from "./providers/verifiers.js";

// Re-export for convenience
export {
  VerificationManager,
  getVerificationManager,
  setVerificationManager,
  verifierRegistry,
} from "./manager.js";

export {
  BaseVerifier,
  MockVerifier,
  MockRejectingVerifier,
  MockErrorVerifier,
} from "./providers/base.js";

export {
  SafetyVerifier,
  ReputationVerifier,
  TermsVerifier,
  SellerCompletionVerifier,
  BuyerApprovalVerifier,
  AdminVerifier,
} from "./providers/verifiers.js";