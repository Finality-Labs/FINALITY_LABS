/**
 * Finality — UI control panel server.
 *
 * Boots the whole merged system (intake:3001, negotiate:3002, chain:3003) and
 * serves a browser dashboard on :3000 from which a human can:
 *   - post a buyer intent + seller offer to intake,
 *   - watch them match into a WS negotiation room,
 *   - run both reference agents to a deal-close,
 *   - see chain settlement + ERC-8004 reputation.
 *
 * The negotiation client (reference-agent) is a Node WebSocket client, so the
 * deal is driven server-side here and the result is returned to the browser as
 * JSON. The static page only collects parameters and renders the outcome.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startSystem, type RunningSystem } from "./start-all.js";
import { runAgent, type AgentDeps } from "../../negotiate-brain/src/agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_PORT = Number(process.env.UI_PORT ?? 3000);
const REG =
  "eip155:48816:0x54B8d8E2455946f2A5B8982283f2359812e815ce";

const CHAIN = "http://localhost:3003";

const AGENT_URI =
  process.env.GOAT_AGENT_URI ??
  "https://finality.example/agent.json";
const buyerWalletDefault = process.env.GOAT_BUYER_WALLET ?? "0x1111111111111111111111111111111111111111";
const sellerWalletDefault = process.env.GOAT_SELLER_WALLET ?? "0x2222222222222222222222222222222222222222";

// A demo-safe alphanumeric wallet (intake's regex rejects underscores).
function demoWallet(prefix: string): string {
  return `0x${prefix}${Math.random().toString(16).slice(2, 10)}${"0".repeat(24)}`.slice(0, 42);
}

interface DealRequest {
  resource: string;
  qty: number;
  buyerMax: number;   // buyer ceiling per unit
  sellerFloor: number; // seller floor per unit
  gpu?: string;
  buyerWallet?: string;
  sellerWallet?: string;
  buyerTimeoutMs?: number;
  sellerTimeoutMs?: number;
  forceDeterministic?: boolean;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Run the whole intent -> match -> negotiate -> settle -> reputation loop. */
async function runDeal(req: DealRequest) {
  const log: string[] = [];

  // Check if chain is in live mode
  const chainModeRes = await fetch(`${CHAIN}/mode`);
  const chainMode = chainModeRes.ok ? await chainModeRes.json() : { mode: "mock" };
  const isLive = chainMode.mode === "live";

  let buyerReg: { agentId: string; txHash?: string } = { agentId: "1" };
  let sellerReg: { agentId: string; txHash?: string } = { agentId: "2" };

  if (isLive) {
    // Live mode: register on ERC-8004 Identity Registry
    buyerReg = await postJson(`${CHAIN}/register`, { agentURI: `${AGENT_URI}#buyer` });
    sellerReg = await postJson(`${CHAIN}/register`, { agentURI: `${AGENT_URI}#seller` });
    log.push(`ERC-8004 buyer registered: #${buyerReg.agentId}`);
    log.push(`ERC-8004 seller registered: #${sellerReg.agentId}`);
  } else {
    // Mock mode: use deterministic agent IDs (matches run-e2e.ts)
    log.push(`Mock mode: using deterministic agent IDs buyer=#${buyerReg.agentId}, seller=#${sellerReg.agentId}`);
  }

  const buyerIdentity = {
    agentRegistry: REG,
    agentId: String(buyerReg.agentId),
    wallet: req.buyerWallet ?? buyerWalletDefault,
  };

  const sellerIdentity = {
    agentRegistry: REG,
    agentId: String(sellerReg.agentId),
    wallet: req.sellerWallet ?? sellerWalletDefault,
  };
  const requirements = req.gpu ? { gpu: req.gpu } : {};

  const intent = await postJson("http://localhost:3001/intents", {
    resource: req.resource, qty: req.qty, unit: "hour", maxUnitPrice: req.buyerMax,
    requirements, ...buyerIdentity,
  });
  log.push(`Buyer intent posted: ${intent.intentId}`);

  const offer = await postJson("http://localhost:3001/offers", {
    resource: req.resource, unit: "hour", unitPrice: req.sellerFloor, terms: "per-hour billing",
    requirements, ...sellerIdentity,
  });
  log.push(`Seller offer posted: ${offer.offerId}`);

  const match = intent.matched ? intent : offer.matched ? offer : null;
  if (!match || !match.matched) {
    log.push("No match — buyer max is below seller floor, or resource/requirements differ.");
    return { matched: false, log, fallback: { kind: "no-match", message: "Adjust the input terms and rerun." } };
  }
  log.push(`MATCHED -> room ${match.roomId}`);

  if (req.forceDeterministic) {
    process.env.OPENROUTER_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
  }

  const buyerDeps: AgentDeps = {
    wsUrl: match.wssUrl,
    role: "buyer",
    identity: buyerIdentity,
    ctx: { price: req.buyerMax, qty: req.qty, terms: "per-hour billing", requirements, maxRounds: 6, minDelta: 0.00001, seed: 42, persona: "balanced" },
    opts: { timeoutMs: req.buyerTimeoutMs ?? 120000, log: (s) => log.push(`buyer: ${s}`) },
  };
  const sellerDeps: AgentDeps = {
    wsUrl: match.wssUrl,
    role: "seller",
    identity: sellerIdentity,
    ctx: { price: req.sellerFloor, qty: req.qty, terms: "per-hour billing", requirements, maxRounds: 6, minDelta: 0.00001, seed: 42, persona: "cooperative" },
    opts: { timeoutMs: req.sellerTimeoutMs ?? 120000, log: (s) => log.push(`seller: ${s}`) },
  };

  const [b, s] = await Promise.all([runAgent(buyerDeps), runAgent(sellerDeps)]);

  if (b.kind !== "deal-closed") {
  return {
    matched: true,
    result: b,
    sellerResult: s,
    log,
    fallback: {
      kind: "no-deal",
      message: "Negotiation did not close.",
    },
  };
}

const dealResult = await postJson(`${CHAIN}/deals`, {
  roomId: match.roomId,
  transcriptHash: b.transcriptHash,

  buyer: {
    ...buyerIdentity,
    onchainAgentId: buyerReg.agentId,
  },

  seller: {
    ...sellerIdentity,
    onchainAgentId: sellerReg.agentId,
  },

  unitPrice: b.unitPrice,
  qty: b.qty,
  terms: b.terms,

  totalUsdc:
    (b.unitPrice ?? 0) * (b.qty ?? 0),
});

log.push(`GOAT settlement: ${dealResult.txHash}`);
  log.push(`Negotiation: buyer=${b.kind}${b.unitPrice != null ? ` @ ${b.unitPrice}` : ""}; seller=${s.kind}${s.unitPrice != null ? ` @ ${s.unitPrice}` : ""}`);

  const fallback =
    b.kind === "deal-closed"
      ? null
      : {
          kind: "no-deal",
          message: "Negotiation hit the room limit or timed out. Widen the spread or switch to deterministic mode.",
          suggestedAction: "Increase buyerMax or lower sellerFloor, then run again.",
        };

  return {
    matched: true,
    result: b,
    sellerResult: s,
    identity: {
  buyer: buyerReg,
  seller: sellerReg,
},

settlement: {
  mode: dealResult.mode,
  txHash: dealResult.txHash,
  explorerUrl: dealResult.explorerUrl,
},

reputation: dealResult.reputation,

total:
  b.unitPrice != null
    ? b.unitPrice * (b.qty ?? 0)
    : null,
    log,
    fallback,
  };
}

