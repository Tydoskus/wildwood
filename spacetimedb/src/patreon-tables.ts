import { table, t } from "spacetimedb/server";

// OAuth credentials and membership identifiers never enter public subscriptions.
export const patreonTables = {
  patreonPreview: table({ name: "patreon_preview", public: false }, {
    identity: t.identity().primaryKey(), frame: t.string(),
  }),
  patreonConfig: table({ name: "patreon_config", public: false }, {
    id: t.u8().primaryKey(), clientId: t.string(), clientSecret: t.string(),
    campaignId: t.string(), silverTierId: t.string(), goldTierId: t.string(), redirectUri: t.string(),
    // Appended last with a default: a column may only be added at the end of an
    // existing table, and doing so disconnects every client. Empty means the tier
    // is not offered yet, which no real entitlement can match.
    diamondTierId: t.string().default(""),
  }),
  patreonLink: table({ name: "patreon_link", public: false }, {
    identity: t.identity().primaryKey(), userId: t.string(), accessToken: t.string(), refreshToken: t.string(),
    tier: t.string(), frame: t.string(), validUntilMs: t.f64(), checkedAtMs: t.f64(), attemptedAtMs: t.f64(),
  }),
  patreonOwner: table({ name: "patreon_owner", public: false }, {
    userId: t.string().primaryKey(), identity: t.identity(),
  }),
  patreonPending: table({ name: "patreon_pending", public: false }, {
    state: t.string().primaryKey(), identity: t.identity().unique(), expiresAtMs: t.f64(),
  }),
  patreonAnnouncement: table({ name: "patreon_announcement", public: false }, {
    userId: t.string().primaryKey(), identity: t.identity(),
    silverAnnounced: t.bool(), goldAnnounced: t.bool(), messageId: t.u64(), announcedAtMs: t.f64(),
  }),
};
