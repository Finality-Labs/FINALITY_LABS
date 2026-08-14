import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";
import type { FastifyInstance } from "fastify";

// Dedicated app instances with their own fresh Stores so these tests are
// isolated from the seeded fixture and from each other. The critical assertion:
// the roomId minted for a match must be the SAME value at every stage of the
// lifecycle (POST response, pulse re-run, /matches/:id lookup, both roles).
const offerA = {
  resource: "gpu", unit: "hour", unitPrice: 10, terms: "per-hour",
  requirements: { gpu: "H100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "7", wallet: "0xSELLERA",
};
const intentA = {
  resource: "gpu", qty: 5, unit: "hour", maxUnitPrice: 20,
  requirements: { gpu: "H100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "8", wallet: "0xBUYERA",
};
const offerB = {
  resource: "gpu", unit: "hour", unitPrice: 11, terms: "per-hour",
  requirements: { gpu: "A100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "9", wallet: "0xSELLERB",
};
const intentB = {
  resource: "gpu", qty: 3, unit: "hour", maxUnitPrice: 20,
  requirements: { gpu: "A100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "10", wallet: "0xBUYERB",
};

describe("intake roomId lifecycle — single authoritative room per match", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp({ seedFixtures: false }); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it("seller-first match: POST /offers roomId === GET /matches/:intentId === pulse re-run", async () => {
    // Buyer intent arrives before any offer → not matched yet.
    const intent = await app.inject({ method: "POST", url: "/intents", payload: intentA });
    expect(intent.json().matched).toBe(false);

    // Seller offer arrives → match opens a room; seller gets the authoritative roomId.
    const offer = await app.inject({ method: "POST", url: "/offers", payload: offerA });
    const body = offer.json();
    expect(body.matched).toBe(true);
    const roomId = body.roomId;
    expect(roomId).toBeTruthy();

    // Buyer polls the match → SAME roomId as the seller was given.
    const buyerLookup = await app.inject({ method: "GET", url: `/matches/${intent.json().intentId}` });
    expect(buyerLookup.json().roomId).toBe(roomId);

    // Seller re-pulses after the match → must NOT mint a new room; SAME roomId.
    const pulse = await app.inject({ method: "POST", url: `/offers/${body.offerId}/pulse` });
    expect(pulse.json().pulsed).toBe(true);
    expect(pulse.json().roomId).toBe(roomId);

    // Both role lookups agree.
    expect((await app.inject({ method: "GET", url: `/matches/${body.offerId}` })).json().roomId).toBe(roomId);
  });

  it("buyer-first match: POST /intents roomId === GET /matches/:offerId === pulse re-run", async () => {
    // Seller offer arrives before any matching intent → not matched yet.
    const offer = await app.inject({ method: "POST", url: "/offers", payload: offerB });
    expect(offer.json().matched).toBe(false);

    // Buyer intent arrives → match opens a room; buyer gets the authoritative roomId.
    const intent = await app.inject({ method: "POST", url: "/intents", payload: intentB });
    const body = intent.json();
    expect(body.matched).toBe(true);
    const roomId = body.roomId;
    expect(roomId).toBeTruthy();

    // Seller polls the match → SAME roomId as the buyer was given.
    const sellerLookup = await app.inject({ method: "GET", url: `/matches/${offer.json().offerId}` });
    expect(sellerLookup.json().roomId).toBe(roomId);

    // Seller re-pulses after the match → SAME roomId.
    const pulse = await app.inject({ method: "POST", url: `/offers/${offer.json().offerId}/pulse` });
    expect(pulse.json().roomId).toBe(roomId);

    // Both role lookups agree.
    expect((await app.inject({ method: "GET", url: `/matches/${body.intentId}` })).json().roomId).toBe(roomId);
  });
});

describe("intake roomId isolation — simultaneous negotiations never cross", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp({ seedFixtures: false }); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it("roomA !== roomB, and each side only ever resolves its own room", async () => {
    // Negotiation A (buyer-first then seller).
    const intentARes = await app.inject({ method: "POST", url: "/intents", payload: intentA });
    const offerARes = await app.inject({ method: "POST", url: "/offers", payload: offerA });
    const roomA = offerARes.json().roomId;
    expect(offerARes.json().matched).toBe(true);

    // Negotiation B (seller-first then buyer).
    const offerBRes = await app.inject({ method: "POST", url: "/offers", payload: offerB });
    const intentBRes = await app.inject({ method: "POST", url: "/intents", payload: intentB });
    const roomB = intentBRes.json().roomId;
    expect(intentBRes.json().matched).toBe(true);

    expect(roomA).toBeTruthy();
    expect(roomB).toBeTruthy();
    expect(roomA).not.toBe(roomB);

    // Each negotiation resolves ONLY its own room from either role's id.
    expect((await app.inject({ method: "GET", url: `/matches/${intentARes.json().intentId}` })).json().roomId).toBe(roomA);
    expect((await app.inject({ method: "GET", url: `/matches/${offerARes.json().offerId}` })).json().roomId).toBe(roomA);
    expect((await app.inject({ method: "GET", url: `/matches/${intentBRes.json().intentId}` })).json().roomId).toBe(roomB);
    expect((await app.inject({ method: "GET", url: `/matches/${offerBRes.json().offerId}` })).json().roomId).toBe(roomB);
  });
});
