import type { createGameElements } from "../../ui/game-elements";
import type { createCombatEffects } from "../../game/runtime/combat-effects";
import type { CoopAccess } from "../../game/runtime/coop-access";
import type { createGameSessionController } from "../../game/runtime/game-session-controller";
import type { PlayerController } from "../../game/runtime/player-controller";
import type { createCamera } from "../../game/runtime/render/camera";
import type { DuelScene, PlayerState } from "../../game/runtime/types";
import { createDuelRuntime } from "../../game/runtime/duel/duel-runtime";
import { createDuelSessionController } from "../../game/runtime/duel/duel-session-controller";

type DuelRuntime = ReturnType<typeof createDuelRuntime>;
type GameSession = Pick<ReturnType<typeof createGameSessionController>, "fadeToWorld" | "leaveDuelResult" | "isRunning">;
type DuelSessionHooks = Parameters<typeof createDuelSessionController>[0];

export type DuelSessionDeps = {
  coop: CoopAccess;
  camera: ReturnType<typeof createCamera>;
  player: PlayerState;
  profileElement: HTMLElement;
  renderedDuelScene: () => DuelScene | null;
  /** Systems created after the duel session, read once a duel or a tap needs them. */
  later: {
    duelRuntime: () => DuelRuntime;
    playerController: () => Pick<PlayerController, "isDuelResultHeld">;
    session: () => GameSession;
    showDuelResult: DuelSessionHooks["showDuelResult"];
    showDuelResultUnavailable: DuelSessionHooks["showDuelResultUnavailable"];
    selfProfileTapEnabled: () => boolean;
    publicPlayerName: DuelSessionHooks["publicPlayerName"];
    openProfile: DuelSessionHooks["openProfile"];
  };
};

/** Whether the player is in a duel or watching one, its result screen, and tapping a player to open their profile. */
export function createDuelSession(deps: DuelSessionDeps) {
  const { coop, later } = deps;
  return createDuelSessionController({
    activeDuel: () => later.duelRuntime().activeDuel(),
    isDueling: () => later.duelRuntime().isDueling(),
    isReplayActive: () => later.duelRuntime().isReplayActive(),
    isDuelResultHeld: () => later.playerController().isDuelResultHeld(),
    showDuelResult: replay => later.showDuelResult(replay),
    showDuelResultUnavailable: () => later.showDuelResultUnavailable(),
    fadeToWorld: onBlack => later.session().fadeToWorld(onBlack),
    leaveDuelResult: () => later.session().leaveDuelResult(),
    isRunning: () => later.session().isRunning(),
    isProfileOpen: () => !deps.profileElement.hidden,
    camera: () => deps.camera,
    player: () => deps.player,
    renderedDuelScene: deps.renderedDuelScene,
    localIdentity: coop.localIdentity,
    localDisplayName: coop.localDisplayName,
    selfProfileTapEnabled: () => later.selfProfileTapEnabled(),
    remotePlayers: coop.remotePlayers,
    playerDisplayName: coop.playerDisplayName,
    publicPlayerName: (identity, name) => later.publicPlayerName(identity, name),
    openProfile: (identity, name) => later.openProfile(identity, name),
  });
}

export type DuelPlaybackDeps = {
  coop: CoopAccess;
  e: Pick<ReturnType<typeof createGameElements>, "duelReplayTitle" | "duelResultEl" | "duelReplayEl" | "duelCountdownEl">;
  effects: ReturnType<typeof createCombatEffects>;
  prepareArena: () => Promise<void>;
  resizeViewport: () => void;
  showMessage: (text: string, color: string) => void;
  session: () => Pick<GameSession, "fadeToWorld">;
  playerController: () => Pick<PlayerController, "isDuelResultHeld">;
};

/** A live duel's arena and damage numbers, and duel replays. */
export function createDuelPlayback(deps: DuelPlaybackDeps) {
  const { coop, effects } = deps;
  const client = coop.client;
  return createDuelRuntime({
    activeDuel: () => client && typeof client.localDuel === "function" ? client.localDuel() : null,
    localIdentity: coop.localIdentity,
    localDisplayName: coop.localDisplayName,
    remotePlayers: coop.remotePlayers,
    playerDisplayName: coop.playerDisplayName,
    pulseDuel: () => client?.pulseDuel?.(),
    spawnDamageNumber: effects.spawnDamageNumber, skillEffects: effects,
    prepareArena: deps.prepareArena,
    loadReplay: async replayId => client?.loadDuelReplay
      ? await client.loadDuelReplay(replayId)
      : client?.duelReplay?.(replayId),
    clearDamageNumbers: effects.clearDamageNumbers,
    showMessage: deps.showMessage,
    fadeToWorld: onBlack => deps.session().fadeToWorld(onBlack),
    isDuelResultHeld: () => deps.playerController().isDuelResultHeld(),
    now: () => performance.now(),
    nowMs: () => Date.now(),
    replayTitle: deps.e.duelReplayTitle,
    resizeViewport: deps.resizeViewport,
    duelResult: deps.e.duelResultEl,
    duelReplay: deps.e.duelReplayEl,
    duelCountdown: deps.e.duelCountdownEl,
  });
}
