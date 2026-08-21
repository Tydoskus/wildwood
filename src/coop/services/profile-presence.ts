export function resolvePlayerPresenceMap(
  identity: string,
  localIdentity: string,
  localMapId: string | null | undefined,
  profileMaps: ReadonlyMap<string, string>,
  nearbyMaps: ReadonlyMap<string, string>,
) {
  if (identity === localIdentity) return localMapId ?? null;
  return profileMaps.get(identity) ?? nearbyMaps.get(identity) ?? null;
}

type IdentityLookup = {
  has(identity: string): boolean;
};

export function shouldRetainProfilePresentation(
  identity: string,
  activeMotionIdentities: IdentityLookup,
  leaderboardEntries: IdentityLookup,
  chatMessages: readonly { sender: string }[],
) {
  return activeMotionIdentities.has(identity)
    || leaderboardEntries.has(identity)
    || chatMessages.some((message) => message.sender === identity);
}
