/**
 * Whether enemy health bars carry their numbers (Settings > Game > Enemy HP
 * Numbers). Off by default: bars are slim pills; on, they grow to fit the
 * "440 / 500" the bars used to show.
 */
let enabled = false;
export const enemyHpNumbersEnabled = () => enabled;
export function setEnemyHpNumbersEnabled(next: boolean) { enabled = next; }
