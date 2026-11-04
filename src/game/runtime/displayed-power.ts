import { equipComparisonPower } from "../../../shared/equip-best";
import type { InventoryState } from "../inventory";
import type { CoopAccess } from "./coop-access";
import { displayedPlayerPowerProgress } from "./render/player-identity-renderer";
import type { createResearchController } from "./research-controller";
import type { PlayerState } from "./types";
import { createPowerJumpWatch, type PowerBase } from "./power-jump";

type Research = Pick<ReturnType<typeof createResearchController>, "ranks" | "criticalChance" | "criticalDamageMultiplier">;

/**
 * The local player's power with some equipment, as the HUD shows it, or with `compare`
 * the unrounded figure Equip Best ranks gear by, bow skills included.
 */
export function createDisplayedPower(deps: {
  coop: CoopAccess;
  player: PlayerState;
  research: () => Research;
  soulCritDamage: () => number;
}) {
  const { coop, player } = deps;
  const playerBase = (): PowerBase => ({ maxHp: player.baseMaxHp, damage: player.damage, attackRate: player.attackRate, armor: player.armor, regen: player.regen });
  function powerForEquipment(equipment: InventoryState, compare = false, base = playerBase()) {
    const research = deps.research();
    const power = equipComparisonPower(
      displayedPlayerPowerProgress({
        ...base,
        critChance: research.criticalChance(),
        // The crit rating of the weapon being priced, not the one in hand.
        critMultiplier: research.criticalDamageMultiplier(deps.soulCritDamage(), undefined, equipment.equippedRightHand || equipment.equippedLeftHand),
      }, {
        equippedHead: equipment.equippedHead,
        equippedChest: equipment.equippedChest,
        equippedFeet: equipment.equippedFeet,
        equippedRightHand: equipment.equippedRightHand,
        equippedLeftHand: equipment.equippedLeftHand,
        ...(compare ? {} : { activeCards: coop.client?.activeCardIds?.() }),
      }),
      research.ranks(),
      coop.itemLevel,
      compare ? coop.weaponSkills : undefined,
      coop.attackCap(),
    );
    return compare ? power : Math.round(power);
  }
  /** Rises in the HUD's power that an upgrade made rather than kills (power-jump.ts). */
  const watchJumps = (equipment: InventoryState) => createPowerJumpWatch(base => powerForEquipment(equipment, false, base), playerBase);
  return Object.assign(powerForEquipment, { watchJumps });
}
