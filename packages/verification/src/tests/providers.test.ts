/**
 * Tests for Verifier Providers
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MockVerifier, MockRejectingVerifier, MockErrorVerifier } from "../providers/base.js";
import {
  SafetyVerifier,
  TermsVerifier,
  ReputationVerifier,
  SellerCompletionVerifier,
  BuyerApprovalVerifier,
  AdminVerifier,
} from "../providers/verifiers.js";
import type { VerificationRequest } from "../types.js";

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

describe("MockVerifier", () => {
  it("should return verified verdict", async () => {
    const verifier = new MockVerifier();
    const request = createTestRequest();

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.verifierId).toBe("mock-verifier");
    expect(verdict.proof).toContain("mock-proof");
    expect(verdict.metadata?.mock).toBe(true);
  });

  it("should have correct config", () => {
    const verifier = new MockVerifier({ id: "custom-mock", name: "Custom Mock", priority: 5, required: true });
    expect(verifier.id).toBe("custom-mock");
    expect(verifier.name).toBe("Custom Mock");
    expect(verifier.config.priority).toBe(5);
    expect(verifier.config.required).toBe(true);
  });
});

describe("MockRejectingVerifier", () => {
  it("should return rejected verdict", async () => {
    const verifier = new MockRejectingVerifier({}, "Custom rejection reason");
    const request = createTestRequest();

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toBe("Custom rejection reason");
    expect(verdict.verifierId).toBe("mock-rejecting-verifier");
  });
});

describe("MockErrorVerifier", () => {
  it("should return error verdict", async () => {
    const verifier = new MockErrorVerifier();
    const request = createTestRequest();

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("error");
    expect(verdict.rejectionReason).toContain("Simulated error");
  });
});

describe("SafetyVerifier", () => {
  it("should verify deals within safety limits", async () => {
    const verifier = new SafetyVerifier();
    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 30 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.proof).toContain("safety-check-passed");
  });

  it("should reject deals exceeding maxSingleTrade", async () => {
    const verifier = new SafetyVerifier();
    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 500 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("maxSingleTrade");
  });

  it("should reject deals exceeding vaultBalance", async () => {
    const verifier = new SafetyVerifier({
      policy: { vaultBalance: 50, maxSingleTrade: 100, dailyBudget: 200, anomalyMultiplier: 10, normal: 50 },
    });
    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 100 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("vaultBalance");
  });

  it("should reject anomalous deals", async () => {
    const verifier = new SafetyVerifier({
      policy: { vaultBalance: 10000, maxSingleTrade: 1000, dailyBudget: 5000, anomalyMultiplier: 2, normal: 50 },
    });
    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 150 } }); // > 2*50 = 100

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("anomaly");
  });
});

describe("TermsVerifier", () => {
  it("should verify valid terms", async () => {
    const verifier = new TermsVerifier();
    const request = createTestRequest();

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
  });

  it("should reject disallowed resource types", async () => {
    const verifier = new TermsVerifier({ allowedResources: ["gpu", "storage"] });
    const request = createTestRequest({ context: { resource: "invalid-resource" } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("invalid-resource");
  });

  it("should reject excessive quantity", async () => {
    const verifier = new TermsVerifier({ maxQty: 10 });
    const request = createTestRequest({ deal: { ...createTestRequest().deal, qty: 100 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Quantity");
  });

  it("should reject excessive total USDC", async () => {
    const verifier = new TermsVerifier({ maxTotalUsdc: 100 });
    const request = createTestRequest({ deal: { ...createTestRequest().deal, totalUsdc: 500 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Total USDC");
  });

  it("should reject invalid unit price", async () => {
    const verifier = new TermsVerifier();
    const request = createTestRequest({ deal: { ...createTestRequest().deal, unitPrice: 0 } });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Invalid unit price");
  });
});

describe("ReputationVerifier", () => {
  it("should verify agents with sufficient reputation", async () => {
    const verifier = new ReputationVerifier({ minScore: 50, minDeals: 1 });
    const request = createTestRequest(); // agentId 1 and 2 have score 100, deals 5/3

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
  });

  it("should reject agents with insufficient score", async () => {
    const verifier = new ReputationVerifier({ minScore: 200, minDeals: 1 });
    const request = createTestRequest(); // agentId 1 and 2 have score 100

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("insufficient");
  });

  it("should reject agents with insufficient deals", async () => {
    const verifier = new ReputationVerifier({ minScore: 50, minDeals: 10 });
    const request = createTestRequest(); // agentId 1 has 5 deals, agentId 2 has 3

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("insufficient");
  });
});

describe("SellerCompletionVerifier", () => {
  const testRequestId = "test-req-seller-1";

  beforeEach(() => {
    SellerCompletionVerifier.clearCompletionState(testRequestId);
  });

  it("should reject when seller has not submitted completion", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: true });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Seller has not submitted completion");
    expect(verdict.metadata?.requiresAction).toBe("seller-submit");
  });

  it("should verify when seller submits completion with proof", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: true });
    const request = createTestRequest({ requestId: testRequestId });

    SellerCompletionVerifier.submitCompletion(testRequestId, request.deal.seller.agentId, "delivery-hash-123", "Work completed");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.proof).toBe("delivery-hash-123");
    expect(verdict.metadata?.sellerNotes).toBe("Work completed");
  });

  it("should reject when wrong seller submits completion", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: true });
    const request = createTestRequest({ requestId: testRequestId });

    SellerCompletionVerifier.submitCompletion(testRequestId, "wrong-seller-id", "delivery-hash-123");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("wrong seller");
  });

  it("should reject when proof is required but not provided", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: true });
    const request = createTestRequest({ requestId: testRequestId });

    SellerCompletionVerifier.submitCompletion(testRequestId, request.deal.seller.agentId, "");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Proof of completion is required");
  });

  it("should verify without proof when requireProof is false", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: false });
    const request = createTestRequest({ requestId: testRequestId });

    SellerCompletionVerifier.submitCompletion(testRequestId, request.deal.seller.agentId, "");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
  });

  it("should reject when completion has expired", async () => {
    const verifier = new SellerCompletionVerifier({ requireProof: true, completionTimeoutMs: 100 });
    const request = createTestRequest({ requestId: testRequestId });

    SellerCompletionVerifier.submitCompletion(testRequestId, request.deal.seller.agentId, "delivery-hash-123");

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("expired");
  });
});

describe("BuyerApprovalVerifier", () => {
  const testRequestId = "test-req-buyer-1";

  beforeEach(() => {
    BuyerApprovalVerifier.clearApprovalState(testRequestId);
  });

  it("should reject when buyer has not submitted decision", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: false });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("Buyer has not submitted approval decision");
    expect(verdict.metadata?.requiresAction).toBe("buyer-decide");
  });

  it("should verify when buyer approves", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: false });
    const request = createTestRequest({ requestId: testRequestId });

    BuyerApprovalVerifier.submitDecision(testRequestId, request.deal.buyer.agentId, "approve", undefined, "Delivery looks good");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.proof).toContain("buyer-approved");
    expect(verdict.metadata?.decision).toBe("approve");
    expect(verdict.metadata?.buyerNotes).toBe("Delivery looks good");
  });

  it("should reject when buyer rejects with reason", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: false });
    const request = createTestRequest({ requestId: testRequestId });

    BuyerApprovalVerifier.submitDecision(testRequestId, request.deal.buyer.agentId, "reject", "Quality not as expected", "Will renegotiate");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toBe("Quality not as expected");
    expect(verdict.metadata?.decision).toBe("reject");
  });

  it("should reject when wrong buyer submits decision", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: false });
    const request = createTestRequest({ requestId: testRequestId });

    BuyerApprovalVerifier.submitDecision(testRequestId, "wrong-buyer-id", "approve");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("wrong buyer");
  });

  it("should throw when rejecting without reason", () => {
    expect(() => {
      BuyerApprovalVerifier.submitDecision(testRequestId, "buyer-1", "reject");
    }).toThrow("Rejection reason is required when decision is 'reject'");
  });

  it("should auto-approve after timeout when configured", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: true, approvalTimeoutMs: 100 });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.metadata?.autoApproved).toBe(true);
  });

  it("should reject when approval decision has expired", async () => {
    const verifier = new BuyerApprovalVerifier({ autoApproveAfterTimeout: false, approvalTimeoutMs: 100 });
    const request = createTestRequest({ requestId: testRequestId });

    BuyerApprovalVerifier.submitDecision(testRequestId, request.deal.buyer.agentId, "approve");

    await new Promise((resolve) => setTimeout(resolve, 150));

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toContain("expired");
  });
});

describe("AdminVerifier", () => {
  const testRequestId = "test-req-admin-1";

  beforeEach(() => {
    AdminVerifier.clearOverride(testRequestId);
  });

  it("should use default decision when no override applied", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "verified" });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.metadata?.defaultDecision).toBe(true);
  });

  it("should use default rejection when configured", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "rejected", defaultRejectionReason: "Admin default reject" });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toBe("Admin default reject");
  });

  it("should use default error when configured", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "error", defaultRejectionReason: "Admin default error" });
    const request = createTestRequest({ requestId: testRequestId });

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("error");
    expect(verdict.rejectionReason).toBe("Admin default error");
  });

  it("should verify when admin overrides to verified", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "rejected" });
    const request = createTestRequest({ requestId: testRequestId });

    AdminVerifier.applyOverride(testRequestId, "admin-1", "verified", undefined, "Forced verify for demo");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
    expect(verdict.metadata?.adminNotes).toBe("Forced verify for demo");
  });

  it("should reject when admin overrides to rejected", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "verified" });
    const request = createTestRequest({ requestId: testRequestId });

    AdminVerifier.applyOverride(testRequestId, "admin-1", "rejected", "Admin says no", "Emergency stop");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toBe("Admin says no");
  });

  it("should error when admin overrides to error", async () => {
    const verifier = new AdminVerifier({ defaultDecision: "verified" });
    const request = createTestRequest({ requestId: testRequestId });

    AdminVerifier.applyOverride(testRequestId, "admin-1", "error", "System error", "Critical issue");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("error");
    expect(verdict.rejectionReason).toBe("System error");
  });

  it("should reject unauthorized admin when allowedAdminIds configured", async () => {
    const verifier = new AdminVerifier({ allowedAdminIds: ["admin-1", "admin-2"] });
    const request = createTestRequest({ requestId: testRequestId });

    AdminVerifier.applyOverride(testRequestId, "unauthorized-admin", "verified");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("error");
    expect(verdict.rejectionReason).toContain("not authorized");
  });

  it("should allow authorized admin when allowedAdminIds configured", async () => {
    const verifier = new AdminVerifier({ allowedAdminIds: ["admin-1"] });
    const request = createTestRequest({ requestId: testRequestId });

    AdminVerifier.applyOverride(testRequestId, "admin-1", "verified");

    const verdict = await verifier.verify(request);

    expect(verdict.status).toBe("verified");
  });

  it("should throw when rejecting without reason", () => {
    expect(() => {
      AdminVerifier.applyOverride(testRequestId, "admin-1", "rejected");
    }).toThrow("Rejection reason is required when decision is 'rejected'");
  });
});