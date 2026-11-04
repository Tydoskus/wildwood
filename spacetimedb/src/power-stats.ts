// Power's effective stats from the rows a caller has read: player-power.ts powerFieldsForProgress and the kill
// reducer's rewarded row (boss-combat.ts powerFields) both price power here, so they write the same number.
import { legacyU32Power, playerPowerForStats, preparePlayerPowerStats, type PlayerPowerStats } from "../../shared/player-power";
import type { CardTotals } from "../../shared/card-effects";
import { weaponRatings, type ItemLevel } from "../../shared/items";
import type { PrestigePerkRanks } from "../../shared/prestige-perks";
import type { SoulStats } from "../../shared/soul-dimension";
import type { AttackCapArg } from "../../shared/stat-rating";
import { withSoulStats } from "./soul-dimension";
import { critPowerFrom } from "./crit-power";

/** What power reads besides the run's own stats: the soul and its cap, and the research, perks and cards in play. */
export type PowerParts = {
  soul: SoulStats | null; cap: AttackCapArg; research: any; perks: PrestigePerkRanks; cards: CardTotals;
  itemLevel: (itemId: string) => ItemLevel;
  /** The saved crit rating, for a row without one. */
  critRating: () => number;
};

/** Power's effective stats, crits counted. `prepared` reuses gear factors a caller has for the same loadout, research and cards. */
export function powerStatsFrom(parts: PowerParts, prepared?: (progress: PlayerPowerStats) => PlayerPowerStats) {
  const crit = critPowerFrom(parts);
  return (progress: any) => {
    // The crit multiplier with the weapon's rating, as the gear factors give attack speed.
    const weapon = progress.equippedRightHand || progress.equippedLeftHand || "";
    const rating = (progress.critRating ?? parts.critRating()) + (weapon ? weaponRatings(weapon, parts.itemLevel(weapon)).crit : 0);
    return (prepared ?? preparePlayerPowerStats(progress, parts.research, parts.itemLevel, parts.cards, parts.cap))(
      { ...withSoulStats(progress, parts.soul, parts.cap), ...crit(rating) });
  };
}

/** The power fields written to the player row. */
export function powerFieldsFromStats(stats: PlayerPowerStats) {
  const powerLevel = playerPowerForStats(stats);
  return { power: legacyU32Power(powerLevel), powerLevel };
}
