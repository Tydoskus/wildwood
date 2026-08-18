import { describe, expect, it } from "vitest";
import { createDuelPresentation } from "./duel-presentation";
import { createDuelSessionController } from "./duel-session-controller";
import type { RuntimeDuelState } from "./types";

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
});
