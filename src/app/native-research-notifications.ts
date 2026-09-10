export type ResearchNotification = {
  owner: string; researchId: string; title: string; targetRank: number; completesAtMs: number;
};
export type ResearchNotificationBridge = {
  sync: (research: ResearchNotification | null) => Promise<void>;
};
function bridge() {
  if (typeof window === 'undefined') return undefined;
  const runtime = window as unknown as { WILDSTAT_NATIVE_PREVIEW?: boolean; wildstatResearchNotifications?: ResearchNotificationBridge };
  return runtime.WILDSTAT_NATIVE_PREVIEW ? runtime.wildstatResearchNotifications : undefined;
}
export function syncResearchNotification(research: ResearchNotification | null) {
  // Notification failures must never prevent server research or account actions.
  try { return bridge()?.sync(research).catch(() => {}) ?? Promise.resolve(); }
  catch { return Promise.resolve(); }
}