async function main() {
  const sys: RunningSystem = await startSystem();
  const indexHtml = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");

  const server = createServer(async (httpReq, httpRes) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (httpReq.method === "OPTIONS") { httpRes.writeHead(204, cors); return httpRes.end(); }

    if (httpReq.url === "/" || httpReq.url === "/index.html") {
      httpRes.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return httpRes.end(indexHtml);
    }

    if (httpReq.url === "/api/run-deal" && httpReq.method === "POST") {
      let body = "";
      httpReq.on("data", (c) => (body += c));
      httpReq.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const out = await runDeal({
            resource: parsed.resource || "gpu",
            qty: Number(parsed.qty) || 1,
            buyerMax: Number(parsed.buyerMax),
            sellerFloor: Number(parsed.sellerFloor),
            gpu: parsed.gpu || undefined,
            buyerWallet: parsed.buyerWallet || undefined,
            sellerWallet: parsed.sellerWallet || undefined,
            buyerTimeoutMs: parsed.buyerTimeoutMs != null ? Number(parsed.buyerTimeoutMs) : undefined,
            sellerTimeoutMs: parsed.sellerTimeoutMs != null ? Number(parsed.sellerTimeoutMs) : undefined,
            forceDeterministic: Boolean(parsed.forceDeterministic),
          });
          httpRes.writeHead(200, { "content-type": "application/json", ...cors });
          httpRes.end(JSON.stringify(out));
        } catch (e: any) {
          httpRes.writeHead(500, { "content-type": "application/json", ...cors });
          httpRes.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (httpReq.url === "/api/health") {
      // Reflect whether the chain service is settling live or mock.
      let chainMode: Record<string, unknown> = { mode: "unknown" };
      try {
        const r = await fetch("http://localhost:3003/mode");
        if (r.ok) chainMode = (await r.json()) as Record<string, unknown>;
      } catch { /* chain not up; keep unknown */ }
      httpRes.writeHead(200, { "content-type": "application/json", ...cors });
      return httpRes.end(JSON.stringify({
        ok: true,
        services: { intake: 3001, negotiate: 3002, chain: 3003 },
        chain: chainMode,
      }));
    }

    httpRes.writeHead(404, { "content-type": "application/json", ...cors });
    httpRes.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(UI_PORT, () => {
    console.log("[ui] Finality control panel:");
    console.log(`  UI        http://localhost:${UI_PORT}`);
    console.log("  intake    http://localhost:3001");
    console.log("  negotiate ws://localhost:3002/negotiate/:roomId");
    console.log("  chain     http://localhost:3003");
    console.log("Press Ctrl+C to stop.");
  });

  const stop = () => { server.close(); sys.close().then(() => process.exit(0)); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => { console.error(e); process.exit(1); });
