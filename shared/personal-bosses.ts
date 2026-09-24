import { runtimeMapBalance } from "./map-balance-runtime";
import * as rules from "./rules";
import { generateMap, generatedBossStats, isProceduralMap } from "./procedural-maps";

const BOSSES: Record<string, { kind: string; hp: number }> = {
  tutorial_forest: { kind: "dragon", hp: rules.DRAGON_MAX_HP },
  beginner_desert: { kind: "spider", hp: rules.SPIDER_MAX_HP },
  intermediate_snowlands: { kind: "frostclaw", hp: rules.FROSTCLAW_MAX_HP },
  advanced_lava_wastes: { kind: "magmalisk", hp: rules.MAGMALISK_MAX_HP },
  infernal_depths: { kind: "gloomroot", hp: rules.GLOOMROOT_MAX_HP },
  water_reach: { kind: "tidewyrm", hp: rules.TIDEWYRM_MAX_HP },
  samurai_garden: { kind: "koiShogun", hp: rules.KOI_SHOGUN_MAX_HP },
  cloudspire: { kind: "tempestKirin", hp: rules.TEMPEST_KIRIN_MAX_HP },
  moonfen: { kind: "miremaw", hp: rules.MIREMAW_MAX_HP },
  crystal_hollows: { kind: "prismshell", hp: rules.PRISMSHELL_MAX_HP },
  clockwork_ruins: { kind: "ironhorn", hp: rules.IRONHORN_MAX_HP },
  duskfall_orchard: { kind: "dreadreaper", hp: rules.DREADREAPER_MAX_HP },
  neon_bastion: { kind: "voltwarden", hp: rules.VOLTWARDEN_MAX_HP },
  verdant_catacombs: { kind: "gravebloom", hp: rules.GRAVEBLOOM_MAX_HP },
  ion_citadel: { kind: "aegisPrime", hp: rules.AEGIS_PRIME_MAX_HP },
};
export function personalBossDefinition(mapId: string, authored = false) {
  const remote = !authored && runtimeMapBalance(mapId)?.boss;
  if (remote) return { kind: remote.kind, hp: remote.hp, respawnSeconds: remote.respawnSeconds };
  if (isProceduralMap(mapId)) return { kind: "procedural", hp: generatedBossStats(generateMap(mapId)).hp, respawnSeconds: 60 };
  const boss = BOSSES[mapId];
  return boss ? { ...boss, respawnSeconds: rules.BOSS_RESPAWN_SECONDS } : null;
}
export function bossMapForKind(kind: string) { return Object.keys(BOSSES).find(mapId => BOSSES[mapId].kind === kind) ?? ""; }
