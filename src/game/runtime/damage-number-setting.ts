/**
 * Whether damage numbers pop up over what is hit (Settings > Game > Damage
 * Numbers). On by default; off, no new ones spawn.
 */
let enabled = true;
export const damageNumbersEnabled = () => enabled;
export function setDamageNumbersEnabled(next: boolean) { enabled = next; }
