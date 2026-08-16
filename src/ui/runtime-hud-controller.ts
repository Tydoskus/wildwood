import type { PlayerState, RuntimeDuelReplay, RuntimeDuelState } from "../game/runtime/types";
import { createDuelResultStatRow } from "./duel-result";
import { renderPlayerHud } from "./hud";

type RuntimeHudElements = {
  message: HTMLElement;
  pickupLog: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  playerName: HTMLElement;
  playerPower: HTMLElement;
  coopStatus: HTMLElement;
  playerIcon: HTMLElement;
  duelControls: HTMLElement;
  duelStatus: HTMLElement;
  duelRequest: HTMLElement;
  duelAccept: HTMLElement;
  duelCountdown: HTMLElement;
  duelResult: HTMLElement;
  duelResultTitle: HTMLElement;
  duelResultStats: HTMLElement;
  watchDuelReplay: HTMLElement;
};

type RuntimeHudDependencies = {
  elements: RuntimeHudElements;
  player: PlayerState;
  activeDuel: () => RuntimeDuelState | null;
  duelOpponentName: (duel: RuntimeDuelState) => string;
  localDisplayName: () => string;
  localIdentity: () => string | undefined;
  isGuest: (identity: string | undefined) => boolean;
  remotePlayerCount: () => number;
  onlinePlayerCount: () => number | null;
  connected: () => boolean;
  isDeveloper: () => boolean;
  profileIcon: () => number;
  applyProfileIcon: (target: HTMLElement, icon: number) => void;
  playerPower: (player: PlayerState) => number;
  setDeveloperAccess: (enabled: boolean) => void;
  applyVitalityResearch: () => void;
  updateTechNotice: () => void;
  tickTechTree: (now: number) => void;
  refreshAppStatus: () => void;
  updateProfileDuelButton: () => void;
  pulseDuel: () => void;
};

/** Throttled HUD, temporary notifications, and duel status/result presentation. */
export function createRuntimeHudController(dependencies: RuntimeHudDependencies) {
  const { elements } = dependencies;
  let messageClock = 0;
  let nextHudUpdateAt = 0;

  function showMessage(text: string, color = "#fff") {
    elements.message.textContent = text;
    elements.message.style.color = color;
    elements.message.style.opacity = "1";
    messageClock = 1.45;
  }

  function updateMessage(dt: number) {
    if (messageClock <= 0) return;
    messageClock -= dt;
    if (messageClock <= 0) elements.message.style.opacity = "0";
  }

  function logPickup(text: string, color: string) {
    const entry = document.createElement("div");
    entry.className = "pickup";
    entry.textContent = text;
    entry.style.color = color;
    elements.pickupLog.appendChild(entry);
    setTimeout(() => entry.remove(), 2400);
  }

  function clearTransientUi() {
    messageClock = 0;
    elements.message.style.opacity = "0";
    elements.pickupLog.replaceChildren();
  }

  function showDuelResult(replay: RuntimeDuelReplay | null) {
    if (!replay) return;
    const localName = dependencies.localDisplayName() || "PLAYER";
    const selfIsChallenger = replay.challengerName === localName;
    const self = selfIsChallenger
      ? { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked }
      : { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked };
    const other = selfIsChallenger
      ? { name: replay.opponentName, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked }
      : { name: replay.challengerName, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked };
    const won = replay.winnerName === localName;
    elements.duelResultTitle.textContent = replay.winnerName === "DRAW" ? "DUEL DRAW" : won ? "YOU WON" : "YOU LOST";
    elements.duelResultStats.replaceChildren(
      createDuelResultStatRow("YOU", self),
      createDuelResultStatRow(other.name, other),
    );
    elements.duelResult.hidden = false;
    elements.duelResult.dataset.replayId = String(replay.id);
    elements.watchDuelReplay.hidden = false;
  }

  function showDuelResultUnavailable() {
    elements.duelResultTitle.textContent = "DUEL COMPLETE";
    const unavailable = document.createElement("div");
    unavailable.className = "duel-stat-row";
    unavailable.textContent = "RESULT DETAILS UNAVAILABLE";
    elements.duelResultStats.replaceChildren(unavailable);
    elements.duelResult.hidden = false;
    elements.duelResult.dataset.replayId = "0";
    elements.watchDuelReplay.hidden = true;
  }

  function updateDuelControls() {
    const duel = dependencies.activeDuel();
    elements.duelStatus.hidden = false;
    elements.duelRequest.hidden = true;
    elements.duelAccept.hidden = true;
    dependencies.updateProfileDuelButton();

    if ((duel?.status === "active" || duel?.status === "finishing") && Date.now() >= duel.endsAtMs) dependencies.pulseDuel();

    if (duel?.status === "countdown") {
      const remaining = Math.max(0, Math.ceil((duel.startsAtMs - Date.now()) / 1000));
      elements.duelStatus.textContent = "DUEL STARTING";
      setDuelCountdown(remaining);
      elements.duelControls.hidden = false;
      return;
    }
    elements.duelCountdown.hidden = true;
    if (duel?.status === "active") {
      const remaining = Math.max(0, Math.ceil((duel.endsAtMs - Date.now()) / 1000));
      elements.duelStatus.textContent = `DUEL · ${dependencies.duelOpponentName(duel)} · ${remaining}s`;
      elements.duelControls.hidden = false;
      return;
    }
    if (duel?.status === "finishing") {
      elements.duelStatus.textContent = "DUEL COMPLETE";
      elements.duelControls.hidden = false;
      return;
    }
    elements.duelControls.hidden = true;
  }

  function setDuelCountdown(countdown: number) {
    elements.duelCountdown.textContent = String(countdown || "");
    elements.duelCountdown.hidden = !countdown;
  }

  function updateHud(force = false) {
    const now = performance.now();
    if (!force && now < nextHudUpdateAt) return;
    nextHudUpdateAt = now + 100;
    dependencies.applyVitalityResearch();
    dependencies.updateTechNotice();
    const remoteCount = dependencies.remotePlayerCount();
    const reportedOnline = dependencies.onlinePlayerCount();
    const playerCount = dependencies.connected()
      ? (Number.isFinite(reportedOnline) ? reportedOnline ?? remoteCount + 1 : remoteCount + 1)
      : 0;
    const developer = dependencies.isDeveloper();
    dependencies.applyProfileIcon(elements.playerIcon, dependencies.profileIcon());
    dependencies.setDeveloperAccess(developer);
    const identity = dependencies.localIdentity();
    const displayName = dependencies.localDisplayName() || "WANDERER";
    renderPlayerHud(
      { hpFill: elements.hpFill, hpText: elements.hpText, playerName: elements.playerName, playerPower: elements.playerPower, coopStatus: elements.coopStatus },
      dependencies.player,
      dependencies.isGuest(identity) ? `${displayName} (guest)` : displayName,
      playerCount,
      dependencies.playerPower(dependencies.player),
      developer,
    );
    updateDuelControls();
    dependencies.refreshAppStatus();
    dependencies.tickTechTree(now);
  }

  return {
    clearTransientUi,
    logPickup,
    setDuelCountdown,
    showDuelResult,
    showDuelResultUnavailable,
    showMessage,
    updateDuelControls,
    updateHud,
    updateMessage,
  };
}
