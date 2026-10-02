/**
 * Whether chat shows the time beside each name (Settings > Game > Chat
 * Timestamps). Off by default; tapping a message still shows its full date.
 */
let enabled = false;
const listeners = new Set<() => void>();
export const chatTimestampsEnabled = () => enabled;
export function setChatTimestampsEnabled(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  for (const listener of listeners) listener();
}
export function onChatTimestampsChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
