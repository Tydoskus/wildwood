import { createDuelPresentation, type DuelReplayTitle } from "./duel-presentation";
import type { RuntimeDuelReplay, RuntimeDuelState } from "./types";
import { appendPlayerGenderIcon } from "../../ui/player-gender";

export function createDuelRuntime(hooks: {
  activeDuel: () => RuntimeDuelState | null;
  localIdentity: () => string | undefined;
  localDisplayName: () => string | undefined;
  remotePlayers: () => Array<{ id: string; name: string }>;
  playerDisplayName: (identity: string) => string | undefined;
  pulseDuel: () => void;
  spawnDamageNumber: (x: number, y: number, damage: number) => void;
  loadReplay: (replayId: bigint) => Promise<RuntimeDuelReplay | null | undefined>;
  clearDamageNumbers: () => void;
  showMessage: (text: string, color: string) => void;
  fadeToWorld: (onBlack: () => void) => void;
  isDuelResultHeld: () => boolean;
  now: () => number;
  nowMs: () => number;
  replayTitle: HTMLElement;
  duelResult: HTMLElement;
  duelReplay: HTMLElement;
  duelCountdown: HTMLElement;
}) {
  function renderReplayTitle(title: DuelReplayTitle) {
    const challenger = document.createElement("span");
    challenger.className = "duel-replay-player-name";
    challenger.append(document.createTextNode(title.challengerName));
    appendPlayerGenderIcon(challenger, title.challengerGender);
    const opponent = document.createElement("span");
    opponent.className = "duel-replay-player-name";
    opponent.append(document.createTextNode(title.opponentName));
    appendPlayerGenderIcon(opponent, title.opponentGender);
    hooks.replayTitle.replaceChildren(challenger, " VS ", opponent);
    if (title.detail) hooks.replayTitle.append(` · ${title.detail}`);
  }

  const presentation = createDuelPresentation({
    activeDuel: hooks.activeDuel,
    localIdentity: hooks.localIdentity,
    localDisplayName: hooks.localDisplayName,
    remotePlayers: hooks.remotePlayers,
    playerDisplayName: hooks.playerDisplayName,
    pulseDuel: hooks.pulseDuel,
    spawnDamageNumber: hooks.spawnDamageNumber,
    setReplayTitle: renderReplayTitle,
    now: hooks.now,
    nowMs: hooks.nowMs,
  });

  async function openReplay(replayId: bigint) {
    const replay = await hooks.loadReplay(replayId);
    if (!replay) {
      hooks.showMessage("REPLAY EXPIRED", "#ff9b91");
      return;
    }
    hooks.clearDamageNumbers();
    presentation.startReplay(replay);
    hooks.duelResult.hidden = true;
    hooks.duelReplay.hidden = false;
    document.body.classList.add("is-replaying");
  }

  function closeReplay() {
    hooks.duelReplay.hidden = true;
    presentation.clearReplay();
    hooks.duelCountdown.hidden = true;
    document.body.classList.remove("is-replaying");
  }

  function closeReplayWindow() {
    if (hooks.isDuelResultHeld()) {
      closeReplay();
      hooks.duelResult.hidden = false;
      return;
    }
    hooks.fadeToWorld(closeReplay);
  }

  return { ...presentation, openReplay, closeReplay, closeReplayWindow };
}
