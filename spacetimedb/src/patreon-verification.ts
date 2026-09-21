import type { AvatarFrame } from "../../shared/avatar-frames";

type Resource = { id?: string; type?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: unknown }> };
const resource = (value: unknown): Resource => value && typeof value === "object" && !Array.isArray(value) ? value as Resource : {};
const relatedId = (value: unknown) => typeof resource(value).id === "string" ? resource(value).id : undefined;

/** A month, for a membership that reports a charge but no next charge date. */
export const PATREON_PAID_PERIOD_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * When the period this member has already paid for runs out. Patreon leaves a
 * cancelled pledge entitled until then, and so do we: the month is bought.
 * Falls back to a month past the last charge, then to nothing, so a response
 * without these fields still yields a usable membership.
 */
export function patreonPaidThroughMs(attributes: Record<string, unknown> | undefined) {
  const parse = (value: unknown) => {
    const parsed = typeof value === "string" ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const next = parse(attributes?.next_charge_date);
  if (next) return next;
  const last = parse(attributes?.last_charge_date);
  return last ? last + PATREON_PAID_PERIOD_MS : 0;
}

/** Require the authenticated user's membership in our exact campaign and tier.
 * Amount alone cannot distinguish a paid tier from a custom donation elsewhere. */
export function verifyPatreonIdentity(payload: unknown, config: { campaignId: string; silverTierId: string; goldTierId: string }, nowMs = Date.now()): { userId: string; tier: AvatarFrame; paidThroughMs: number } {
  const body = payload as { data?: unknown; included?: unknown[] } | null;
  const user = resource(body?.data);
  if (user.type !== "user" || !user.id || !/^\d+$/.test(user.id)) throw new Error("Invalid Patreon identity");
  const memberships = user.relationships?.memberships?.data;
  if (!Array.isArray(memberships)) throw new Error("Patreon membership permission is missing");
  const memberIds = new Set(memberships.map(relatedId));
  let tier: AvatarFrame = "none", paidThroughMs = 0;
  for (const value of body?.included ?? []) {
    const member = resource(value);
    if (member.type !== "member" || !memberIds.has(member.id) || relatedId(member.relationships?.campaign?.data) !== config.campaignId) continue;
    const attrs = member.attributes;
    if (attrs?.last_charge_status !== "Paid" || attrs.is_free_trial === true) continue;
    const through = patreonPaidThroughMs(attrs);
    // A cancelled pledge keeps what it paid for. Patreon usually leaves such a
    // member active until the period ends, but not every flow does, so honour
    // the paid-through date rather than the status alone.
    if (attrs.patron_status !== "active_patron" && !(through > nowMs)) continue;
    const entitled = member.relationships?.currently_entitled_tiers?.data;
    if (!Array.isArray(entitled)) continue;
    const tiers = new Set(entitled.map(relatedId));
    if (tiers.has(config.goldTierId)) { tier = "gold"; paidThroughMs = Math.max(paidThroughMs, through); }
    else if (tier !== "gold" && tiers.has(config.silverTierId)) { tier = "silver"; paidThroughMs = Math.max(paidThroughMs, through); }
  }
  return { userId: user.id, tier, paidThroughMs };
}
