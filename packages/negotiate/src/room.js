import { keccak256, stringToHex } from "viem";
import { DEFAULT_CONFIG, parseEnvelope, } from "./protocol.js";
// A negotiation room. Enforces the protocol from contract §4:
//  - exactly two parties (buyer + seller)
//  - alternating turns
//  - maxRounds cap → constraint-hit
//  - minDelta on counteroffers → rejects stalls
//  - price bounds (buyer ceiling / seller floor) enforced on accept
//  - appends every message to a transcript; on terminal, keccak256(JSON(transcript))
export class Room {
    onDeal;
    roomId;
    status = "open";
    config;
    parties = {};
    transcript = [];
    turn = null;
    round = 0; // completed counteroffer rounds
    // track the last opposing offer so we can enforce minDelta
    lastOffer = null;
    lastTerms = null;
    result = null;
    // Resource type declared by the joined parties (first non-null wins). The
    // two sides of one match agree on the same resource, so whichever joins
    // first provides it; legacy identities that omit it leave it undefined.
    resource = undefined;
    constructor(roomId, config = {}, onDeal) {
        this.onDeal = onDeal;
        this.roomId = roomId;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    get isFull() {
        return !!this.parties.buyer && !!this.parties.seller;
    }
    // Returns the role assigned, or null if the room is full.
    join(role, identity, send) {
        if (this.status === "closed")
            return false; // room already concluded
        if (this.parties[role])
            return false; // role already taken
        if (this.parties.buyer && this.parties.seller)
            return false; // room full
        this.parties[role] = { role, identity, send };
        if (identity.resource && !this.resource)
            this.resource = identity.resource;
        this.broadcast({
            type: "system",
            kind: "info",
            message: `${role} joined`,
            ts: Date.now(),
        });
        // The first joiner is the buyer (natural initiator) unless roles were
        // explicit; when the room becomes ready the turn is whoever's move comes
        // next per the transcript — buyer on a fresh room, the OPPOSITE of the last
        // action when a party reconnects mid-negotiation (never reset to buyer).
        if (this.isFull) {
            this.turn = this.nextTurn();
            this.broadcast({
                type: "system",
                kind: "info",
                message: `room ready — ${this.turn} to move`,
                ts: Date.now(),
            });
        }
        // Reconnect snapshot: replay the transcript + turn to the joiner so a
        // reconnecting party restores its view instead of restarting the room.
        if (this.transcript.length > 0) {
            this.tell(role, {
                type: "system",
                kind: "resume",
                transcript: [...this.transcript],
                turn: this.turn,
                round: this.round,
                lastTerms: this.lastTerms,
                ts: Date.now(),
            });
        }
        return true;
    }
    // Remove a party from the room and release its role slot. Called when a
    // participant's socket disconnects so the same role can reconnect (page
    // refresh / dropped socket) without leaving a ghost occupant behind. The
    // transcript is preserved; if the room is no longer full, the turn is
    // cleared until a counterparty joins again.
    leave(role) {
        if (!this.parties[role])
            return;
        delete this.parties[role];
        if (!this.isFull) {
            this.turn = null;
        }
        this.broadcast({
            type: "system",
            kind: "info",
            message: `${role} left`,
            ts: Date.now(),
        });
    }
    // Handle an incoming client frame (already JSON-parsed, raw).
    handle(role, raw) {
        if (this.status === "closed")
            return;
        const who = this.parties[role];
        if (!who)
            return; // unknown party
        const parsed = parseEnvelope(raw);
        if (!parsed.ok) {
            this.tell(role, { type: "system", kind: "error", message: "invalid envelope", ts: Date.now() });
            return;
        }
        const env = parsed.value;
        if (env.from !== role) {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: `envelope.from=${env.from} but you are ${role}`,
                ts: Date.now(),
            });
            return;
        }
        if (env.type === "system") {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: "clients may not send system frames",
                ts: Date.now(),
            });
            return;
        }
        switch (env.type) {
            case "counteroffer":
                this.onCounteroffer(role, env);
                break;
            case "accept":
                this.onAccept(role, env);
                break;
            case "reject":
                this.onReject(role);
                break;
            case "close":
                this.closeBy(role);
                break;
        }
    }
    // ── Handlers ────────────────────────────────────────────────────────────
    onCounteroffer(role, env) {
        if (!this.checkTurn(role))
            return;
        const p = env.payload ?? {};
        const unitPrice = p.unitPrice;
        const qty = p.qty;
        const terms = typeof p.terms === "string" ? p.terms : "";
        if (typeof unitPrice !== "number" || typeof qty !== "number") {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: "counteroffer requires numeric unitPrice and qty",
                ts: Date.now(),
            });
            return;
        }
        // minDelta: a counteroffer must move the price by >= the effective minimum
        // from the last OPPOSING offer (within bounds). Prevents stalling. The
        // threshold adapts to the price scale (see minMove()).
        if (this.lastOffer && this.lastOffer.role !== role) {
            const opposing = this.lastOffer.unitPrice;
            const required = this.minMove(opposing);
            const delta = Math.abs(unitPrice - opposing);
            // Relative tolerance absorbs float noise so exact-boundary moves
            // (e.g. a 1% move at 1000) are never spuriously rejected.
            const tolerance = Math.max(Math.abs(opposing), Math.abs(unitPrice), required) * 1e-9;
            if (delta < required - tolerance) {
                this.tell(role, {
                    type: "system",
                    kind: "error",
                    message: `price moved < minDelta (${Number(required.toFixed(12))}) from opposing ${opposing}`,
                    ts: Date.now(),
                });
                return;
            }
        }
        const termsObj = {
            unitPrice,
            qty,
            terms,
            requirements: p.requirements ?? {},
        };
        this.lastTerms = termsObj;
        this.lastOffer = { role, unitPrice };
        // Use the client-supplied timestamp when present so the transcript hash is
        // deterministic for a given message sequence (TDD #2); fall back to a
        // monotonic sequence number otherwise.
        const ts = typeof env.ts === "number" ? env.ts : this.transcript.length + 1;
        this.append(role, env.round, termsObj, ts);
        this.round += 1;
        this.turn = role === "buyer" ? "seller" : "buyer";
        if (this.round >= this.config.maxRounds) {
            // cap reached with no accept → constraint-hit
            this.terminate({
                type: "system",
                kind: "constraint-hit",
                lastTerms: this.lastTerms,
                reason: `maxRounds (${this.config.maxRounds}) reached`,
                ts: Date.now(),
            });
            return;
        }
        this.broadcast(env); // reflect the accepted counteroffer to both
    }
    onAccept(role, env) {
        if (!this.checkTurn(role))
            return;
        if (!this.lastTerms) {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: "cannot accept before any offer exists",
                ts: Date.now(),
            });
            return;
        }
        const agreed = {
            unitPrice: this.lastTerms.unitPrice,
            qty: this.lastTerms.qty,
            terms: this.lastTerms.terms,
            requirements: this.lastTerms.requirements,
        };
        // Buyer may never accept > its maxUnitPrice; seller may never go below floor.
        const buyerFloor = this.parties.buyer?.identity.floorUnitPrice; // unused but kept for clarity
        void buyerFloor;
        const buyer = this.parties.buyer;
        const seller = this.parties.seller;
        const buyerCeiling = buyer.identity.maxUnitPrice;
        const sellerFloor = seller.identity.floorUnitPrice;
        if (buyerCeiling !== undefined && agreed.unitPrice > buyerCeiling) {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: `price ${agreed.unitPrice} exceeds buyer ceiling ${buyerCeiling}`,
                ts: Date.now(),
            });
            return;
        }
        if (sellerFloor !== undefined && agreed.unitPrice < sellerFloor) {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: `price ${agreed.unitPrice} below seller floor ${sellerFloor}`,
                ts: Date.now(),
            });
            return;
        }
        const acceptTs = typeof env.ts === "number" ? env.ts : this.transcript.length + 1;
        this.append(role, env.round, agreed, acceptTs);
        const deal = {
            buyer: {
                agentRegistry: buyer.identity.agentRegistry,
                agentId: buyer.identity.agentId,
                wallet: buyer.identity.wallet,
            },
            seller: {
                agentRegistry: seller.identity.agentRegistry,
                agentId: seller.identity.agentId,
                wallet: seller.identity.wallet,
            },
            unitPrice: agreed.unitPrice,
            qty: agreed.qty,
            terms: agreed.terms,
            totalUsdc: agreed.unitPrice * agreed.qty,
            resource: this.resource,
        };
        const transcriptHash = this.computeHash();
        this.result = { roomId: this.roomId, transcriptHash, deal };
        this.terminate({
            type: "system",
            kind: "deal-closed",
            deal,
            transcriptHash,
            ts: Date.now(),
        });
    }
    onReject(role) {
        if (!this.checkTurn(role))
            return;
        this.tell(role, {
            type: "system",
            kind: "info",
            message: `${role} rejected — proposing new terms`,
            ts: Date.now(),
        });
        // A reject does not change the turn; the same party may counter again.
        // (Keeps the round count honest — only accepted counteroffers advance.)
    }
    closeBy(role) {
        this.terminate({
            type: "system",
            kind: "constraint-hit",
            lastTerms: this.lastTerms,
            reason: `closed by ${role}`,
            ts: Date.now(),
        });
    }
    // ── Helpers ──────────────────────────────────────────────────────────────
    // Effective minimum price move for the current turn, generic across price
    // scales. An explicit absolute `minDelta` is honored verbatim; otherwise the
    // threshold adapts to the price scale as a fraction of the last opposing
    // price, so the DEFAULT config serves micro USDC prices (0.000090) and
    // large deals without per-room code.
    minMove(opposing) {
        if (this.config.minDelta != null)
            return this.config.minDelta;
        return Math.abs(opposing) * this.config.minMoveFraction;
    }
    // The next actor is the opposite of whoever made the last accepted move; on a
    // fresh room the buyer moves first. Deriving it from the transcript (instead
    // of defaulting to buyer) is what keeps the turn correct across reconnects.
    nextTurn() {
        for (let i = this.transcript.length - 1; i >= 0; i--) {
            const e = this.transcript[i];
            if (e.type === "msg")
                return e.from === "buyer" ? "seller" : "buyer";
        }
        return "buyer";
    }
    checkTurn(role) {
        if (this.turn === null) {
            this.tell(role, { type: "system", kind: "error", message: "not your turn yet", ts: Date.now() });
            return false;
        }
        if (role !== this.turn) {
            this.tell(role, {
                type: "system",
                kind: "error",
                message: `out of turn (expected ${this.turn})`,
                ts: Date.now(),
            });
            return false;
        }
        return true;
    }
    append(role, round, payload, ts) {
        this.transcript.push({ type: "msg", from: role, round, payload, ts });
    }
    computeHash() {
        return keccak256(stringToHex(JSON.stringify(this.transcript)));
    }
    broadcast(env) {
        const data = JSON.stringify(env);
        for (const p of Object.values(this.parties))
            p?.send(data);
    }
    tell(role, env) {
        this.parties[role]?.send(JSON.stringify(env));
    }
    // Terminal: emit the system frame, close the room, resolve any waiters.
    async terminate(env) {
        if (this.status === "closed")
            return;
        this.status = "closed";
        this.broadcast(env);
        if (env.type === "system" && env.kind === "deal-closed" && this.result) {
            await this.onDeal?.(this.result);
        }
    }
    getResult() {
        return this.result;
    }
    // Last received terms (for constraint-hit payloads / inspection).
    getLastTerms() {
        return this.lastTerms;
    }
}
