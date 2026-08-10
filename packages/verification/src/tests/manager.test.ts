/**
 * Tests for Verification Manager
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VerificationManager } from "../manager.js";
import { MockVerifier, MockRejectingVerifier, MockErrorVerifier } from "../providers/base.js";
import { SafetyVerifier, TermsVerifier } from "../providers/verifiers.js";
import type { VerificationRequest, VerifierConfig } from "../types.js";

function createTestRequest(overrides: Partial<VerificationRequest> = {}): VerificationRequest {
  return {
    requestId: `req_${crypto.randomUUID()}`,
    roomId: "room_abc",
    transcriptHash: "0xabc123",
    deal: {
      buyer: {
        agentRegistry: "eip155:84532:0x8004...",
        agentId: "1",
        wallet: "0xBUYER",
      },
      seller: {
        agentRegistry: "eip155:84532:0x8004...",
        agentId: "2",
        wallet: "0xSELLER",
      },
      unitPrice: 18,
      qty: 5,
      terms: "per-hour billing",
      totalUsdc: 90,
    },
    context: { resource: "gpu" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("VerificationManager", () => {
  let manager: VerificationManager;

  beforeEach(() => {
    manager = new VerificationManager({
      verifiers: [
        { id: "mock-1", name: "Mock 1", enabled: true, priority: 10, required: false, timeoutMs: 5000 },
        { id: "mock-2", name: "Mock 2", enabled: true, priority: 20, required: false, timeoutMs: 5000 },
      ],
    });

    // Register mock verifiers with matching priorities
    manager.registerVerifier(new MockVerifier({ id: "mock-1", name: "Mock 1", priority: 10 }));
    manager.registerVerifier(new MockVerifier({ id: "mock-2", name: "Mock 2", priority: 20 }));
  });

  it("should verify successfully with all passing verifiers", async () => {
    const request = createTestRequest();

    const result = await manager.verify(request);

    expect(result.passed).toBe(true);
    expect(result.finalStatus).toBe("verified");
    expect(result.verdicts).toHaveLength(2);
    expect(result.verdicts.every((v) => v.status === "verified")).toBe(true);
  });

  it("should reject when a verifier rejects", async () => {
    // Replace one verifier with a rejecting one
    manager.unregisterVerifier("mock-2");
    manager.registerVerifier(new MockRejectingVerifier({ id: "mock-2", name: "Mock 2" }, "Test rejection"));

    const request = createTestRequest();
    const result = await manager.verify(request);

    expect(result.passed).toBe(false);
    expect(result.finalStatus).toBe("rejected");
    expect(result.verdicts.some((v) => v.status === "rejected")).toBe(true);
  });

  it("should error when a verifier errors", async () => {
    manager.unregisterVerifier("mock-2");
    manager.registerVerifier(new MockErrorVerifier({ id: "mock-2", name: "Mock 2" }));

    const request = createTestRequest();
    const result = await manager.verify(request);

    expect(result.passed).toBe(false);
    expect(result.finalStatus).toBe("error");
    expect(result.verdicts.some((v) => v.status === "error")).toBe(true);
  });

  it("should stop on required failure when configured", async () => {
    const stopManager = new VerificationManager({
      verifiers: [
        { id: "req-mock", name: "Required Mock", enabled: true, priority: 10, required: true, timeoutMs: 5000 },
        { id: "opt-mock", name: "Optional Mock", enabled: true, priority: 20, required: false, timeoutMs: 5000 },
      ],
      stopOnRequiredFailure: true,
    });

    stopManager.registerVerifier(new MockRejectingVerifier({ id: "req-mock", name: "Required Mock" }, "Required failed"));
    stopManager.registerVerifier(new MockVerifier({ id: "opt-mock", name: "Optional Mock" }));

    const request = createTestRequest();
    const result = await stopManager.verify(request);

    expect(result.passed).toBe(false);
    expect(result.finalStatus).toBe("rejected");
  });

  it("should create request from deal result", () => {
    const dealResult = {
      roomId: "room_xyz",
      transcriptHash: "0xhash123",
      deal: {
        buyer: { agentRegistry: "eip155:84532:0x8004...", agentId: "1", wallet: "0xBUYER" },
        seller: { agentRegistry: "eip155:84532:0x8004...", agentId: "2", wallet: "0xSELLER" },
        unitPrice: 20,
        qty: 3,
        terms: "test terms",
        totalUsdc: 60,
      },
    };

    const request = VerificationManager.createRequestFromDeal(dealResult, { resource: "gpu" });

    expect(request.roomId).toBe("room_xyz");
    expect(request.transcriptHash).toBe("0xhash123");
    expect(request.deal.totalUsdc).toBe(60);
    expect(request.context?.resource).toBe("gpu");
    expect(request.requestId).toContain("req_");
    expect(request.createdAt).toBeDefined();
  });

  it("should return all registered verifiers", () => {
    const verifiers = manager.getVerifiers();
    expect(verifiers).toHaveLength(2);
    expect(verifiers.map((v) => v.id).sort()).toEqual(["mock-1", "mock-2"]);
  });

  it("should unregister verifier", () => {
    manager.unregisterVerifier("mock-1");
    const verifiers = manager.getVerifiers();
    expect(verifiers).toHaveLength(1);
    expect(verifiers[0].id).toBe("mock-2");
  });

  it("should register verifier at correct priority position", () => {
    manager.registerVerifier(new MockVerifier({ id: "mock-3", name: "Mock 3", priority: 5 }));

    const verifiers = manager.getVerifiers();
    expect(verifiers).toHaveLength(3);
    // Should be sorted by priority: mock-3 (5), mock-1 (10), mock-2 (20)
    expect(verifiers.map((v) => v.id)).toEqual(["mock-3", "mock-1", "mock-2"]);
  });
});

describe("VerificationManager with real verifiers", () => {
  it("should run SafetyVerifier and TermsVerifier", async () => {
    const manager = new VerificationManager({
      verifiers: [
        { id: "safety", name: "Safety", enabled: true, priority: 10, required: true, timeoutMs: 5000 },
        { id: "terms", name: "Terms", enabled: true, priority: 20, required: false, timeoutMs: 5000 },
      ],
    });

    manager.registerVerifier(new SafetyVerifier({ id: "safety", name: "Safety" }));
    manager.registerVerifier(new TermsVerifier({ id: "terms", name: "Terms" }));

    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 30 } });
    const result = await manager.verify(request);

    expect(result.passed).toBe(true);
    expect(result.finalStatus).toBe("verified");
    expect(result.verdicts).toHaveLength(2);
  });

  it("should reject via SafetyVerifier for large deals", async () => {
    const manager = new VerificationManager({
      verifiers: [
        { id: "safety", name: "Safety", enabled: true, priority: 10, required: true, timeoutMs: 5000 },
      ],
    });

    manager.registerVerifier(new SafetyVerifier({ id: "safety", name: "Safety" }));

    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 500 } });
    const result = await manager.verify(request);

    expect(result.passed).toBe(false);
    expect(result.finalStatus).toBe("rejected");
    expect(result.verdicts[0].rejectionReason).toContain("maxSingleTrade");
  });

  it("should reject via TermsVerifier for disallowed resource", async () => {
    const manager = new VerificationManager({
      verifiers: [
        { id: "terms", name: "Terms", enabled: true, priority: 10, required: true, timeoutMs: 5000 },
      ],
    });

    manager.registerVerifier(new TermsVerifier({ id: "terms", name: "Terms", allowedResources: ["storage"] }));

    const request = createTestRequest({ context: { resource: "gpu" } });
    const result = await manager.verify(request);

    expect(result.passed).toBe(false);
    expect(result.finalStatus).toBe("rejected");
    expect(result.verdicts[0].rejectionReason).toContain("gpu");
  });
});

describe("VerificationManager health check", () => {
  it("should return health status for all verifiers", async () => {
    const manager = new VerificationManager({
      verifiers: [
        { id: "mock-1", name: "Mock 1", enabled: true, priority: 10, required: false, timeoutMs: 5000 },
        { id: "mock-2", name: "Mock 2", enabled: true, priority: 20, required: false, timeoutMs: 5000 },
      ],
    });

    manager.registerVerifier(new MockVerifier({ id: "mock-1", name: "Mock 1" }));
    manager.registerVerifier(new MockVerifier({ id: "mock-2", name: "Mock 2" }));

    const health = await manager.healthCheck();

    expect(health["mock-1"]).toBe(true);
    expect(health["mock-2"]).toBe(true);
  });
});