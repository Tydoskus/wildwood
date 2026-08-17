import type { DuelScene, RuntimeDuelReplay, RuntimeDuelState } from "./types";

type PlayerTarget = { id: string; name: string; x: number; y: number };

export function createDuelSessionController(hooks: {
  activeDuel: () => RuntimeDuelState | null;
  isDueling: () => boolean;
  isReplayActive: () => boolean;
  isDuelResultHeld: () => boolean;
  showDuelResult: (replay: RuntimeDuelReplay | null) => void;
  showDuelResultUnavailable: () => void;
  fadeToWorld: (onBlack: () => void) => void;
  leaveDuelResult: () => void;
  isRunning: () => boolean;
  isProfileOpen: () => boolean;
  camera: () => { x: number; y: number; zoom: number };
  player: () => { x: number; y: number };
  renderedDuelScene: () => DuelScene | null;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  remotePlayers: () => PlayerTarget[];
  playerDisplayName: (identity: string) => string | undefined;
  publicPlayerName: (identity: string | undefined, name: string | undefined) => string;
  openProfile: (identity: string, name: string) => void;
}) {
  function openPlayerAtScreenPoint(clientX: number, clientY: number) {
    if (!hooks.isRunning() || hooks.isProfileOpen()) return false;
    const camera = hooks.camera();
    const worldX = camera.x + clientX / camera.zoom;
    const worldY = camera.y + clientY / camera.zoom;
    const isPlayerProfileHit = (dx: number, dy: number) =>
      (Math.abs(dx) <= 48 && dy >= -60 && dy <= 60)
      || (Math.abs(dx) <= 125 && dy >= -105 && dy < -45);
    if (hooks.isDueling() || hooks.isReplayActive()) {
      const duelScene = hooks.renderedDuelScene();
      const duelTarget = [duelScene?.challenger, duelScene?.opponent]
        .filter((actor): actor is DuelScene["challenger"] => Boolean(actor?.identity))
        .find((actor) => isPlayerProfileHit(worldX - actor.x, worldY - actor.y));
      if (!duelTarget?.identity) return false;
      hooks.openProfile(duelTarget.identity, duelTarget.name);
      return true;
    }
    let target: PlayerTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const localIdentity = hooks.localIdentity();
    if (localIdentity) {
      const player = hooks.player();
      const dx = worldX - player.x;
      const dy = worldY - player.y;
      if (isPlayerProfileHit(dx, dy)) {
        target = { id: localIdentity, name: hooks.localDisplayName() || "PLAYER", x: player.x, y: player.y };
        bestDistance = dx * dx + dy * dy;
      }
    }
    for (const other of hooks.remotePlayers()) {
      const dx = worldX - other.x;
      const dy = worldY - other.y;
      if (!isPlayerProfileHit(dx, dy)) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        target = other;
        bestDistance = distance;
      }
    }
    if (!target) return false;
    hooks.openProfile(target.id, target.name);
    return true;
  }

  function duelOpponentName(duel: RuntimeDuelState) {
    const opponentId = duel.challenger === hooks.localIdentity() ? duel.opponent : duel.challenger;
    const opponent = hooks.remotePlayers().find((other) => other.id === opponentId);
    const frozenName = duel.challenger === hooks.localIdentity() ? duel.opponentName : duel.challengerName;
    const name = frozenName || opponent?.name || hooks.playerDisplayName(opponentId) || "OPPONENT";
    return hooks.publicPlayerName(opponentId, name);
  }

  return {
    activeDuel: hooks.activeDuel,
    isDueling: hooks.isDueling,
    isArenaScene: () => hooks.isDueling() || hooks.isDuelResultHeld() || hooks.isReplayActive(),
    showDuelResult: hooks.showDuelResult,
    showDuelResultUnavailable: hooks.showDuelResultUnavailable,
    fadeToWorld: hooks.fadeToWorld,
    leaveDuelResult: hooks.leaveDuelResult,
    openPlayerAtScreenPoint,
    duelOpponentName,
  };
}
