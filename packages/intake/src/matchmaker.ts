import type { Store } from "./store";
import type { Intent, Offer } from "./types";

const WS_URL = process.env.WS_URL ?? "ws://localhost:3002";

/** A party's identity as carried by an intent/offer (ERC-8004 identity). */
export interface MatchParty {
  agentRegistry: string;
  agentId: string;
  wallet: string;
}

/** The details of a real match, exposed so clients can render the match card
 * (buyer agent, seller agent, resource, proposed price, constraints, room). */
export interface MatchDetails {
  buyer: MatchParty;
  seller: MatchParty;
  resource: string;
  unit: string;
  qty: number;
  /** Proposed price per unit (the seller's asking price for an intent match). */
  unitPrice: number;
  /** Constraints the matched offer/intent carries (requirements). */
  requirements: Record<string, unknown>;
  terms?: string;
}

export interface MatchResult {
  matched: boolean;
  roomId?: string;
  wssUrl?: string;
  /** Present when a compatible counterparty was found and a room opened. */
  match?: MatchDetails;
}

function buildDetails(intent: Intent, offer: Offer): MatchDetails {
  return {
    buyer: {
      agentRegistry: intent.agentRegistry,
      agentId: intent.agentId,
      wallet: intent.wallet,
    },
    seller: {
      agentRegistry: offer.agentRegistry,
      agentId: offer.agentId,
      wallet: offer.wallet,
    },
    resource: offer.resource,
    unit: offer.unit,
    qty: intent.qty,
    unitPrice: offer.unitPrice,
    requirements: offer.requirements ?? {},
    terms: offer.terms,
  };
}

export class Matchmaker {
  constructor(private store: Store) {}

  // Called after an intent is added. If a compatible offer exists, open a room.
  onIntent(intentId: string): MatchResult {
    const intent = this.store.getIntent(intentId);
    if (!intent) return { matched: false };

    const hit = this.store.findMatchForIntent(intent);
    if (!hit) return { matched: false };

    const room = this.store.createRoom(intentId, hit.offerId);
    return {
      matched: true,
      roomId: room.roomId,
      wssUrl: `${WS_URL}/negotiate/${room.roomId}`,
      match: buildDetails(intent, hit.offer),
    };
  }

  // Called after an offer is added. If a compatible intent exists, open a room.
  onOffer(offerId: string): MatchResult {
    const offer = this.store.getOffer(offerId);
    if (!offer) return { matched: false };

    const hit = this.store.findMatchForOffer(offer);
    if (!hit) return { matched: false };

    const room = this.store.createRoom(hit.intentId, offerId);
    return {
      matched: true,
      roomId: room.roomId,
      wssUrl: `${WS_URL}/negotiate/${room.roomId}`,
      match: buildDetails(hit.intent, offer),
    };
  }

  // Lookup an existing match for an intent or offer id.
  lookup(id: string): MatchResult {
    const room = this.store.findRoomByIntent(id) ?? this.store.findRoomByOffer(id);
    if (!room) return { matched: false };
    const intent = this.store.getIntent(room.intentId);
    const offer = this.store.getOffer(room.offerId);
    const details = intent && offer ? buildDetails(intent, offer) : undefined;
    return {
      matched: true,
      roomId: room.roomId,
      wssUrl: `${WS_URL}/negotiate/${room.roomId}`,
      match: details,
    };
  }
}
