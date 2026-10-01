/**
 * Whether the stat gain pop-ups show (Settings > Game > Stat Gain Popups).
 * Set from the toggle on load and on each change; the HUD asks before each
 * pop-up. Other pick-up messages are unaffected.
 */
let enabled = true;
export const statPopupsEnabled = () => enabled;
export function setStatPopupsEnabled(next: boolean) { enabled = next; }
