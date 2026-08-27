import { describe, expect, it } from "vitest";
import { createDuelPresentation } from "./duel-presentation";
import { createDuelSessionController } from "./duel-session-controller";
import type { RuntimeDuelReplay, RuntimeDuelState } from "./types";

const duel: RuntimeDuelState = {
  id: 1n,
  challenger: "challenger-id",
  opponent: "opponent-id",
  challengerName: "Skittle",
  opponentName: "Uncletaco",
  challengerGender: 1,
  opponentGender: 2,
  status: "active",
  createdAtMs: 0,
  startsAtMs: 0,
  startedAtMs: 0,
  endsAtMs: 30_000,
  challengerHp: 100,
  challengerMaxHp: 100,
  challengerDamage: 10,
  challengerArmor: 0,
  challengerAttackRate: 1,
  challengerRegen: 0,
  challengerAttacks: 1,
  opponentHp: 100,
  opponentMaxHp: 100,
  opponentDamage: 10,
  opponentArmor: 0,
  opponentAttackRate: 1,
  opponentRegen: 0,
  opponentAttacks: 1,
  challengerHeadItem: "",
  challengerChestItem: "",
  challengerFeetItem: "",
  challengerRightHandItem: "",
  challengerLeftHandItem: "",
  opponentHeadItem: "",
  opponentChestItem: "",
  opponentFeetItem: "",
  opponentRightHandItem: "",
  opponentLeftHandItem: "",
};

const replay: RuntimeDuelReplay = {
  id: 2n,
  challengerIdentity: duel.challenger,
  opponentIdentity: duel.opponent,
  challengerName: duel.challengerName,
  opponentName: duel.opponentName,
  challengerGender: duel.challengerGender,
  opponentGender: duel.opponentGender,
  winnerName: "DRAW",
  durationSeconds: 1,
  challengerMaxHp: 100,
  challengerDamage: 100,
  challengerArmor: 0,
  challengerAttackRate: 1,
  challengerRegen: 0,
  challengerFinalHp: 0,
  challengerAttacks: 1,
  challengerDamageDealt: 100,
  challengerRegened: 0,
  challengerBlocked: 0,
  opponentMaxHp: 100,
  opponentDamage: 100,
  opponentArmor: 0,
  opponentAttackRate: 1,
  opponentRegen: 0,
  opponentFinalHp: 0,
  opponentAttacks: 1,
  opponentDamageDealt: 100,
  opponentRegened: 0,
  opponentBlocked: 0,
  challengerHeadItem: "",
  challengerChestItem: "",
  challengerFeetItem: "",
  challengerRightHandItem: "",
  challengerLeftHandItem: "",
  opponentHeadItem: "",
  opponentChestItem: "",
  opponentFeetItem: "",
  opponentRightHandItem: "",
  opponentLeftHandItem: "",
};

function presentationWithClocks(activeDuel: () => RuntimeDuelState | null, clocks: { frame: number; wall: number }) {
  return createDuelPresentation({
    activeDuel,
    localIdentity: () => duel.challenger,
    localDisplayName: () => duel.challengerName,
    remotePlayers: () => [],
    playerDisplayName: () => undefined,
    pulseDuel: () => {},
    spawnDamageNumber: () => {},
    setReplayTitle: () => {},
    now: () => clocks.frame,
    nowMs: () => clocks.wall,
  });
}

describe("live duel identity presentation", () => {
  it("uses names frozen into the duel instead of generated profile fallbacks", () => {
    const presentation = createDuelPresentation({
      activeDuel: () => duel,
      localIdentity: () => duel.challenger,
      localDisplayName: () => "Generated Local 123",
      remotePlayers: () => [],
      playerDisplayName: () => "Generated Remote 456",
      pulseDuel: () => {},
      spawnDamageNumber: () => {},
      setReplayTitle: () => {},
      now: () => 1_000,
      nowMs: () => 1_000,
    });

    expect(presentation.liveScene()).toMatchObject({
      challenger: { name: "Skittle", gender: 1 },
      opponent: { name: "Uncletaco", gender: 2 },
    });
  });

  it("uses the frozen opponent name in the live duel HUD", () => {
    const session = createDuelSessionController({
      activeDuel: () => duel,
      isDueling: () => true,
      isReplayActive: () => false,
      isDuelResultHeld: () => false,
      showDuelResult: () => {},
      showDuelResultUnavailable: () => {},
      fadeToWorld: () => {},
      leaveDuelResult: () => {},
      isRunning: () => true,
      isProfileOpen: () => false,
      camera: () => ({ x: 0, y: 0, zoom: 1 }),
      player: () => ({ x: 0, y: 0 }),
      renderedDuelScene: () => null,
      localIdentity: () => duel.challenger,
      localDisplayName: () => duel.challengerName,
      remotePlayers: () => [],
      playerDisplayName: () => "Generated Remote 456",
      publicPlayerName: (_identity, name) => name || "PLAYER",
      openProfile: () => {},
    });

    expect(session.duelOpponentName(duel)).toBe("Uncletaco");
  });

  it("clears live projectiles and starts a stable death animation on the finishing frame", () => {
    const clocks = { frame: 125, wall: 1_000 };
    const finishingDuel: RuntimeDuelState = {
      ...duel,
      status: "finishing",
      challengerHp: 0,
      opponentHp: 100,
    };
    const presentation = presentationWithClocks(() => finishingDuel, clocks);

    const firstScene = presentation.liveScene();
    expect(firstScene?.shots).toEqual([]);
    expect(firstScene?.challenger).toMatchObject({ hp: 0, throwClock: 0, deathStartedAtMs: 125 });
    expect(firstScene?.opponent.deathStartedAtMs).toBeUndefined();

    clocks.frame = 225;
    expect(presentation.liveScene()?.challenger.deathStartedAtMs).toBe(125);
  });

  it("clears terminal replay projectiles and keeps the defeated actor animating", () => {
    const clocks = { frame: 0, wall: 0 };
    const presentation = presentationWithClocks(() => null, clocks);
    presentation.startReplay(replay);

    clocks.frame = 4_000;
    const terminalScene = presentation.replayScene();
    expect(terminalScene?.shots).toEqual([]);
    expect(terminalScene?.challenger).toMatchObject({ hp: 0, throwClock: 0, deathStartedAtMs: 4_000 });
    expect(terminalScene?.opponent).toMatchObject({ hp: 0, throwClock: 0, deathStartedAtMs: 4_000 });

    clocks.frame = 5_000;
    const heldScene = presentation.replayScene();
    expect(heldScene?.challenger.deathStartedAtMs).toBe(4_000);
    expect(heldScene?.opponent.deathStartedAtMs).toBe(4_000);
    expect(heldScene?.shots).toEqual([]);
  });
});
