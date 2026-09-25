import { showDuelSkillEffects, type DuelSkillEffects } from "./duel-skill-effects";
import { duelAttackDelays, duelPositionsAt, duelWeapon } from "../../../shared/duel-approach";
import { duelHitMultiplier } from "../../../shared/duel-combat";
import {
  DUEL_ARENA,
  DUEL_COMBAT_Y,
  DUEL_REPLAY_COUNTDOWN_SECONDS,
  DUEL_SHOT_LIFETIME,
  DUEL_SHOT_SPEED,
  duelAttackAnimationClock,
  duelShotsAt,
  duelTimelineState,
  replayState,
} from "../duel";
import type { DuelPresentation, DuelScene, ReplayMode, RuntimeDuelReplay, RuntimeDuelState } from "./types";
import type { PlayerGender } from "../../../shared/player-gender";

type RemotePlayer = { id: string; name: string };

export type DuelReplayTitle = {
  challengerIdentity?: string;
  opponentIdentity?: string;
  challengerName: string;
  challengerGender: PlayerGender;
  opponentName: string;
  opponentGender: PlayerGender;
  detail?: string;
};

export type DuelPresentationHooks = {
  skillEffects?: DuelSkillEffects;
  activeDuel: () => RuntimeDuelState | null;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  remotePlayers: () => RemotePlayer[];
  playerDisplayName: (identity: string) => string | undefined;
  pulseDuel: () => void;
  spawnDamageNumber: (x: number, y: number, damage: number) => void;
  setReplayTitle: (title: DuelReplayTitle) => void;
  now: () => number;
  nowMs: () => number;
};

