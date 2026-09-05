import type { PlayerState, RuntimeDuelReplay, RuntimeDuelState } from "../game/runtime/types";
import { createDuelResultStatRow } from "./duel-result";
import { renderPlayerHud } from "./hud";
import { appendPlayerGenderIcon } from "./player-gender";
import {
  createItemDropReveal,
  ITEM_DROP_REVEAL_DURATION_MS,
  type ItemDropRevealDetails,
} from "./item-drop-reveal";
import {
  createStatRewardToast,
  formatStatRewardToastAmount,
  statRewardToastModel,
} from "./stat-reward-toast";
import type { PlayerGender } from "../../shared/player-gender";

type RuntimeHudElements = {
  message: HTMLElement;
  pickupLog: HTMLElement;
  itemDropReveal: HTMLElement;
  hpFill: HTMLElement;
  hpText: HTMLElement;
  playerName: HTMLElement;
  playerPower: HTMLElement;
  coopStatus: HTMLElement;
  minimapPlayers: HTMLElement;
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
  playerGender: (identity: string | undefined) => PlayerGender;
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

type ActiveStatReward = {
  entry: HTMLElement;
  total: number;
  fadeTimer: number;
  removeTimer: number;
};

/** Throttled HUD, temporary notifications, and duel status/result presentation. */
export function createRuntimeHudController(dependencies: RuntimeHudDependencies) {
  const { elements } = dependencies;
  let messageClock = 0;
  let nextHudUpdateAt = 0;
  const itemDropQueue: ItemDropRevealDetails[] = [];
  let itemDropActive = false;
  let itemDropTimer: number | null = null;
  const activeStatRewards = new Map<string, ActiveStatReward>();

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

  function refreshStatRewardLifetime(stat: string, reward: ActiveStatReward) {
    window.clearTimeout(reward.fadeTimer);
    window.clearTimeout(reward.removeTimer);
    // Extending the hold must not replay the card's one-time entrance animation.
    reward.entry.classList.remove("is-expiring");
    reward.fadeTimer = window.setTimeout(() => {
      reward.entry.classList.add("is-expiring");
    }, 2_100);
    reward.removeTimer = window.setTimeout(() => {
      if (activeStatRewards.get(stat) === reward) activeStatRewards.delete(stat);
      reward.entry.remove();
    }, 2_400);
  }

  function logPickup(text: string, color: string) {
    const model = statRewardToastModel(text);
    const active = model ? activeStatRewards.get(model.stat) : undefined;
    if (model && active && active.entry.parentElement === elements.pickupLog) {
      active.total += model.value;
      const amount = formatStatRewardToastAmount(model.stat, active.total);
      active.entry.querySelector<HTMLElement>(".stat-reward-value")!.textContent = amount;
      active.entry.setAttribute("aria-label", `${model.label} ${amount}`);
      refreshStatRewardLifetime(model.stat, active);
      return;
    }

    const entry = createStatRewardToast(text, color);
    elements.pickupLog.appendChild(entry);
    if (!model) {
      window.setTimeout(() => entry.remove(), 2_400);
      return;
    }
    const reward = {
      entry,
      total: model.value,
      fadeTimer: 0,
      removeTimer: 0,
    };
    activeStatRewards.set(model.stat, reward);
    refreshStatRewardLifetime(model.stat, reward);
  }

  function showNextItemDrop() {
    if (itemDropActive) return;
    const details = itemDropQueue.shift();
    if (!details) return;
    itemDropActive = true;
    const entry = createItemDropReveal(details);
    elements.itemDropReveal.replaceChildren(entry);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (itemDropTimer !== null) window.clearTimeout(itemDropTimer);
      itemDropTimer = null;
      entry.remove();
      itemDropActive = false;
      showNextItemDrop();
    };
    entry.addEventListener("animationend", (event) => {
      if (event.target === entry) finish();
    });
    itemDropTimer = window.setTimeout(finish, ITEM_DROP_REVEAL_DURATION_MS + 150);
  }

  function showItemDrop(details: ItemDropRevealDetails) {
    itemDropQueue.push(details);
    showNextItemDrop();
  }

  function clearTransientUi() {
    document.body.classList.remove("is-dueling");
    messageClock = 0;
    elements.message.style.opacity = "0";
    for (const reward of activeStatRewards.values()) {
      window.clearTimeout(reward.fadeTimer);
      window.clearTimeout(reward.removeTimer);
    }
    activeStatRewards.clear();
    elements.pickupLog.replaceChildren();
    itemDropQueue.length = 0;
    itemDropActive = false;
    if (itemDropTimer !== null) window.clearTimeout(itemDropTimer);
    itemDropTimer = null;
    elements.itemDropReveal.replaceChildren();
  }

  function showDuelResult(replay: RuntimeDuelReplay | null) {
    if (!replay) return;
    const localName = dependencies.localDisplayName() || "PLAYER";
    const selfIsChallenger = replay.challengerName === localName;
    const self = selfIsChallenger
      ? { name: replay.challengerName, gender: replay.challengerGender, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked }
      : { name: replay.opponentName, gender: replay.opponentGender, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked };
    const other = selfIsChallenger
      ? { name: replay.opponentName, gender: replay.opponentGender, attacks: replay.opponentAttacks, damage: replay.opponentDamageDealt, regen: replay.opponentRegened, blocked: replay.opponentBlocked }
      : { name: replay.challengerName, gender: replay.challengerGender, attacks: replay.challengerAttacks, damage: replay.challengerDamageDealt, regen: replay.challengerRegened, blocked: replay.challengerBlocked };
    const won = replay.winnerName === localName;
    elements.duelResultTitle.textContent = replay.winnerName === "DRAW" ? "Duel Draw" : won ? "You Won" : "You Lost";
    elements.duelResultStats.replaceChildren(
      createDuelResultStatRow("YOU", self),
      createDuelResultStatRow(other.name, other, other.gender),
    );
    elements.duelResult.hidden = false;
    elements.duelResult.dataset.replayId = String(replay.id);
    elements.watchDuelReplay.hidden = false;
  }

  function showDuelResultUnavailable() {
    elements.duelResultTitle.textContent = "Duel Complete";
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
    document.body.classList.toggle("is-dueling", Boolean(duel && ["countdown", "active", "finishing"].includes(duel.status)));
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
      const opponentIsChallenger = duel.opponent === dependencies.localIdentity();
      const opponentName = document.createElement("span");
      opponentName.className = "duel-status-name";
      opponentName.append(document.createTextNode(dependencies.duelOpponentName(duel)));
      appendPlayerGenderIcon(opponentName, opponentIsChallenger ? duel.challengerGender : duel.opponentGender);
      elements.duelStatus.replaceChildren("DUEL · ", opponentName, ` · ${remaining}s`);
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
    // Global presence belongs to the account connection and remains valid
    // while a portal replaces the regional connection. Full disconnect clears it.
    const playerCount = Number.isFinite(reportedOnline)
      ? reportedOnline ?? 0
      : dependencies.connected() ? remoteCount + 1 : 0;
    const developer = dependencies.isDeveloper();
    dependencies.applyProfileIcon(elements.playerIcon, dependencies.profileIcon());
    dependencies.setDeveloperAccess(developer);
    const identity = dependencies.localIdentity();
    const displayName = dependencies.localDisplayName() || "WANDERER";
    renderPlayerHud(
      { hpFill: elements.hpFill, hpText: elements.hpText, playerName: elements.playerName, playerPower: elements.playerPower, coopStatus: elements.coopStatus, minimapPlayers: elements.minimapPlayers },
      dependencies.player,
      dependencies.isGuest(identity) ? `${displayName} (guest)` : displayName,
      playerCount,
      dependencies.playerPower(dependencies.player),
      developer,
      dependencies.playerGender(identity),
    );
    updateDuelControls();
    dependencies.refreshAppStatus();
    dependencies.tickTechTree(now);
  }

  return {
    clearTransientUi,
    logPickup,
    showItemDrop,
    setDuelCountdown,
    showDuelResult,
    showDuelResultUnavailable,
    showMessage,
    updateDuelControls,
    updateHud,
    updateMessage,
  };
}
