/**
 * Verification Manager
 *
 * Central orchestrator for the verification process.
 * Routes verification requests to configured providers, collects verdicts,
 * and produces a standardized Verification Result.
 */
import { MockVerifier } from "./providers/base.js";
import { SafetyVerifier, SellerCompletionVerifier, BuyerApprovalVerifier, AdminVerifier, } from "./providers/verifiers.js";
/**
 * Central Verification Manager
 * Responsible for:
 * - Managing verifier instances
 * - Routing requests to verifiers
 * - Collecting and aggregating verdicts
 * - Producing final verification result
 */
export class VerificationManager {
    verifiers = [];
    config;
    constructor(config = {}) {
        this.config = {
            verifiers: config.verifiers ?? this.getDefaultVerifierConfigs(),
            stopOnRequiredFailure: config.stopOnRequiredFailure ?? true,
            overallTimeoutMs: config.overallTimeoutMs ?? 60000,
        };
        this.initializeVerifiers();
    }
    /**
     * Get default verifier configurations
     */
    getDefaultVerifierConfigs() {
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
    initializeVerifiers() {
        this.verifiers = [];
        for (const verifierConfig of this.config.verifiers) {
            if (verifierConfig.enabled === false)
                continue;
            const verifier = this.createVerifier(verifierConfig);
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
    createVerifier(config) {
        // Map verifier IDs to concrete implementations
        switch (config.id) {
            case "safety-verifier":
                return new SafetyVerifier(config);
            case "terms-verifier":
                // Import dynamically to avoid circular deps
                return this.createTermsVerifier(config);
            case "reputation-verifier":
                return this.createReputationVerifier(config);
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
    createTermsVerifier(config) {
        // We'll instantiate it directly here since we're in the same package
        const { TermsVerifier } = require("./verifiers.js");
        return new TermsVerifier(config);
    }
    /**
     * Create ReputationVerifier
     */
    createReputationVerifier(config) {
        const { ReputationVerifier } = require("./verifiers.js");
        return new ReputationVerifier(config);
    }
    /**
     * Register a custom verifier instance
     * Useful for testing or adding verifiers at runtime
     */
    registerVerifier(verifier) {
        // Remove existing verifier with same ID if any
        this.verifiers = this.verifiers.filter((v) => v.id !== verifier.id);
        this.verifiers.push(verifier);
        // Re-sort by priority
        this.verifiers.sort((a, b) => (a.config.priority ?? 0) - (b.config.priority ?? 0));
    }
    /**
     * Unregister a verifier by ID
     */
    unregisterVerifier(verifierId) {
        this.verifiers = this.verifiers.filter((v) => v.id !== verifierId);
    }
    /**
     * Get all registered verifiers
     */
    getVerifiers() {
        return [...this.verifiers];
    }
    /**
     * Run the full verification process for a request
     */
    async verify(request) {
        const startedAt = new Date().toISOString();
        const verdicts = [];
        // Create a promise that rejects after overall timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Verification timed out after ${this.config.overallTimeoutMs}ms`)), this.config.overallTimeoutMs);
        });
        // Run all verifiers in parallel with individual timeouts
        const verificationPromise = this.runVerifiers(request, verdicts);
        try {
            await Promise.race([verificationPromise, timeoutPromise]);
        }
        catch (error) {
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
    async runVerifiers(request, verdicts) {
        const verifierPromises = this.verifiers.map(async (verifier) => {
            const verifierConfig = this.config.verifiers.find((vc) => vc.id === verifier.id);
            const timeoutMs = verifierConfig?.timeoutMs ?? 5000;
            try {
                // Create a timeout promise for this verifier
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Verifier ${verifier.name} timed out after ${timeoutMs}ms`)), timeoutMs);
                });
                const verdict = await Promise.race([verifier.verify(request), timeoutPromise]);
                verdicts.push(verdict);
                // Check if we should stop on required failure
                if (this.config.stopOnRequiredFailure && verdict.status === "rejected" && verifier.config.required) {
                    // We could cancel other verifiers here, but for simplicity we let them complete
                    // In a production system, you might want to use AbortController
                }
            }
            catch (error) {
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
    createErrorVerdict(request, error, verifierId = "unknown", verifierName = "Unknown Verifier") {
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
    aggregateStatus(verdicts) {
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
    static createRequestFromDeal(dealResult, context = {}) {
        return {
            requestId: `req_${crypto.randomUUID()}`,
            roomId: dealResult.roomId,
            transcriptHash: dealResult.transcriptHash,
            deal: dealResult.deal,
            context,
            createdAt: new Date().toISOString(),
        };
    }
    /**
     * Health check all verifiers
     */
    async healthCheck() {
        const results = {};
        for (const verifier of this.verifiers) {
            try {
                results[verifier.id] = await verifier.healthCheck?.() ?? true;
            }
            catch {
                results[verifier.id] = false;
            }
        }
        return results;
    }
}
/**
 * Default Verification Manager instance (singleton pattern for convenience)
 */
let defaultManager = null;
export function getVerificationManager(config) {
    if (!defaultManager) {
        defaultManager = new VerificationManager(config);
    }
    return defaultManager;
}
export function setVerificationManager(manager) {
    defaultManager = manager;
}
