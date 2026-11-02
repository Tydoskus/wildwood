/**
 * Whether your own name, power and health bar show over your character
 * (Settings > Game > Show My Name Plate). On by default; the top-left card
 * already shows them. Other players' plates and duels always show.
 */
let enabled = true;
export const ownNamePlateEnabled = () => enabled;
export function setOwnNamePlateEnabled(next: boolean) { enabled = next; }
