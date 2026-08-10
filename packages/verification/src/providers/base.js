/**
 * Generic Verifier Interface
 *
 * Every verification provider must implement this interface.
 * This is the core abstraction that allows pluggable verifiers.
 */
/**
 * Abstract base class for verifiers.
 * Provides common functionality like ID generation, timestamp handling, etc.
 */
export class BaseVerifier {
    id;
    name;
    config;
    constructor(config) {
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
     * Optional health check - override if needed
     */
    async healthCheck() {
        return true;
    }
    /**
     * Create a standard verdict object
     */
    createVerdict(request, status, options = {}) {
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
    constructor(config = {}) {
        super({
            id: config.id ?? "mock-verifier",
            name: config.name ?? "Mock Verifier",
            enabled: config.enabled ?? true,
            priority: config.priority ?? 1,
            required: config.required ?? false,
            timeoutMs: config.timeoutMs ?? 5000,
        });
    }
    async verify(request) {
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
    rejectionReason;
    constructor(config = {}, rejectionReason = "Mock rejection") {
        super({
            id: config.id ?? "mock-rejecting-verifier",
            name: config.name ?? "Mock Rejecting Verifier",
            enabled: config.enabled ?? true,
            priority: config.priority ?? 1,
            required: config.required ?? false,
            timeoutMs: config.timeoutMs ?? 5000,
        });
        this.rejectionReason = rejectionReason;
    }
    async verify(request) {
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
    constructor(config = {}) {
        super({
            id: config.id ?? "mock-error-verifier",
            name: config.name ?? "Mock Error Verifier",
            enabled: config.enabled ?? true,
            priority: config.priority ?? 1,
            required: config.required ?? false,
            timeoutMs: config.timeoutMs ?? 5000,
        });
    }
    async verify(request) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.createVerdict(request, "error", {
            rejectionReason: "Simulated error",
            metadata: { mock: true, error: true },
        });
    }
}
