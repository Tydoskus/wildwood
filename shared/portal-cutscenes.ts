/** Stable cutscene IDs; historical browser keys are retained as wire IDs only. */
export const PORTAL_CUTSCENES = [
  { id: "wildwood-dragon-portal-cutscene-v2", unlock: "desertUnlocked" },
  { id: "wildwood-snowlands-portal-cutscene-v1", unlock: "snowlandsUnlocked" },
  { id: "wildwood-lava-portal-cutscene-v1", unlock: "lavaUnlocked" },
  { id: "wildwood-infernal-portal-cutscene-v1", unlock: "infernalUnlocked" },
  { id: "wildwood-water-portal-cutscene-v1", unlock: "waterUnlocked" },
  { id: "wildwood-samurai-portal-cutscene-v1", unlock: "samuraiUnlocked" },
] as const;

export type PortalUnlockProgress = Partial<Record<(typeof PORTAL_CUTSCENES)[number]["unlock"] | "cloudspireUnlocked" | "moonfenUnlocked" | "crystalHollowsUnlocked" | "clockworkRuinsUnlocked" | "duskfallOrchardUnlocked", boolean>>;
export function portalCutsceneBit(id: string) {
  const index = PORTAL_CUTSCENES.findIndex((scene) => scene.id === id);
  return index < 0 ? 0 : 1 << index;
}

/** Used once for pre-existing characters, never on each progress update. */
export function unlockedPortalCutsceneMask(progress: PortalUnlockProgress | null | undefined) {
  if (!progress) return 0;
  if (progress.cloudspireUnlocked || progress.moonfenUnlocked || progress.crystalHollowsUnlocked || progress.clockworkRuinsUnlocked || progress.duskfallOrchardUnlocked) return 63;
  let mask = 0;
  PORTAL_CUTSCENES.forEach((scene, index) => {
    if (progress[scene.unlock]) mask |= (1 << (index + 1)) - 1;
  });
  return mask;
}
