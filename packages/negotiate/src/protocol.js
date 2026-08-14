import { z } from "zod";
// ── Envelope (contract §4) ────────────────────────────────────────────────
// { "type": "counteroffer" | "accept" | "reject" | "close" | "system",
//   "from": "buyer" | "seller", "round": 1, "payload": { ... }, "ts": ... }
export const Role = z.enum(["buyer", "seller"]);
export const MessageType = z.enum(["counteroffer", "accept", "reject", "close", "system"]);
// Counteroffer / accept payload shape (contract §4 + §5).
// `argument` carries the agent's free-text reasoning ("why I'm at this price").
// It is stored in the transcript and included in the keccak256 hash so the
// *reasoning* behind a deal is part of the tamper-proof proof (negotiation §1).
export const TermsSchema = z.object({
    unitPrice: z.number(),
    qty: z.number(),
    terms: z.string(),
    requirements: z.record(z.unknown()).optional(),
    argument: z.string().optional(),
});
// Full wire envelope (mirrors negotiation.json schema). `payload` is loosely typed
// here and narrowed by the Room per message type.
export const EnvelopeSchema = z.object({
    type: MessageType,
    from: Role,
    round: z.number().int().min(1),
    payload: z.record(z.unknown()).optional(),
    ts: z.number().optional(),
});
export const DEFAULT_MIN_MOVE_FRACTION = 0.01;
// Negotiation policy (contract §4 "Server-enforced constraints").
//   minDelta         optional ABSOLUTE min move; when set, used verbatim.
//   minMoveFraction  adaptive DEFAULT: a counteroffer must move by at least
//                    `minMoveFraction` × the last opposing price (0.01 → 1%),
//                    so one config serves micro prices (0.000090) and large
//                    deals while still rejecting sub-1% stalling moves.
export const DEFAULT_CONFIG = {
    maxRounds: 10,
    minMoveFraction: DEFAULT_MIN_MOVE_FRACTION,
};
// Parse + structurally validate an incoming client frame. Returns the typed
// envelope or a zod error. `system` frames from clients are rejected by the
// server higher up (clients must not emit system).
export function parseEnvelope(raw) {
    const result = EnvelopeSchema.safeParse(raw);
    if (result.success)
        return { ok: true, value: result.data };
    return { ok: false, error: result.error };
}
