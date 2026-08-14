import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { Room } from "./room.js";
import { notifyDeal, getLastSettlement, getRecentSettlements, submitSellerCompletion, submitBuyerDecision, submitAdminOverride, getVerificationDashboardView, getVerificationDashboardViews, } from "./settle.js";
const PORT = Number(process.env.PORT ?? 3002);
// In-memory room registry keyed by roomId (Part 1 is not required to run;
// we accept any roomId and treat the first buyer/seller joins as the pair).
const rooms = new Map();
function getOrCreateRoom(roomId) {
    let room = rooms.get(roomId);
    if (!room) {
        const config = {};
        const maxRounds = process.env.NEGOTIATE_MAX_ROUNDS ? Number(process.env.NEGOTIATE_MAX_ROUNDS) : undefined;
        if (maxRounds && !Number.isNaN(maxRounds))
            config.maxRounds = maxRounds;
        const minDelta = process.env.NEGOTIATE_MIN_DELTA ? Number(process.env.NEGOTIATE_MIN_DELTA) : undefined;
        if (minDelta !== undefined && !Number.isNaN(minDelta))
            config.minDelta = minDelta;
        const minMoveFraction = process.env.NEGOTIATE_MIN_MOVE_FRACTION
            ? Number(process.env.NEGOTIATE_MIN_MOVE_FRACTION)
            : undefined;
        if (minMoveFraction !== undefined && !Number.isNaN(minMoveFraction))
            config.minMoveFraction = minMoveFraction;
        room = new Room(roomId, config, (result) => {
            void notifyDeal(result);
        });
        rooms.set(roomId, room);
    }
    return room;
}
/** Write a JSON HTTP response with permissive CORS (dashboard lives on :3000). */
function sendJson(res, status, body) {
    res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
    });
    res.end(JSON.stringify(body));
}
/** Read + parse a JSON request body (best-effort). */
function readJson(req) {
    return new Promise((resolve, reject) => {
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 1e6) {
                reject(new Error("request body too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            if (!raw)
                return resolve({});
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new Error("invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}
/**
 * Start the WebSocket venue plus a small HTTP surface on the same port.
 *
 * The HTTP side is read-only: it exposes the in-memory settlement records that
 * the EXISTING verification flow (settle.ts → @finality/verification) already
 * produces when a deal closes. The frontend polls these to render the
 * DEAL CLOSED → VERIFICATION → VERIFYING → VERIFIED/REJECTED transition with
 * the real verification result and the real agreed deal data.
 */
export function startServer(port = PORT) {
    const httpServer = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "OPTIONS") {
            res.writeHead(204, {
                "access-control-allow-origin": "*",
                "access-control-allow-methods": "GET,POST,OPTIONS",
                "access-control-allow-headers": "content-type",
            });
            res.end();
            return;
        }
        if (req.method === "GET" && url.pathname === "/health") {
            sendJson(res, 200, { ok: true, service: "negotiate" });
            return;
        }
        if (req.method === "GET" && url.pathname === "/settlements") {
            sendJson(res, 200, getRecentSettlements());
            return;
        }
        const m = /^\/settlements\/([^/]+)$/.exec(url.pathname);
        if (req.method === "GET" && m) {
            const roomId = decodeURIComponent(m[1]);
            const record = getLastSettlement(roomId);
            if (!record) {
                sendJson(res, 404, { ok: false, error: `no settlement record for room ${roomId}` });
                return;
            }
            sendJson(res, 200, record);
            return;
        }
        // ── Verification workflow actions ──────────────────────────────────────
        // The seller/buyer/admin submit their part of the approval workflow; each
        // re-runs verification for the room and pushes the deal to settlement the
        // moment it actually passes (see settle.js). The frontend hits these via
        // the same base URL as /settlements (negotiate :3002).
        const actionM = /^\/verifications\/([^/]+)\/(seller-complete|buyer-decision|admin-override)$/.exec(url.pathname);
        if (req.method === "POST" && actionM) {
            const requestId = decodeURIComponent(actionM[1]);
            const action = actionM[2];
            let body;
            try {
                body = await readJson(req);
            }
            catch {
                sendJson(res, 400, { ok: false, error: "invalid JSON body" });
                return;
            }
            try {
                let record;
                if (action === "seller-complete") {
                    record = await submitSellerCompletion(requestId, String(body.sellerAgentId ?? ""), String(body.proof ?? ""), body.notes !== undefined ? String(body.notes) : undefined);
                }
                else if (action === "buyer-decision") {
                    record = await submitBuyerDecision(requestId, String(body.buyerAgentId ?? ""), body.decision === "approve" ? "approve" : "reject", body.rejectionReason !== undefined ? String(body.rejectionReason) : undefined, body.notes !== undefined ? String(body.notes) : undefined);
                }
                else {
                    const decision = body.decision === "rejected" || body.decision === "error" ? body.decision : "verified";
                    record = await submitAdminOverride(requestId, String(body.adminAgentId ?? ""), decision, body.rejectionReason !== undefined ? String(body.rejectionReason) : undefined, body.notes !== undefined ? String(body.notes) : undefined);
                }
                sendJson(res, 200, { ok: true, record });
            }
            catch (err) {
                sendJson(res, 404, { ok: false, error: String(err?.message ?? err) });
            }
            return;
        }
        const vm = /^\/verifications\/([^/]+)$/.exec(url.pathname);
        if (req.method === "GET" && vm) {
            const requestId = decodeURIComponent(vm[1]);
            const view = await getVerificationDashboardView(requestId);
            if (!view) {
                sendJson(res, 404, { ok: false, error: `no verification request ${requestId}` });
                return;
            }
            sendJson(res, 200, view);
            return;
        }
        if (req.method === "GET" && url.pathname === "/verifications") {
            const page = Number(url.searchParams.get("page") ?? 1);
            const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
            const status = url.searchParams.get("status") ?? undefined;
            const agentId = url.searchParams.get("agentId") ?? undefined;
            const list = await getVerificationDashboardViews({ page, pageSize, status, agentId });
            sendJson(res, 200, list);
            return;
        }
        sendJson(res, 404, { ok: false, error: "not found" });
    });
    const wss = new WebSocketServer({ server: httpServer });
    // With `server` option ws does not bind the port itself — listen on the
    // HTTP server so both the WS venue and the settlement read surface serve.
    httpServer.listen(port);
    wss.on("connection", (socket, req) => {
        // URL: /negotiate/:roomId
        const url = new URL(req.url ?? "/negotiate/unknown", "http://localhost");
        const parts = url.pathname.split("/").filter(Boolean); // ["negotiate", "<roomId>"]
        const roomId = parts[1] ?? "unknown";
        const room = getOrCreateRoom(roomId);
        let role = null;
        const send = (data) => {
            if (socket.readyState === WebSocket.OPEN)
                socket.send(data);
        };
        socket.on("message", (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            }
            catch {
                send(JSON.stringify({ type: "system", kind: "error", message: "non-JSON frame", ts: Date.now() }));
                return;
            }
            if (msg && msg.type === "join") {
                const j = msg;
                if (role) {
                    send(JSON.stringify({ type: "system", kind: "error", message: "already joined", ts: Date.now() }));
                    return;
                }
                const ok = room.join(j.role, j.identity, send);
                if (!ok) {
                    send(JSON.stringify({ type: "system", kind: "error", message: "room full or role taken", ts: Date.now() }));
                    return;
                }
                role = j.role;
                return;
            }
            if (!role) {
                send(JSON.stringify({ type: "system", kind: "error", message: "send join first", ts: Date.now() }));
                return;
            }
            room.handle(role, msg);
        });
    socket.on("close", () => {
        // Release the participant's role slot on disconnect so the same role can
        // reconnect (page refresh / dropped socket). Without this a reconnecting
        // party would be rejected as "role taken" by a ghost occupant.
        if (role) {
            room.leave(role);
            role = null;
        }
    });
    });
    // ws' WebSocketServer({ server }) does NOT close the passed HTTP server, so
    // wrap close() to tear the whole listener down (used by start-all + tests).
    const baseClose = wss.close.bind(wss);
    wss.close = ((cb) => {
        httpServer.close(() => baseClose(cb));
    });
    return wss;
}
// Run when executed directly (tsx/npm run dev).
if (import.meta.url === `file://${process.argv[1]}`) {
    const wss = startServer();
    console.log(`[negotiate] WebSocket venue listening on ws://localhost:${PORT}/negotiate/:roomId`);
    process.on("SIGINT", () => {
        wss.close();
        process.exit(0);
    });
}
export { randomUUID };
