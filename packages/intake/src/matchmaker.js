const WS_URL = process.env.WS_URL ?? "ws://localhost:3002";
function buildDetails(intent, offer) {
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
    store;
    constructor(store) {
        this.store = store;
    }
    // Called after an intent is added. If a compatible offer exists, open a room.
    onIntent(intentId) {
        const intent = this.store.getIntent(intentId);
        if (!intent)
            return { matched: false };
        const hit = this.store.findMatchForIntent(intent);
        if (!hit)
            return { matched: false };
        const room = this.store.createRoom(intentId, hit.offerId);
        return {
            matched: true,
            roomId: room.roomId,
            wssUrl: `${WS_URL}/negotiate/${room.roomId}`,
            match: buildDetails(intent, hit.offer),
        };
    }
    // Called after an offer is added. If a compatible intent exists, open a room.
    onOffer(offerId) {
        const offer = this.store.getOffer(offerId);
        if (!offer)
            return { matched: false };
        const hit = this.store.findMatchForOffer(offer);
        if (!hit)
            return { matched: false };
        const room = this.store.createRoom(hit.intentId, offerId);
        return {
            matched: true,
            roomId: room.roomId,
            wssUrl: `${WS_URL}/negotiate/${room.roomId}`,
            match: buildDetails(hit.intent, offer),
        };
    }
    // Lookup an existing match for an intent or offer id.
    lookup(id) {
        const room = this.store.findRoomByIntent(id) ?? this.store.findRoomByOffer(id);
        if (!room)
            return { matched: false };
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
