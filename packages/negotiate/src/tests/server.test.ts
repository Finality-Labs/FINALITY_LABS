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
});
