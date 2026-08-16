import {
  DUEL_ARENA,
  DUEL_COMBAT_Y,
  DUEL_REPLAY_COUNTDOWN_SECONDS,
  DUEL_SHOT_LIFETIME,
  DUEL_SHOT_SPEED,
  duelShotsAt,
  duelTimelineState,
  replayState,
} from "../duel";
import type { DuelPresentation, DuelScene, ReplayMode, RuntimeDuelReplay, RuntimeDuelState } from "./types";

type RemotePlayer = { id: string; name: string };

export type DuelPresentationHooks = {
  activeDuel: () => RuntimeDuelState | null;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  remotePlayers: () => RemotePlayer[];
  playerDisplayName: (identity: string) => string | undefined;
  pulseDuel: () => void;
  spawnDamageNumber: (x: number, y: number, damage: number) => void;
  setReplayTitle: (title: string) => void;
  now: () => number;
  nowMs: () => number;
};

export function createDuelPresentation(hooks: DuelPresentationHooks) {
  let livePresentation: DuelPresentation | null = null;
  let replayMode: ReplayMode | null = null;

  function activeDuel() {
    return hooks.activeDuel();
  }

  function isDueling() {
    const duel = activeDuel();
    if (!duel || !["countdown", "active", "finishing"].includes(duel.status)) return false;
    if ((duel.status === "active" || duel.status === "finishing") && hooks.nowMs() >= duel.endsAtMs) hooks.pulseDuel();
    return true;
  }

  function liveDuelPresentationState(duel: RuntimeDuelState) {
    const durationSeconds = Math.max(0, (duel.endsAtMs - duel.startsAtMs) / 1000);
    const elapsed = Math.max(0, Math.min(durationSeconds, (hooks.nowMs() - duel.startsAtMs) / 1000));
    const state = duelTimelineState(duel, elapsed);
    return { elapsed, state };
  }

  function syncLiveDamageNumbers(duel: RuntimeDuelState) {
    const presentation = liveDuelPresentationState(duel);
    const previous = livePresentation?.id === duel.id
      ? livePresentation
      : { id: duel.id, elapsed: 0, challengerHp: duel.challengerMaxHp, opponentHp: duel.opponentMaxHp };
    if (presentation.elapsed >= previous.elapsed) {
      const challengerDamage = previous.challengerHp - presentation.state.challengerHp;
      const opponentDamage = previous.opponentHp - presentation.state.opponentHp;
      if (challengerDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
    }
    livePresentation = {
      id: duel.id,
      elapsed: presentation.elapsed,
      challengerHp: presentation.state.challengerHp,
      opponentHp: presentation.state.opponentHp,
    };
    return presentation;
  }

  function timelineDuelShots(
    duel: RuntimeDuelState | RuntimeDuelReplay,
    elapsed: number,
    limits: Pick<RuntimeDuelState, "challengerAttacks" | "opponentAttacks">,
  ) {
    return duelShotsAt({
      challengerAttackRate: duel.challengerAttackRate,
      opponentAttackRate: duel.opponentAttackRate,
      challengerAttacks: limits.challengerAttacks,
      opponentAttacks: limits.opponentAttacks,
    }, elapsed, {
      shotLifetime: DUEL_SHOT_LIFETIME,
      shotSpeed: DUEL_SHOT_SPEED,
      challengerFromX: DUEL_ARENA.x - 120,
      opponentFromX: DUEL_ARENA.x + 120,
      y: DUEL_COMBAT_Y,
    });
  }

  function liveScene() {
    const duel = activeDuel();
    if (!duel) return null;
    const presentation = liveDuelPresentationState(duel);
    const localId = hooks.localIdentity();
    const remoteName = (identity: string) => {
      const visible = hooks.remotePlayers().find((other) => other.id === identity)?.name;
      return visible || hooks.playerDisplayName(identity) || "OPPONENT";
    };
    const actor = (identity: string, isChallenger: boolean): DuelScene["challenger"] => ({
      identity,
      x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
      y: DUEL_COMBAT_Y,
      name: identity === localId ? (hooks.localDisplayName() || "PLAYER") : remoteName(identity),
      hp: duel.status === "finishing"
        ? isChallenger ? duel.challengerHp : duel.opponentHp
        : isChallenger ? presentation.state.challengerHp : presentation.state.opponentHp,
      maxHp: isChallenger ? duel.challengerMaxHp : duel.opponentMaxHp,
      facing: isChallenger ? 0 : Math.PI,
      isLocal: identity === localId,
      headItem: isChallenger ? duel.challengerHeadItem : duel.opponentHeadItem,
      chestItem: isChallenger ? duel.challengerChestItem : duel.opponentChestItem,
      feetItem: isChallenger ? duel.challengerFeetItem : duel.opponentFeetItem,
      rightHandItem: isChallenger ? duel.challengerRightHandItem : duel.opponentRightHandItem,
      leftHandItem: isChallenger ? duel.challengerLeftHandItem : duel.opponentLeftHandItem,
    });
    return {
      challenger: actor(duel.challenger, true),
      opponent: actor(duel.opponent, false),
      shots: timelineDuelShots(duel, presentation.elapsed, presentation.state),
      countdown: hooks.nowMs() < duel.startsAtMs
        ? Math.max(1, Math.ceil((duel.startsAtMs - hooks.nowMs()) / 1000))
        : 0,
    } satisfies DuelScene;
  }

  function startReplay(replay: RuntimeDuelReplay) {
    replayMode = {
      replay,
      start: hooks.now(),
      lastElapsed: 0,
      lastState: {
        challengerHp: replay.challengerMaxHp,
        opponentHp: replay.opponentMaxHp,
      },
    };
    hooks.setReplayTitle(`${replay.challengerName} VS ${replay.opponentName}`);
  }

  function replayScene() {
    if (!replayMode) return null;
    const replay = replayMode.replay;
    const totalElapsed = Math.max(0, (hooks.now() - replayMode.start) / 1000);
    const countdown = Math.max(0, Math.ceil(DUEL_REPLAY_COUNTDOWN_SECONDS - totalElapsed));
    const elapsed = Math.min(replay.durationSeconds, Math.max(0, totalElapsed - DUEL_REPLAY_COUNTDOWN_SECONDS));
    const state = replayState(replay, elapsed);
    if (elapsed >= replayMode.lastElapsed) {
      const challengerDamage = replayMode.lastState.challengerHp - state.challengerHp;
      const opponentDamage = replayMode.lastState.opponentHp - state.opponentHp;
      if (challengerDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x - 120, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + 120, DUEL_COMBAT_Y, opponentDamage);
    }
    replayMode.lastElapsed = elapsed;
    replayMode.lastState = { challengerHp: state.challengerHp, opponentHp: state.opponentHp };
    const actor = (isChallenger: boolean): DuelScene["challenger"] => ({
      identity: isChallenger ? replay.challengerIdentity : replay.opponentIdentity,
      x: DUEL_ARENA.x + (isChallenger ? -120 : 120),
      y: DUEL_COMBAT_Y,
      name: isChallenger ? replay.challengerName : replay.opponentName,
      hp: isChallenger ? state.challengerHp : state.opponentHp,
      maxHp: isChallenger ? replay.challengerMaxHp : replay.opponentMaxHp,
      facing: isChallenger ? 0 : Math.PI,
      isLocal: false,
      headItem: isChallenger ? replay.challengerHeadItem : replay.opponentHeadItem,
      chestItem: isChallenger ? replay.challengerChestItem : replay.opponentChestItem,
      feetItem: isChallenger ? replay.challengerFeetItem : replay.opponentFeetItem,
      rightHandItem: isChallenger ? replay.challengerRightHandItem : replay.opponentRightHandItem,
      leftHandItem: isChallenger ? replay.challengerLeftHandItem : replay.opponentLeftHandItem,
    });
    hooks.setReplayTitle(countdown > 0
      ? `${replay.challengerName} VS ${replay.opponentName}`
      : `${replay.challengerName} VS ${replay.opponentName} · ${elapsed.toFixed(1)} / ${replay.durationSeconds.toFixed(1)}s`);
    return {
      challenger: actor(true),
      opponent: actor(false),
      shots: countdown > 0 ? [] : timelineDuelShots(replay, elapsed, replay),
      countdown,
    } satisfies DuelScene;
  }

  return {
    activeDuel,
    isDueling,
    isReplayActive: () => replayMode !== null,
    clearReplay: () => { replayMode = null; },
    resetLivePresentation: () => { livePresentation = null; },
    liveDuelPresentationState,
    syncLiveDamageNumbers,
    liveScene,
    startReplay,
    replayScene,
  };
}
