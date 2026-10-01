import { mergePrestigeChallenges } from "./prestige-challenge";
import { PRESTIGE_PERK_IDS, prestigePerkMaxRank, type PrestigePerkRanks } from "../../shared/prestige-perks";
import { writePrestigePerkRanks } from "./prestige";

/** Move permanent prestige credit when a guest save is claimed by an account. */
export function mergeLinkedPrestige(ctx: any, guest: any, account: any) {
  mergePrestigeChallenges(ctx, guest, account);
  // The free respec belongs to the account: the guest's use of it goes with the guest.
  if (ctx.db.playerFreeRespec.identity.find(guest)) ctx.db.playerFreeRespec.identity.delete(guest);
  const guestPrestige = ctx.db.playerPrestige.identity.find(guest);
  const accountPrestige = ctx.db.playerPrestige.identity.find(account);
  if (guestPrestige) {
    const merged = {
      ...guestPrestige,
      identity: account,
      level: guestPrestige.level + (accountPrestige?.level ?? 0),
      perkPoints: guestPrestige.perkPoints + (accountPrestige?.perkPoints ?? 0),
      peakPower: Math.max(guestPrestige.peakPower, accountPrestige?.peakPower ?? 0),
      prestigedAt: accountPrestige?.prestigedAt?.microsSinceUnixEpoch > guestPrestige.prestigedAt.microsSinceUnixEpoch
        ? accountPrestige.prestigedAt : guestPrestige.prestigedAt,
    };
    if (accountPrestige) ctx.db.playerPrestige.identity.update(merged);
    else ctx.db.playerPrestige.insert(merged);
    ctx.db.playerPrestige.identity.delete(guest);
  }

  const guestOriginal = ctx.db.playerPrestigePerk.identity.find(guest);
  const guestExpansion = ctx.db.playerPrestigeExpansionPerk.identity.find(guest);
  if (!guestOriginal && !guestExpansion) return;
  const guestPerks = { ...guestOriginal, ...guestExpansion };
  const accountPerks = { ...ctx.db.playerPrestigePerk.identity.find(account), ...ctx.db.playerPrestigeExpansionPerk.identity.find(account) };
  const mergedPerks = {} as PrestigePerkRanks;
  let refundedPoints = 0;
  // Challenges merged first, so Reflect's cap reflects the wins of both saves.
  const wins = ctx.db.playerPrestigeChallenge.identity.find(account)?.completed ?? 0;
  for (const perk of PRESTIGE_PERK_IDS) {
    const total = (guestPerks[perk] ?? 0) + (accountPerks?.[perk] ?? 0);
    mergedPerks[perk] = Math.min(prestigePerkMaxRank(perk, wins), total);
    refundedPoints += Math.max(0, total - prestigePerkMaxRank(perk, wins));
  }
  writePrestigePerkRanks(ctx, account, mergedPerks);
  if (guestOriginal) ctx.db.playerPrestigePerk.identity.delete(guest);
  if (guestExpansion) ctx.db.playerPrestigeExpansionPerk.identity.delete(guest);
  if (refundedPoints) {
    const prestige = ctx.db.playerPrestige.identity.find(account);
    if (prestige) ctx.db.playerPrestige.identity.update({ ...prestige, perkPoints: prestige.perkPoints + refundedPoints });
  }
}
