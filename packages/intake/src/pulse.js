/**
 * PulseService — the seller "presence pulse".
 *
 * For every offer with pulseMinutes > 0, re-assert it as ACTIVE on its interval
 * and immediately run the matchmaker so a buyer that arrived in the meantime is
 * matched without waiting for the next POST. This is the server side of the
 * "offer stays alive and more likely to be answered" behavior; a seller agent
 * can also pulse manually via POST /offers/:id/pulse.
 *
 * Env:
 *   PULSE_ENABLED=1        enable the automatic server-side pulse (default off)
 *   DEFAULT_PULSE_MINUTES  default pulse interval when an offer omits it (145)
 */
export class PulseService {
    store;
    matchmaker;
    timers = new Map();
    defaultMinutes;
    enabled;
    constructor(store, matchmaker, opts = {}) {
        this.store = store;
        this.matchmaker = matchmaker;
        this.enabled = opts.enabled ?? process.env.PULSE_ENABLED === "1";
        this.defaultMinutes = opts.defaultMinutes ?? Number(process.env.DEFAULT_PULSE_MINUTES ?? 145);
    }
    /** Register an offer for pulsing. Called after POST /offers. */
    register(offerId, pulseMinutes) {
        const o = this.store.getOffer(offerId);
        if (!o)
            return;
        const minutes = pulseMinutes ?? o.pulseMinutes ?? this.defaultMinutes;
        if (!this.enabled || minutes <= 0)
            return;
        this.clear(offerId);
        const ms = Math.max(1000, minutes * 60_000);
        const t = setInterval(() => {
            if (!this.store.pulseOffer(offerId)) {
                this.clear(offerId);
                return;
            }
            // Re-run the matchmaker on each pulse so a newly arrived buyer matches.
            this.matchmaker.onOffer(offerId);
            console.log(`[pulse] offer ${offerId} re-asserted active (every ${minutes}m)`);
        }, ms);
        this.timers.set(offerId, t);
    }
    clear(offerId) {
        const t = this.timers.get(offerId);
        if (t)
            clearInterval(t);
        this.timers.delete(offerId);
    }
    stopAll() {
        for (const t of this.timers.values())
            clearInterval(t);
        this.timers.clear();
    }
}