export function createDuelPresentation(hooks: DuelPresentationHooks) {
  let livePresentation: DuelPresentation | null = null;
  let liveDeaths: {
    id: bigint;
    challengerStartedAtMs?: number;
    opponentStartedAtMs?: number;
  } | null = null;
  let replayMode: ReplayMode | null = null;
  let liveTimelineCache: {
    duel: RuntimeDuelState;
    elapsed: number;
    state: ReturnType<typeof duelTimelineState>;
  } | null = null;

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
    // Damage numbers and rendering can request the same snapshot in one frame.
    // A new server snapshot or any clock movement invalidates this one-entry cache.
    if (liveTimelineCache?.duel === duel && liveTimelineCache.elapsed === elapsed) return liveTimelineCache;
    const state = duelTimelineState(duel, elapsed);
    liveTimelineCache = { duel, elapsed, state };
    return liveTimelineCache;
  }

  function syncLiveDamageNumbers(duel: RuntimeDuelState) {
    const presentation = liveDuelPresentationState(duel);
    const previous = livePresentation?.id === duel.id
      ? livePresentation
      : { id: duel.id, elapsed: 0, challengerHp: duel.challengerMaxHp, opponentHp: duel.opponentMaxHp };
    showDuelSkillEffects(duel, previous.elapsed, presentation.elapsed, presentation.state, hooks.skillEffects);
    if (presentation.elapsed >= previous.elapsed) {
      const challengerDamage = presentation.state.opponentDamageDealt - (previous.opponentDamageDealt ?? 0);
      const opponentDamage = presentation.state.challengerDamageDealt - (previous.challengerDamageDealt ?? 0);
      const positions = duelPositionsAt(duel, presentation.state.resolvedSeconds);
      if (challengerDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + positions.challengerX, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + positions.opponentX, DUEL_COMBAT_Y, opponentDamage);
    }
    livePresentation = {
      id: duel.id,
      elapsed: presentation.elapsed,
      challengerDamageDealt: presentation.state.challengerDamageDealt,
      opponentDamageDealt: presentation.state.opponentDamageDealt,
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
    const positions = duelPositionsAt(duel, elapsed);
    return duelShotsAt({
      challengerAttackRate: duel.challengerAttackRate,
      opponentAttackRate: duel.opponentAttackRate,
      challengerAttacks: limits.challengerAttacks,
      opponentAttacks: limits.opponentAttacks,
    }, elapsed, {
      shotLifetime: DUEL_SHOT_LIFETIME,
      shotSpeed: DUEL_SHOT_SPEED,
      challengerFromX: DUEL_ARENA.x + positions.challengerX,
      opponentFromX: DUEL_ARENA.x + positions.opponentX,
      y: DUEL_COMBAT_Y,
      challengerWeaponItem: duelWeapon(duel, true),
      opponentWeaponItem: duelWeapon(duel, false),
    });
  }

  function liveScene() {
    const duel = activeDuel();
    if (!duel) return null;
    const presentation = liveDuelPresentationState(duel);
    const finished = duel.status === "finishing";
    if (liveDeaths?.id !== duel.id) liveDeaths = { id: duel.id };
    if (finished) {
      const now = hooks.now();
      if (duel.challengerHp <= 0 && liveDeaths.challengerStartedAtMs === undefined) {
        liveDeaths.challengerStartedAtMs = now;
      }
      if (duel.opponentHp <= 0 && liveDeaths.opponentStartedAtMs === undefined) {
        liveDeaths.opponentStartedAtMs = now;
      }
    }
    const positions = duelPositionsAt(duel, presentation.state.resolvedSeconds);
    const delays = duelAttackDelays(duel);
    const combatOver = finished || presentation.state.challengerHp <= 0 || presentation.state.opponentHp <= 0;
    const localId = hooks.localIdentity();
    const remoteName = (identity: string) => {
      const visible = hooks.remotePlayers().find((other) => other.id === identity)?.name;
      return visible || hooks.playerDisplayName(identity) || "OPPONENT";
    };
    const actor = (identity: string, isChallenger: boolean): DuelScene["challenger"] => {
      const facing = isChallenger ? 0 : Math.PI;
      const hp = finished
        ? isChallenger ? duel.challengerHp : duel.opponentHp
        : isChallenger ? presentation.state.challengerHp : presentation.state.opponentHp;
      return {
        identity,
        x: DUEL_ARENA.x + (isChallenger ? positions.challengerX : positions.opponentX),
        moving: !combatOver && (isChallenger ? positions.challengerMoving : positions.opponentMoving),
        y: DUEL_COMBAT_Y,
        name: (isChallenger ? duel.challengerName : duel.opponentName)
          || (identity === localId ? (hooks.localDisplayName() || "PLAYER") : remoteName(identity)),
        gender: isChallenger ? duel.challengerGender : duel.opponentGender,
        hp,
        maxHp: isChallenger ? duel.challengerMaxHp : duel.opponentMaxHp,
        deathStartedAtMs: hp <= 0
          ? isChallenger ? liveDeaths?.challengerStartedAtMs : liveDeaths?.opponentStartedAtMs
          : undefined,
        facing,
        combatFacing: facing,
        throwClock: combatOver || (isChallenger ? positions.challengerMoving : positions.opponentMoving) ? 0 : duelAttackAnimationClock(
          isChallenger ? duel.challengerAttackRate : duel.opponentAttackRate,
          isChallenger ? presentation.state.challengerAttacks : presentation.state.opponentAttacks,
          presentation.elapsed,
          isChallenger ? duelWeapon(duel, true) : duelWeapon(duel, false),
          isChallenger ? delays.challenger : delays.opponent,
        ),
        isLocal: identity === localId,
        headItem: isChallenger ? duel.challengerHeadItem : duel.opponentHeadItem,
        chestItem: isChallenger ? duel.challengerChestItem : duel.opponentChestItem,
        feetItem: isChallenger ? duel.challengerFeetItem : duel.opponentFeetItem,
        rightHandItem: isChallenger ? duel.challengerRightHandItem : duel.opponentRightHandItem,
        leftHandItem: isChallenger ? duel.challengerLeftHandItem : duel.opponentLeftHandItem,
      };
    };
    return {
      hitMultiplier: duelHitMultiplier(presentation.elapsed, duel.combatVersion),
      challenger: actor(duel.challenger, true),
      opponent: actor(duel.opponent, false),
      shots: combatOver ? [] : timelineDuelShots(duel, presentation.elapsed, presentation.state),
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
    hooks.setReplayTitle({
      challengerIdentity: replay.challengerIdentity,
      opponentIdentity: replay.opponentIdentity,
      challengerName: replay.challengerName,
      challengerGender: replay.challengerGender,
      opponentName: replay.opponentName,
      opponentGender: replay.opponentGender,
    });
  }

  function replayScene() {
    if (!replayMode) return null;
    const replay = replayMode.replay;
    const totalElapsed = Math.max(0, (hooks.now() - replayMode.start) / 1000);
    const countdown = Math.max(0, Math.ceil(DUEL_REPLAY_COUNTDOWN_SECONDS - totalElapsed));
    const elapsed = Math.min(replay.durationSeconds, Math.max(0, totalElapsed - DUEL_REPLAY_COUNTDOWN_SECONDS));
    const state = replayState(replay, elapsed);
    const finished = countdown === 0 && elapsed >= replay.durationSeconds;
    const positions = duelPositionsAt(replay, state.resolvedSeconds);
    const delays = duelAttackDelays(replay);
    const combatOver = finished || state.challengerHp <= 0 || state.opponentHp <= 0;
    if (finished) {
      const now = hooks.now();
      if (state.challengerHp <= 0 && replayMode.challengerDeathStartedAtMs === undefined) {
        replayMode.challengerDeathStartedAtMs = now;
      }
      if (state.opponentHp <= 0 && replayMode.opponentDeathStartedAtMs === undefined) {
        replayMode.opponentDeathStartedAtMs = now;
      }
    }
    showDuelSkillEffects(replay, replayMode.lastElapsed, elapsed, state, hooks.skillEffects);
    if (elapsed >= replayMode.lastElapsed) {
      const challengerDamage = state.opponentDamageDealt - (replayMode.lastState.opponentDamageDealt ?? 0);
      const opponentDamage = state.challengerDamageDealt - (replayMode.lastState.challengerDamageDealt ?? 0);
      if (challengerDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + positions.challengerX, DUEL_COMBAT_Y, challengerDamage);
      if (opponentDamage > .01) hooks.spawnDamageNumber(DUEL_ARENA.x + positions.opponentX, DUEL_COMBAT_Y, opponentDamage);
    }
    replayMode.lastElapsed = elapsed;
    replayMode.lastState = state;
    const actor = (isChallenger: boolean): DuelScene["challenger"] => {
      const facing = isChallenger ? 0 : Math.PI;
      return {
        identity: isChallenger ? replay.challengerIdentity : replay.opponentIdentity,
        x: DUEL_ARENA.x + (isChallenger ? positions.challengerX : positions.opponentX),
        moving: !combatOver && (isChallenger ? positions.challengerMoving : positions.opponentMoving),
        y: DUEL_COMBAT_Y,
        name: isChallenger ? replay.challengerName : replay.opponentName,
        gender: isChallenger ? replay.challengerGender : replay.opponentGender,
        hp: isChallenger ? state.challengerHp : state.opponentHp,
        maxHp: isChallenger ? replay.challengerMaxHp : replay.opponentMaxHp,
        deathStartedAtMs: isChallenger
          ? replayMode?.challengerDeathStartedAtMs
          : replayMode?.opponentDeathStartedAtMs,
        facing,
        combatFacing: facing,
        throwClock: combatOver || (isChallenger ? positions.challengerMoving : positions.opponentMoving) ? 0 : duelAttackAnimationClock(
          isChallenger ? replay.challengerAttackRate : replay.opponentAttackRate,
          isChallenger ? state.challengerAttacks : state.opponentAttacks,
          elapsed,
          isChallenger ? duelWeapon(replay, true) : duelWeapon(replay, false),
          isChallenger ? delays.challenger : delays.opponent,
        ),
        isLocal: false,
        headItem: isChallenger ? replay.challengerHeadItem : replay.opponentHeadItem,
        chestItem: isChallenger ? replay.challengerChestItem : replay.opponentChestItem,
        feetItem: isChallenger ? replay.challengerFeetItem : replay.opponentFeetItem,
        rightHandItem: isChallenger ? replay.challengerRightHandItem : replay.opponentRightHandItem,
        leftHandItem: isChallenger ? replay.challengerLeftHandItem : replay.opponentLeftHandItem,
      };
    };
    hooks.setReplayTitle({
      challengerIdentity: replay.challengerIdentity,
      opponentIdentity: replay.opponentIdentity,
      challengerName: replay.challengerName,
      challengerGender: replay.challengerGender,
      opponentName: replay.opponentName,
      opponentGender: replay.opponentGender,
      detail: countdown > 0 ? undefined : `${elapsed.toFixed(1)} / ${replay.durationSeconds.toFixed(1)}s${(replay.combatVersion ?? 0) >= 1 && elapsed > 10 ? " · ESCALATION" : ""}`,
    });
    return {
      hitMultiplier: duelHitMultiplier(elapsed, replay.combatVersion),
      challenger: actor(true),
      opponent: actor(false),
      shots: countdown > 0 || combatOver ? [] : timelineDuelShots(replay, elapsed, replay),
      countdown,
    } satisfies DuelScene;
  }

  return {
    activeDuel,
    isDueling,
    isReplayActive: () => replayMode !== null,
    clearReplay: () => { replayMode = null; },
    resetLivePresentation: () => {
      livePresentation = null;
      liveDeaths = null;
    },
    liveDuelPresentationState,
    syncLiveDamageNumbers,
    liveScene,
    startReplay,
    replayScene,
  };
}
