/**
 * Generic Verifier Interface
 *
 * Every verification provider must implement this interface.
 * This is the core abstraction that allows pluggable verifiers.
 */

import type { IVerifier, VerificationRequest, VerificationVerdict, VerifierConfig } from "../types.js";

/**
 * Abstract base class for verifiers.
 * Provides common functionality like ID generation, timestamp handling, etc.
 */
export abstract class BaseVerifier implements IVerifier {
  readonly id: string;
  readonly name: string;
  readonly config: Required<VerifierConfig>;

  constructor(config: VerifierConfig) {
    this.id = config.id ?? "";
    this.name = config.name ?? "";
    this.config = {
      id: config.id ?? "",
      name: config.name ?? "",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 0,
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    };
  }

  /**
   * Main verification logic - must be implemented by subclasses
   */
  abstract verify(request: VerificationRequest): Promise<VerificationVerdict>;

  /**
   * Optional health check - override if needed
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Create a standard verdict object
   */
  protected createVerdict(
    request: VerificationRequest,
    status: "verified" | "rejected" | "error",
    options: {
      proof?: string;
      rejectionReason?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): VerificationVerdict {
    return {
      verdictId: `verdict_${crypto.randomUUID()}`,
      requestId: request.requestId,
      status,
      verifierId: this.id,
      verifierName: this.name,
      proof: options.proof,
      rejectionReason: options.rejectionReason,
      timestamp: new Date().toISOString(),
      metadata: options.metadata ?? {},
    };
  }
}

/**
 * Mock verifier for testing - always passes
 */
export class MockVerifier extends BaseVerifier {
  constructor(config: Partial<VerifierConfig> = {}) {
    super({
      id: config.id ?? "mock-verifier",
      name: config.name ?? "Mock Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 1,
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    });
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    // Simulate some async work
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Always return verified for testing
    return this.createVerdict(request, "verified", {
      proof: `mock-proof-${request.requestId}`,
      metadata: { mock: true },
    });
  }
}

/**
 * Mock verifier that rejects - for testing failure cases
 */
export class MockRejectingVerifier extends BaseVerifier {
  constructor(config: Partial<VerifierConfig> = {}, private rejectionReason = "Mock rejection") {
    super({
      id: config.id ?? "mock-rejecting-verifier",
      name: config.name ?? "Mock Rejecting Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 1,
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    });
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    return this.createVerdict(request, "rejected", {
      rejectionReason: this.rejectionReason,
      metadata: { mock: true },
    });
  }
}

/**
 * Mock verifier that errors - for testing error handling
 */
export class MockErrorVerifier extends BaseVerifier {
  constructor(config: Partial<VerifierConfig> = {}) {
    super({
      id: config.id ?? "mock-error-verifier",
      name: config.name ?? "Mock Error Verifier",
      enabled: config.enabled ?? true,
      priority: config.priority ?? 1,
      required: config.required ?? false,
      timeoutMs: config.timeoutMs ?? 5000,
    });
  }

  async verify(request: VerificationRequest): Promise<VerificationVerdict> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    return this.createVerdict(request, "error", {
      rejectionReason: "Simulated error",
      metadata: { mock: true, error: true },
    });
  }
}