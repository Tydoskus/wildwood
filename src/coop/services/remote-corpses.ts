import type { RemotePlayer, RemotePlayerDeath } from "../contracts";
import { PLAYER_DEATH_REMOTE_HOLD_MS } from "../../game/runtime/player-death-animation";

/** Render-only snapshots: respawns, equipment changes and interest eviction cannot erase a body. */
export function createRemoteCorpses() {
  const bodies = new Map<string, { player: RemotePlayer & { identity: string; skinTone?: number }; death: RemotePlayerDeath }>();
  let sequence = 0;
  function prune(now: number) {
    for (const [key, body] of bodies) {
      if (now - body.death.startedAtMs > PLAYER_DEATH_REMOTE_HOLD_MS) bodies.delete(key);
    }
  }
  return {
    add(player: RemotePlayer, death: RemotePlayerDeath, skinTone?: number) {
      prune(death.startedAtMs);
      const id = `corpse:${++sequence}:${player.id}`;
      bodies.set(id, {
        player: { ...player, skinTone, id, identity: player.id, x: death.x, y: death.y, facing: death.facing,
          moving: false, regularEnemyCombat: undefined, throwClock: undefined },
        death: { ...death, id },
      });
    },
    players(mapId: string, now: number) {
      prune(now);
      return [...bodies.values()].filter((body) => body.death.mapId === mapId).map((body) => body.player);
    },
    death(id: string, mapId: string, now: number) {
      const body = bodies.get(id);
      if (body && now - body.death.startedAtMs > PLAYER_DEATH_REMOTE_HOLD_MS) { bodies.delete(id); return null; }
      return body?.death.mapId === mapId ? body.death : null;
    },
    clear: () => bodies.clear(),
  };
}
