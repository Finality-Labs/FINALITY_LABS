import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "../index.js";
import { VerificationManager, MockVerifier } from "@finality/verification";
import { setVerificationManagerInstance } from "../settle.js";

const PORT = 3099; // dedicated test port to avoid clashing with :3002 dev
const DEALS_PORT = 3098;

function waitFor(ws: WebSocket, predicate: (m: any) => boolean, timeout = 2000): Promise<any> {
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

describe("negotiate server (integration)", () => {
  let wss: any;
  let dealsServer: any;
  let lastDeal: any = null;

  beforeAll(async () => {
    // Configure test-specific verification manager with mock verifier that always passes
    const testVerificationManager = new VerificationManager({
      verifiers: [
        {
          id: "mock-verifier",
          name: "Mock Verifier",
          enabled: true,
          priority: 1,
          required: false,
          timeoutMs: 5000,
        },
      ],
      stopOnRequiredFailure: true,
      overallTimeoutMs: 10000,
    });
    testVerificationManager.registerVerifier(new MockVerifier({ id: "mock-verifier", name: "Mock Verifier" }));
    setVerificationManagerInstance(testVerificationManager);

    // Start deals server first
    const http = await import("node:http");
    dealsServer = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/deals") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          lastDeal = JSON.parse(body);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      dealsServer.listen(DEALS_PORT, "127.0.0.1", () => {
        console.log(`[test] dealsServer listening on 127.0.0.1:${DEALS_PORT}`);
        resolve();
      });
      dealsServer.on("error", reject);
    });
    
    // Extra delay to ensure server is fully ready
    await new Promise((r) => setTimeout(r, 1000));
    
    process.env.DEALS_URL = `http://127.0.0.1:${DEALS_PORT}/deals`;
    wss = startServer(PORT);
  });

  beforeEach(() => {
    lastDeal = null;
  });

  afterAll(async () => {
    wss?.close();
    await new Promise<void>((r) => dealsServer?.close(() => r()));
  });

  it("rejects a 3rd connection to a room", async () => {
    const b = await connect("room_integ_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_integ_1", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));
    // third connection (another buyer) should be rejected on join
    const third = await connect("room_integ_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "3",
      wallet: "0xTHIRD",
      maxUnitPrice: 20,
    });
    const err = await waitFor(third, (m) => m.kind === "error");
    expect(err.message).toMatch(/full|role/);
    b.close();
    s.close();
    third.close();
  });

  it("full two-client run produces deal-closed + a hash + POST to Part 3", async () => {
    const b = await connect("room_integ_2", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_integ_2", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    // let both joins land so the room is full and the turn is set
    await new Promise((r) => setTimeout(r, 100));

    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 5, terms: "per-hour" }, ts: 1 }));
    // seller accepts buyer's 20? seller floor 18 so 20 is fine
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 2 }));

    const closed = await waitFor(b, (m) => m.kind === "deal-closed");
    expect(closed.deal.unitPrice).toBe(20);
    expect(closed.transcriptHash).toMatch(/^0x[0-9a-f]{64}$/);

    // give the server time to POST to the stub
    await new Promise((r) => setTimeout(r, 500));
    // Poll for lastDeal with retries
    let attempts = 0;
    while (!lastDeal && attempts < 20) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    expect(lastDeal).toBeTruthy();
    expect(lastDeal.roomId).toBe("room_integ_2");
    expect(lastDeal.transcriptHash).toBe(closed.transcriptHash);
    expect(lastDeal.unitPrice).toBe(20);
    expect(lastDeal.totalUsdc).toBe(100);

    b.close();
    s.close();
  });

  it("second participant joins: buyer-first then seller-first both reach 'room ready'", async () => {
    // buyer opens the room, seller joins second
    const b1 = await connect("room_order_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const b1ready = waitFor(b1, (m) => m.message?.includes("room ready"));
    await new Promise((r) => setTimeout(r, 100));
    const s1 = await connect("room_order_1", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    const s1ready = waitFor(s1, (m) => m.message?.includes("room ready"));
    await expect(b1ready).resolves.toBeTruthy();
    await expect(s1ready).resolves.toBeTruthy();
    b1.close();
    s1.close();

    // seller opens the room, buyer joins second
    const s2 = await connect("room_order_2", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));
    const b2 = await connect("room_order_2", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const b2ready = waitFor(b2, (m) => m.message?.includes("room ready"));
    const s2ready = waitFor(s2, (m) => m.message?.includes("room ready"));
    await expect(b2ready).resolves.toBeTruthy();
    await expect(s2ready).resolves.toBeTruthy();
    b2.close();
    s2.close();
  });

  it("disconnect releases the role slot: remaining party sees '<role> left', rejoin works, duplicate still rejected", async () => {
    const b1 = await connect("room_reconnect_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_reconnect_1", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));

    // buyer drops; seller is notified
    const leftSeen = waitFor(s, (m) => m.message === "buyer left");
    b1.close();
    await expect(leftSeen).resolves.toBeTruthy();

    // buyer reconnects with the same role → room is ready again
    const b2 = await connect("room_reconnect_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const readySeen = waitFor(b2, (m) => m.message?.includes("room ready"));
    await expect(readySeen).resolves.toBeTruthy();

    // slot is occupied again → a second concurrent buyer is still rejected
    const b3 = await connect("room_reconnect_1", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "3",
      wallet: "0xTHIRD",
      maxUnitPrice: 20,
    });
    const err = await waitFor(b3, (m) => m.kind === "error");
    expect(err.message).toMatch(/full|role/);

    b2.close();
    s.close();
    b3.close();
  });

  it("mid-negotiation disconnect clears the turn; seller cannot move until buyer rejoins", async () => {
    const b = await connect("room_reconnect_2", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_reconnect_2", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));

    // buyer moves → turn passes to seller
    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 5, terms: "per-hour" }, ts: 1 }));
    await new Promise((r) => setTimeout(r, 100));

    // buyer drops mid-negotiation
    const leftSeen = waitFor(s, (m) => m.message === "buyer left");
    b.close();
    await expect(leftSeen).resolves.toBeTruthy();

    // seller tries to move while waiting → not their turn yet
    s.send(JSON.stringify({ type: "counteroffer", from: "seller", round: 2, payload: { unitPrice: 19, qty: 5, terms: "per-hour" }, ts: 2 }));
    const err = await waitFor(s, (m) => m.kind === "error");
    expect(err.message).toMatch(/turn/i);

    // buyer rejoins → ready again → negotiation can continue
    const b2 = await connect("room_reconnect_2", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const readySeen = waitFor(b2, (m) => m.message?.includes("room ready"));
    await expect(readySeen).resolves.toBeTruthy();

    b2.close();
    s.close();
  });

  it("connection role is authoritative: spoofed envelope.from is rejected", async () => {
    const b = await connect("room_turn_auth", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_turn_auth", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));

    // buyer moves → turn is seller
    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 5, terms: "per-hour" }, ts: 1 }));
    await new Promise((r) => setTimeout(r, 100));

    // the buyer socket spoofing from:"seller" is rejected — the server trusts the
    // AUTHENTICATED connection role (buyer), never the frame's from field
    const spoofErr = waitFor(b, (m) => m.kind === "error");
    b.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 2 }));
    const spoof = await spoofErr;
    expect(spoof.message).toMatch(/you are buyer/);

    // the seller socket (its authenticated role IS seller) can act → deal closes
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 3 }));
    const closed = await waitFor(b, (m) => m.kind === "deal-closed");
    expect(closed.deal.unitPrice).toBe(20);

    b.close();
    s.close();
  });

  it("out-of-turn action from the wire is rejected without corrupting the turn", async () => {
    const b = await connect("room_turn_ooot", "buyer", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "1",
      wallet: "0xBUYER",
      maxUnitPrice: 20,
    });
    const s = await connect("room_turn_ooot", "seller", {
      agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
      agentId: "2",
      wallet: "0xSELLER",
      floorUnitPrice: 18,
    });
    await new Promise((r) => setTimeout(r, 100));

    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 1, payload: { unitPrice: 20, qty: 5, terms: "per-hour" }, ts: 1 }));
    await new Promise((r) => setTimeout(r, 100));

    // buyer moves again while it is the seller's turn → rejected, turn intact
    const errP = waitFor(b, (m) => m.kind === "error");
    b.send(JSON.stringify({ type: "counteroffer", from: "buyer", round: 2, payload: { unitPrice: 19, qty: 5, terms: "per-hour" }, ts: 2 }));
    const err = await errP;
    expect(err.message).toMatch(/out of turn \(expected seller\)/);

    // the seller can still respond on the preserved turn → deal closes
    s.send(JSON.stringify({ type: "accept", from: "seller", round: 2, ts: 3 }));
    const closed = await waitFor(b, (m) => m.kind === "deal-closed");
    expect(closed).toBeTruthy();

    b.close();
    s.close();
  });
});
