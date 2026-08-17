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
