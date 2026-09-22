import { BLACK_BOOTS, BLACK_BOOTS_SPEED_BONUS } from "../../../shared/items";

/**
 * Black Boots are a flat bonus now, not an out-of-combat one. The old version
 * switched the bonus off for five seconds after every hit, so a player fighting
 * their way across a map changed speed constantly and each change was another
 * movement packet the server had to take and validate. Duels keep their own
 * footing, so the arena still runs at the researched speed.
 */
export function createOutOfCombatSpeed() {
  return {
    bonus(feet: string, dueling = false) {
      return feet === BLACK_BOOTS && !dueling ? BLACK_BOOTS_SPEED_BONUS : 0;
    },
  };
}
