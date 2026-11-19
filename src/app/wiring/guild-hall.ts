import { EMPTY_GUILD_HALL_LEVELS, guildHallMapId, isGuildHallMap, type GuildHallPart } from "../../../shared/guild-hall";
import { guildCrossingGuildId, guildCrossingMapId, type CrossingChoice, type GuildCrossingSnapshot } from "../../../shared/guild-crossing";
import type { GuildSnapshot } from "../../../shared/guilds";
import { guildEmblemFor } from "../../game/guild-emblems";
import { createGuildHallWindow } from "../../ui/guild-hall-window";
import type { MapId } from "../../game/world";
import { guildHallCameraRegion } from "../../game/guild-hall";
import type { Camera } from "../../game/runtime/render/camera";
import { createGuildHallRuntime, type GuildHallSource } from "../../game/runtime/guild-hall/guild-hall-runtime";
import { createGuildCrossingRuntime } from "../../game/runtime/guild-crossing/guild-crossing-runtime";

export type GuildHallCoop = GuildHallSource & {
  localIdentity?: () => string | undefined;
  upgradeGuildHall?: (part: GuildHallPart) => Promise<boolean>;
  guild?: {
    loadGuild: () => Promise<GuildSnapshot>;
    loadCrossing: () => Promise<GuildCrossingSnapshot | null>;
    stepCrossing: (expectedStep: number, side: CrossingChoice) => Promise<GuildCrossingSnapshot | null>;
  };
};

/**
 * Guild halls as the composition root sees them: the runtime that runs a hall,
 * and the Guild Hall window (its upgrade board inside, and the way in from Home
 * and the Guild window).
 */
export function createGuildHall(deps: Omit<Parameters<typeof createGuildHallRuntime>[0], "source" | "openBoard" | "loadEmblem"> & {
  source: () => GuildHallCoop | null | undefined;
  travel: (mapId: MapId) => Promise<boolean>;
  camera: Camera;
  showMessage?: (text: string, color?: string) => void;
}) {
  // In a hall the camera keeps to the player's side of its door: the wood outdoors, the great hall's dark indoors.
  deps.camera.keepTo = x => isGuildHallMap(deps.currentMapId()) ? guildHallCameraRegion(x) : null;
  let guild: { name: string; emblem?: number; canUpgrade: boolean } | null = null;
  async function loadGuild() {
    const snapshot = await deps.source()?.guild?.loadGuild();
    const me = deps.source()?.localIdentity?.() ?? "";
    const found = snapshot?.guild;
    guild = found ? { name: found.name, emblem: found.emblem, canUpgrade: found.leader === me || found.vicePresident === me } : null;
    return guild;
  }
  /** The player's own guild's hall map, or null without a guild. */
  const hallMap = () => {
    const id = deps.source()?.guildHall?.()?.guildId;
    return id ? guildHallMapId(id) as MapId : null;
  };
  const window = createGuildHallWindow({
    state: () => {
      const hall = deps.source()?.guildHall?.() ?? null;
      return { guild: hall ? guild : null, fund: hall?.fund ?? 0, levels: hall?.levels ?? EMPTY_GUILD_HALL_LEVELS, inHall: isGuildHallMap(deps.currentMapId()) };
    },
    refresh: async () => { await loadGuild(); },
    upgrade: async part => Boolean(await deps.source()?.upgradeGuildHall?.(part)),
    enter: async () => { const map = hallMap(); return map ? deps.travel(map) : false; },
    pause: () => {},
    clearInput: deps.clearInput,
  });
  const runtime = createGuildHallRuntime({
    ...deps,
    openBoard: () => window.open(),
    loadEmblem: async () => { const found = await loadGuild(); return found ? guildEmblemFor(found.name, found.emblem) : -1; },
  });
  const crossingRuntime = createGuildCrossingRuntime({
    source: deps.source,
    player: deps.player,
    currentMapId: deps.currentMapId,
    travel: deps.travel,
    clearInput: deps.clearInput,
    showMessage: deps.showMessage,
  });
  /** Enters the player's guild's playable Glass Crossing map, resolving the guild ID if needed. */
  async function enterCrossing(explicitGuildId?: string) {
    let id = explicitGuildId || deps.source()?.guildHall?.()?.guildId;
    if (!id) {
      const snap = await deps.source()?.guild?.loadGuild().catch(() => null);
      id = snap?.guild?.id;
    }
    return id ? deps.travel(guildCrossingMapId(id) as MapId) : false;
  }
  return {
    ...runtime,
    guildId: () => runtime.guildId() ?? guildCrossingGuildId(deps.currentMapId()),
    update(dt: number) { runtime.update(dt); crossingRuntime.update(dt); },
    hallMap,
    enterCrossing,
    openWindow: () => window.open(),
    refreshWindow: () => window.refresh(),
  };
}
