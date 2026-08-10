/**
 * Brain-driven negotiation agent client.
 *
 * Connects to the Part 2 WebSocket room (packages/negotiate) and plays the
 * role using the LLM/LangGraph brain instead of the mechanical midpoint split.
 * On each turn it asks the brain for a decision, then emits the matching frame.
 * When the room closes with a deal, it resolves with the closed terms.
 *
 * This is the glue your motive needs: an autonomous agent arrives (via the
 * HTTP endpoint), gets matched, and then *haggles by reasoning* over the socket
 * — the structured terms still drop into the deterministic settlement flow.
 */
import WebSocket from "ws";
import { runTurn } from "./flow.js";
import { guardDecision } from "./guard.js";
export async function runAgent(deps) {
    const { wsUrl, role, identity, ctx, reputationFor } = deps;
    const log = deps.opts?.log ?? (() => { });
    const timeoutMs = deps.opts?.timeoutMs ?? 30_000;
    // Pull counterparty reputation up front if a provider was given.
    let counterparty;
    if (reputationFor) {
        try {
            const r = await reputationFor("counterparty");
            counterparty = { agentId: "counterparty", ...r };
        }
        catch {
            /* unknown rep → undefined, brain treats as neutral */
        }
    }
    const brainCtx = { ...ctx, role, counterparty, seed: deps.opts?.seed };
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let round = 1;
        let done = false;
        let opened = false;
        const history = [];
        const finish = (r) => {
            if (done)
                return;
            done = true;
            try {
                ws.close();
            }
            catch { }
            clearTimeout(timer);
            resolve(r);
        };
        const timer = setTimeout(() => {
            log("negotiation timed out");
            finish({ kind: "constraint-hit", message: "timeout" });
        }, timeoutMs);
        const send = (m) => {
            if (m.type === "counteroffer" || m.type === "accept") {
                m.round = round;
                m.from = role;
            }
            ws.send(JSON.stringify(m));
        };
        const join = () => {
            const j = { type: "join", role, identity };
            if (role === "buyer")
                j.identity.maxUnitPrice = brainCtx.price;
            else
                j.identity.floorUnitPrice = brainCtx.price;
            ws.send(JSON.stringify(j));
            log(`${role} joined room`);
        };
        const decideAndAct = async (lastTerms) => {
            const input = {
                round,
                lastTerms: lastTerms
                    ? { unitPrice: lastTerms.unitPrice, qty: lastTerms.qty, terms: lastTerms.terms, argument: lastTerms.argument }
                    : undefined,
                history: [...history],
            };
            const { decision } = await runTurn(brainCtx, input);
            log(`${role} decides: ${decision.action} ${"unitPrice" in decision ? decision.unitPrice : ""} — ${decision.argument}`);
            // Guardrail: never emit an argument/decision the sidecar rejects.
            const guardText = [decision.argument, "unitPrice" in decision ? `price ${decision.unitPrice}` : ""].join(" ").trim();
            const verdict = await guardDecision(guardText, role, { bound: brainCtx.price });
            if (!verdict.allowed) {
                log(`[guard] blocked: ${verdict.reason} — closing`);
                send({ type: "close", payload: { reason: "guardrail: " + verdict.reason } });
                finish({ kind: "constraint-hit", message: verdict.reason });
                return;
            }
            if (decision.action === "accept") {
                send({ type: "accept", payload: { unitPrice: decision.unitPrice, qty: brainCtx.qty, terms: brainCtx.terms, argument: decision.argument } });
            }
            else if (decision.action === "counteroffer") {
                send({
                    type: "counteroffer",
                    payload: { unitPrice: decision.unitPrice, qty: brainCtx.qty, terms: brainCtx.terms, requirements: brainCtx.requirements, argument: decision.argument },
                });
                round += 1;
            }
            else if (decision.action === "reject") {
                send({ type: "reject", payload: { reason: decision.reason } });
            }
            else {
                // close / walk away
                send({ type: "close", payload: { reason: decision.reason } });
                finish({ kind: "constraint-hit", message: decision.reason });
            }
        };
        const isDealClosed = (msg) => msg.kind === "deal-closed" || (msg.type === "system" && msg.payload?.kind === "deal-closed");
        const isConstraintHit = (msg) => msg.kind === "constraint-hit" || (msg.type === "system" && msg.payload?.kind === "constraint-hit");
        ws.on("open", () => join());
        ws.on("message", async (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            }
            catch {
                return;
            }
            if (msg.type === "system") {
                if (isDealClosed(msg)) {
                    const d = msg.deal ?? msg.payload;
                    log(`system: deal-closed ${JSON.stringify(d)}`);
                    return finish({
                        kind: "deal-closed",
                        unitPrice: d?.unitPrice,
                        qty: d?.qty,
                        terms: d?.terms,
                        transcriptHash: msg.transcriptHash ?? msg.payload?.transcriptHash,
                    });
                }
                if (isConstraintHit(msg)) {
                    log("system: constraint-hit (no deal)");
                    return finish({ kind: "constraint-hit" });
                }
                // "room ready — buyer to move": buyer opens.
                if (role === "buyer" && !opened && typeof msg.message === "string" && /room ready/i.test(msg.message)) {
                    opened = true;
                    await decideAndAct();
                }
                return;
            }
            // Counteroffer from counterparty → record + decide.
            if (msg.from && msg.from !== role && msg.type === "counteroffer") {
                const p = msg.payload;
                if (typeof p?.unitPrice !== "number")
                    return;
                history.push({ from: msg.from, unitPrice: p.unitPrice, argument: p.argument });
                await decideAndAct(p);
            }
        });
        ws.on("error", (err) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}
