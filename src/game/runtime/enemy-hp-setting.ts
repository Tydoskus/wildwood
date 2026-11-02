/**
 * Whether enemy health bars carry their numbers (Settings > Game > Enemy HP
 * Numbers). On by default; off, bars are slim pills, and on they grow to
 * fit the "440 / 500".
 */
let enabled = true;
export const enemyHpNumbersEnabled = () => enabled;
export function setEnemyHpNumbersEnabled(next: boolean) { enabled = next; }
