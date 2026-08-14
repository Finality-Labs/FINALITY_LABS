import { z } from "zod";

// ── Envelope (contract §4) ────────────────────────────────────────────────
// { "type": "counteroffer" | "accept" | "reject" | "close" | "system",
//   "from": "buyer" | "seller", "round": 1, "payload": { ... }, "ts": ... }

export const Role = z.enum(["buyer", "seller"]);
export type Role = z.infer<typeof Role>;

export const MessageType = z.enum(["counteroffer", "accept", "reject", "close", "system"]);
export type MessageType = z.infer<typeof MessageType>;

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
export type Terms = z.infer<typeof TermsSchema>;

// Full wire envelope (mirrors negotiation.json schema). `payload` is loosely typed
// here and narrowed by the Room per message type.
export const EnvelopeSchema = z.object({
  type: MessageType,
  from: Role,
  round: z.number().int().min(1),
  payload: z.record(z.unknown()).optional(),
  ts: z.number().optional(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

// Server-emitted `system` envelopes (never sent by clients).
export type SystemEnvelope =
  | { type: "system"; kind: "error"; message: string; ts: number }
  | { type: "system"; kind: "deal-closed"; deal: ClosedDeal; transcriptHash: string; ts: number }
  | { type: "system"; kind: "constraint-hit"; lastTerms: Terms | null; reason: string; ts: number }
  | { type: "system"; kind: "info"; message: string; ts: number }
  | {
      // Reconnect snapshot sent to a party that joins a room mid-negotiation so
      // it can restore the transcript + turn instead of restarting the room.
      type: "system";
      kind: "resume";
      transcript: Array<{ type: string; from: Role; round: number; payload: unknown; ts: number }>;
      turn: Role | null;
      round: number;
      lastTerms: Terms | null;
      ts: number;
    };

// Deal object delivered to Part 3 (contract §5).
export interface ClosedDeal {
  buyer: { agentRegistry: string; agentId: string; wallet: string };
  seller: { agentRegistry: string; agentId: string; wallet: string };
  unitPrice: number;
  qty: number;
  terms: string;
  totalUsdc: number;
  // Resource type agreed for the deal (e.g. "gpu" | "storage" | "bandwidth" |
  // "compute"). Carried from the join identity so the verification layer can
  // validate the closed deal against the correct resource terms. Absent for
  // flows that never declared a resource (legacy/mock identities).
  resource?: string;
}

// Negotiation policy (contract §4 "Server-enforced constraints").
export interface NegotiationConfig {
  maxRounds: number; // default 10
  /**
   * Optional ABSOLUTE minimum price move per counteroffer. When set it is used
   * verbatim (an explicit override pinning the old absolute behavior, e.g.
   * `minDelta: 0.00001` for a micro-price negotiation).
   */
  minDelta?: number;
  /**
   * Adaptive minimum move used when `minDelta` is NOT set: a counteroffer must
   * move the price by at least `minMoveFraction` × the last OPPOSING price.
   * Default 0.01 → a 1% move. Because the threshold is a fraction of the price
   * scale, the same default config serves micro USDC prices (0.000090 → a
   * 0.000100 response is a valid 11% move) and large deals (1000 → 990 is a
   * valid 1% move) while still rejecting meaningless sub-1% stalling moves.
   */
  minMoveFraction: number;
}

export const DEFAULT_MIN_MOVE_FRACTION = 0.01;

export const DEFAULT_CONFIG: NegotiationConfig = {
  maxRounds: 10,
  minMoveFraction: DEFAULT_MIN_MOVE_FRACTION,
};

// Parse + structurally validate an incoming client frame. Returns the typed
// envelope or a zod error. `system` frames from clients are rejected by the
// server higher up (clients must not emit system).
export function parseEnvelope(raw: unknown): { ok: true; value: Envelope } | { ok: false; error: z.ZodError } {
  const result = EnvelopeSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error };
}
