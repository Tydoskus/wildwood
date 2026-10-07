import { EMPTY_GUILD_HALL_LEVELS, guildHallMapId, isGuildHallMap, type GuildHallPart } from "../../../shared/guild-hall";
import type { GuildSnapshot } from "../../../shared/guilds";
import { guildEmblemFor } from "../../ui/guild-emblems";
import { createGuildHallWindow } from "../../ui/guild-hall-window";
import type { MapId } from "../world";
import { createGuildHallRuntime, type GuildHallSource } from "./guild-hall-runtime";

export type GuildHallCoop = GuildHallSource & {
  localIdentity?: () => string | undefined;
  upgradeGuildHall?: (part: GuildHallPart) => Promise<boolean>;
  guild?: { loadGuild: () => Promise<GuildSnapshot> };
};

/**
 * Guild halls as the composition root sees them: the runtime that runs a hall,
 * and the Guild Hall window (its upgrade board inside, and the way in from Home
 * and the Guild window).
 */
export function createGuildHall(deps: Omit<Parameters<typeof createGuildHallRuntime>[0], "source" | "openBoard" | "loadEmblem"> & {
  source: () => GuildHallCoop | null | undefined;
  travel: (mapId: MapId) => Promise<boolean>;
}) {
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
  return { ...runtime, hallMap, openWindow: () => window.open(), refreshWindow: () => window.refresh() };
}
