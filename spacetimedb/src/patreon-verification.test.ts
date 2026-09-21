import { describe, expect, it } from "vitest";
import { verifyPatreonIdentity, patreonPaidThroughMs, PATREON_PAID_PERIOD_MS } from "./patreon-verification";
const config = { campaignId: "10", silverTierId: "20", goldTierId: "30" };
function payload(tier = "20", campaign = "10", patron = "active_patron", paid = "Paid") {
  return { data: { id: "1", type: "user", relationships: { memberships: { data: [{ type: "member", id: "2" }] } } }, included: [{
    id: "2", type: "member", attributes: { patron_status: patron, last_charge_status: paid },
    relationships: { campaign: { data: { id: campaign } }, currently_entitled_tiers: { data: [{ id: tier }] } },
  }] };
}
describe("Patreon frame verification", () => {
  it("matches the authenticated user's exact campaign and paid tier", () => {
    expect(verifyPatreonIdentity(payload(), config)).toEqual({ userId: "1", tier: "silver", paidThroughMs: 0 });
    expect(verifyPatreonIdentity(payload("30"), config).tier).toBe("gold");
    expect(verifyPatreonIdentity(payload("30", "999"), config).tier).toBe("none");
    const unrelated = payload(); unrelated.data.relationships.memberships.data[0].id = "other";
    expect(verifyPatreonIdentity(unrelated, config).tier).toBe("none");
  });
  it.each(["Declined", "Pending", "Refunded", "Fraud", "Deleted"])("does not grant access for a %s charge", charge => {
    expect(verifyPatreonIdentity(payload("30", "10", "active_patron", charge), config).tier).toBe("none");
  });
  it("rejects former, free, and trial memberships", () => {
    expect(verifyPatreonIdentity(payload("30", "10", "former_patron"), config).tier).toBe("none");
    expect(verifyPatreonIdentity(payload("unknown"), config).tier).toBe("none");
    const trial = payload(); Object.assign(trial.included[0].attributes, { is_free_trial: true });
    expect(verifyPatreonIdentity(trial, config).tier).toBe("none");
  });
  it("fails closed if identity or membership permissions are missing", () => {
    expect(() => verifyPatreonIdentity({}, config)).toThrow();
    expect(() => verifyPatreonIdentity({ data: { id: "1", type: "user" } }, config)).toThrow();
  });
});

describe("a membership that has already been paid for", () => {
  const dated = (attributes: Record<string, unknown>, patron = "active_patron") => {
    const body = payload("30", "10", patron); Object.assign(body.included[0].attributes, attributes); return body;
  };
  const now = Date.parse("2026-09-20T00:00:00Z");

  it("runs to the next charge date, so a supporter keeps their frame while offline", () => {
    const through = Date.parse("2026-10-04T00:00:00Z");
    expect(verifyPatreonIdentity(dated({ next_charge_date: "2026-10-04T00:00:00.000+00:00" }), config, now))
      .toMatchObject({ tier: "gold", paidThroughMs: through });
  });

  it("keeps a cancelled pledge until the month it bought runs out", () => {
    const cancelled = dated({ next_charge_date: "2026-10-04T00:00:00.000+00:00" }, "former_patron");
    expect(verifyPatreonIdentity(cancelled, config, now).tier).toBe("gold");
    // The day after the period ends, the entitlement is over.
    expect(verifyPatreonIdentity(cancelled, config, Date.parse("2026-10-05T00:00:00Z")).tier).toBe("none");
  });

  it("falls back to a month past the last charge when there is no next one", () => {
    const last = Date.parse("2026-09-10T00:00:00Z");
    expect(patreonPaidThroughMs({ last_charge_date: "2026-09-10T00:00:00.000+00:00" })).toBe(last + PATREON_PAID_PERIOD_MS);
    expect(patreonPaidThroughMs({ next_charge_date: "not a date", last_charge_date: "2026-09-10T00:00:00.000+00:00" }))
      .toBe(last + PATREON_PAID_PERIOD_MS);
  });

  it("reports nothing rather than guessing when Patreon sends no dates", () => {
    expect(patreonPaidThroughMs(undefined)).toBe(0);
    expect(patreonPaidThroughMs({})).toBe(0);
    expect(verifyPatreonIdentity(payload("30"), config, now).paidThroughMs).toBe(0);
  });

  it("still refuses an unpaid charge however far the dates reach", () => {
    expect(verifyPatreonIdentity(dated({ next_charge_date: "2026-10-04T00:00:00.000+00:00", last_charge_status: "Refunded" }), config, now).tier).toBe("none");
  });
});
