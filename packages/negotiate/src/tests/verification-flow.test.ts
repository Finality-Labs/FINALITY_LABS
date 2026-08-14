import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../index.js";
import { getLastSettlement } from "../settle.js";

/**
 * Deal Closed → Verification → Approval Workflow → Settlement.
 *
 * Uses the REAL VerificationManager (no mock verifier injection), so the
 * verification result is the genuine output of the existing verification
 * layer: safety / terms / reputation / seller-completion / buyer-approval.
 *
 * The default workflow requires seller completion + buyer approval. On
 * deal-close the immediate outcome is REJECTED/blocked with the real failure
 * reason — that is exactly what the UI must display. The action endpoints
 * then let the seller submit completion and the buyer approve, and the deal
 * is pushed to settlement ONLY once verification actually passes.
 */

const PORT = 3097; // dedicated test port to avoid clashing with :3002 dev / other tests
const HTTP = `http://localhost:${PORT}`;
const REGISTRY = "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e";

function waitFor(ws: WebSocket, predicate: (m: any) => boolean, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout waiting for frame")), timeout);
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (predicate(m)) {
        clearTimeout(t);
        resolve(m);
      }
    });
  });
}

function connect(roomId: string, role: "buyer" | "seller", identity: any): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/negotiate/${roomId}`);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join", role, identity }));
      resolve(ws);
    });
    ws.on("error", reject);
  });
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${HTTP}${path}`);
  return { status: res.status, body: await res.json() };
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${HTTP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function waitForRecord(roomId: string, timeout = 15000): Promise<any> {
  const deadline = Date.now() + timeout;
  let last: any = null;
  while (Date.now() < deadline) {
    const { status, body } = await fetchJson(`/settlements/${roomId}`);
    last = { status, body };
    if (status === 200 && body.verification) return body;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no verification record after ${timeout}ms: ${JSON.stringify(last)}`);
}

function reasons(record: any): string[] {
  return record.verification.verdicts
    .filter((v: any) => v.rejectionReason)
    .map((v: any) => v.rejectionReason as string);
}

describe("deal-closed → real verification → served over HTTP", () => {
  let wss: any;

  beforeAll(async () => {
    wss = startServer(PORT);
    await new Promise((r) => setTimeout(r, 300));
  });

  afterAll(async () => {
    wss?.close();
  });

  it("produces a real verification result for a closed deal and serves the record", async () => {
    const roomId = "room_verify_1";
    const b = await connect(roomId, "buyer", {
      agentRegistry: REGISTRY,
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect(roomId, "seller", {
      agentRegistry: REGISTRY,
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));

    // unitPrice 20 × qty 2 = 40 USDC → inside the safety transformer cap (50),
    // so the real rejection below comes from the approval workflow verifiers.
    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 2, terms: "per-hour" }, ts: 1 }));
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 2 }));

    const closed = await waitFor(b, (m) => m.kind === "deal-closed");
    expect(closed.deal.unitPrice).toBe(20);
    expect(closed.transcriptHash).toMatch(/^0x[0-9a-f]{64}$/);

    // Poll the HTTP read endpoint until verification has completed.
    const record = await waitForRecord(roomId);

    // 1. Real deal data preserved (buyer/seller agent IDs, price, qty, terms, total, hash).
    expect(record.deal).toEqual(closed.deal);
    expect(record.deal.buyer.agentId).toBe("1");
    expect(record.deal.seller.agentId).toBe("2");
    expect(record.deal.unitPrice).toBe(20);
    expect(record.deal.qty).toBe(2);
    expect(record.deal.terms).toBe("per-hour");
    expect(record.deal.totalUsdc).toBe(40);
    expect(record.transcriptHash).toBe(closed.transcriptHash);

    // 2. Real verification result present.
    expect(record.verification).toBeTruthy();
    expect(record.verification.requestId).toMatch(/^req_/);
    expect(record.verification.startedAt).toBeTruthy();
    expect(record.verification.completedAt).toBeTruthy();
    expect(record.verification.verdicts.length).toBeGreaterThan(0);

    // 3. Default workflow (seller completion + buyer approval) is pending, so the
    //    real outcome is REJECTED with a real reason — never a fabricated pass.
    expect(record.verification.passed).toBe(false);
    expect(record.verification.status).toBe("rejected");
    expect(reasons(record).join("; ")).toMatch(/Seller has not submitted completion yet/);
    expect(record.settlementBlocked).toBe(true);

    b.close();
    s.close();
  });

  it("returns 404 for an unknown room and [] for the list endpoint", async () => {
    const missing = await fetchJson("/settlements/room_does_not_exist");
    expect(missing.status).toBe(404);

    const list = await fetchJson("/settlements");
    expect(Array.isArray(list.body)).toBe(true);
    // The verified room above must be present.
    expect(list.body.some((r: any) => r.roomId === "room_verify_1")).toBe(true);
  });

  it("exposes the in-memory record via getLastSettlement", () => {
    const rec = getLastSettlement("room_verify_1");
    expect(rec).toBeTruthy();
    expect(rec!.verification?.status).toBe("rejected");
  });

  it("full approval flow: resource propagated → seller completion → buyer approval → verified + settlement proceeds", async () => {
    const roomId = "room_verify_full";
    const b = await connect(roomId, "buyer", {
      agentRegistry: REGISTRY,
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
      resource: "gpu",
    });
    const s = await connect(roomId, "seller", {
      agentRegistry: REGISTRY,
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
      resource: "gpu",
    });
    await new Promise((r) => setTimeout(r, 100));

    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 2, terms: "per-hour" }, ts: 1 }));
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 2 }));

    // The declared resource type must survive join → deal → verification.
    const closed = await waitFor(b, (m) => m.kind === "deal-closed");
    expect(closed.deal.resource).toBe("gpu");

    // Initial run: resource validated, only the approval actions are missing.
    let record = await waitForRecord(roomId);
    expect(record.deal.resource).toBe("gpu");
    expect(record.verification.requestId).toBe(`req_${roomId}`); // stable per room
    expect(record.verification.passed).toBe(false);
    const reasons0 = reasons(record);
    expect(reasons0.join("; ")).not.toMatch(/unknown/);
    expect(reasons0.join("; ")).toMatch(/Seller has not submitted completion yet/);
    expect(record.settlementBlocked).toBe(true);

    // Seller submits completion → seller verifier flips to verified, buyer still pending.
    const afterSeller = await postJson(`/verifications/req_${roomId}/seller-complete`, {
      requestId: `req_${roomId}`,
      sellerAgentId: "2",
      proof: "tx-proof-123",
      notes: "delivered",
    });
    expect(afterSeller.status).toBe(200);
    record = afterSeller.body.record;
    expect(record.verification.passed).toBe(false);
    const sellerVerdict = record.verification.verdicts.find((v: any) => v.verifierId === "seller-completion-verifier");
    expect(sellerVerdict.status).toBe("verified");
    expect(sellerVerdict.proof).toBe("tx-proof-123");

    // Buyer approves → verification passes → settlement proceeds (attempted).
    const afterBuyer = await postJson(`/verifications/req_${roomId}/buyer-decision`, {
      requestId: `req_${roomId}`,
      buyerAgentId: "1",
      decision: "approve",
      notes: "all good",
    });
    expect(afterBuyer.status).toBe(200);
    record = afterBuyer.body.record;
    expect(record.verification.passed).toBe(true);
    expect(record.verification.status).toBe("verified");
    expect(record.verification.finalStatus).toBe("verified");
    expect(record.settlementBlocked).toBe(false);
    // Part 3 (chain :3003) is not running in this test → the settlement POST is
    // attempted but unreachable; passing verification is what unblocks settlement.
    expect(record.response.ok).toBe(false);
    expect(record.response.status).toBe(0);
    const buyerVerdict = record.verification.verdicts.find((v: any) => v.verifierId === "buyer-approval-verifier");
    expect(buyerVerdict.status).toBe("verified");

    // Duplicate action must not double-settle or flip the outcome.
    const dup = await postJson(`/verifications/req_${roomId}/buyer-decision`, {
      requestId: `req_${roomId}`,
      buyerAgentId: "1",
      decision: "approve",
    });
    expect(dup.status).toBe(200);
    expect(dup.body.record.verification.passed).toBe(true);
    expect(dup.body.record.settlementBlocked).toBe(false);

    b.close();
    s.close();
  });

  it("rejects action submissions by the wrong party", async () => {
    const roomId = "room_verify_wrong";
    const b = await connect(roomId, "buyer", {
      agentRegistry: REGISTRY,
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
      resource: "gpu",
    });
    const s = await connect(roomId, "seller", {
      agentRegistry: REGISTRY,
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
      resource: "gpu",
    });
    await new Promise((r) => setTimeout(r, 100));
    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 2, terms: "per-hour" }, ts: 1 }));
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 2 }));
    await waitForRecord(roomId);

    // Completion submitted under the BUYER's agentId → verifier mismatch, no pass.
    const res = await postJson(`/verifications/req_${roomId}/seller-complete`, {
      requestId: `req_${roomId}`,
      sellerAgentId: "1",
      proof: "fake-proof",
    });
    expect(res.status).toBe(200);
    const record = res.body.record;
    expect(record.verification.passed).toBe(false);
    const verdict = record.verification.verdicts.find((v: any) => v.verifierId === "seller-completion-verifier");
    expect(verdict.status).toBe("rejected");
    expect(verdict.rejectionReason).toMatch(/wrong seller/);

    // Unknown requestId → 404.
    const missing = await postJson("/verifications/req_room_never_existed/seller-complete", {
      requestId: "req_room_never_existed",
      sellerAgentId: "2",
      proof: "x",
    });
    expect(missing.status).toBe(404);

    b.close();
    s.close();
  });
});
