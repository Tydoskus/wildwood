import {
  CROSSING_MILESTONES,
  CROSSING_STEPS,
  oppositeCrossingSide,
  type CrossingChoice,
  type CrossingFall,
  type CrossingPioneer,
  type CrossingSide,
  type GuildCrossingSnapshot,
} from "../../shared/guild-crossing";
import { formatQuestReset } from "./quest-board-controller";

type CrossingApi = {
  loadCrossing: () => Promise<GuildCrossingSnapshot | null>;
  stepCrossing: (expectedStep: number, side: CrossingChoice) => Promise<GuildCrossingSnapshot | null>;
};

const SUSPENSE_MS = 380;

/**
 * Interactive Glass Crossing view inside `.guild-window`:
 * A vertical 16-step 50/50 glass tile bridge leading to a Golden Victory Portal.
 * Already-solved steps glow emerald; shattered tiles show the fallen guildmate's
 * portrait and skull memorial; tapping Left or Right on the active frontier plays
 * a brief crackle beat before revealing Safe (keep your streak!) or Shatter (reveal
 * the safe tile for your guild!).
 */
export function createGuildCrossingView(
  dialog: HTMLElement,
  options: {
    doc?: Document;
    api: () => CrossingApi | undefined;
    applyPortrait: (el: HTMLElement, icon: number, identity: string) => void;
    onBack: (changed: boolean) => void;
    now?: () => number;
  },
) {
  const doc = options.doc ?? document;
  const now = options.now ?? (() => Date.now());
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  let state: GuildCrossingSnapshot | null = null;
  let busy = true;
  let stepping: { step: number; side: CrossingChoice } | null = null;
  let flash: { step: number; side: CrossingSide; kind: "safe" | "shatter" } | null = null;
  let toast: { kind: "safe" | "fell" | "win" | "error"; text: string } | null = null;
  let disposed = false;
  let changed = false;
  let serial = 0;

  async function refresh() {
    const api = options.api();
    if (!api) { toast = { kind: "error", text: "Connect to your character to enter the Glass Crossing." }; busy = false; render(); return; }
    const id = ++serial;
    busy = true;
    render();
    try {
      const next = await api.loadCrossing();
      if (disposed || id !== serial) return;
      state = next;
    } catch (error) {
      if (disposed || id !== serial) return;
      toast = { kind: "error", text: error instanceof Error ? error.message : "Could not load the Glass Crossing." };
    } finally {
      if (!disposed && id === serial) {
        busy = false;
        render(true);
      }
    }
  }

  async function step(side: CrossingChoice) {
    const api = options.api();
    if (!api || !state || busy || state.completed) return;
    const prev = state;
    const expectedStep = prev.revealed;
    const id = ++serial;
    busy = true;
    stepping = { step: expectedStep, side };
    toast = null;
    flash = null;
    render();

    const delay = new Promise<void>(resolve => setTimeout(resolve, SUSPENSE_MS));
    try {
      const [next] = await Promise.all([api.stepCrossing(expectedStep, side), delay]);
      if (disposed || id !== serial) return;
      stepping = null;
      if (!next) { state = null; return; }
      changed = true;
      state = next;
      const gained = Math.max(0, next.pointsAwarded - prev.pointsAwarded);
      const ptsSuffix = gained > 0 ? ` (+${gained} Guild Quest Points!)` : "";
      if (side === "finish" || (next.completed && !prev.completed)) {
        if (side === "left" || side === "right") flash = { step: expectedStep, side, kind: "safe" };
        toast = { kind: "win", text: `Victory! You crossed the Glass Bridge for ${next.guildName}!${ptsSuffix}` };
      } else if (next.usedToday > prev.usedToday && (side === "left" || side === "right")) {
        flash = { step: expectedStep, side, kind: "shatter" };
        const safe = oppositeCrossingSide(side);
        toast = {
          kind: "fell",
          text: `Shattered on Step ${expectedStep + 1}! ${safe === "left" ? "Left" : "Right"} is now safe for your guild.${ptsSuffix}`,
        };
      } else if (side === "left" || side === "right") {
        flash = { step: expectedStep, side, kind: "safe" };
        toast = {
          kind: "safe",
          text: `Safe! Step ${expectedStep + 1} cleared${next.currentStreak > 1 ? ` · Streak ×${next.currentStreak}!` : " · Try kept!"}${ptsSuffix}`,
        };
      }
    } catch (error) {
      await delay;
      if (disposed || id !== serial) return;
      stepping = null;
      const message = error instanceof Error ? error.message : "Step failed.";
      toast = { kind: "error", text: message };
      // If a guildmate raced us on the same tile, immediately refresh so the player sees the new frontier.
      if (/guildmate|refresh/i.test(message)) {
        try {
          const fresh = await api.loadCrossing();
          if (!disposed && id === serial && fresh) state = fresh;
        } catch { /* Keep error visible. */ }
      }
    } finally {
      if (!disposed && id === serial) {
        busy = false;
        render(true);
      }
    }
  }

  function renderTile(
    stepIndex: number,
    side: CrossingSide,
    snap: GuildCrossingSnapshot,
    fall: CrossingFall | undefined,
    pioneer: CrossingPioneer | undefined,
  ): HTMLElement {
    const isRevealed = stepIndex < snap.revealed;
    const isFrontier = stepIndex === snap.revealed && !snap.completed;
    const isSteppingHere = stepping?.step === stepIndex && stepping.side === side;
    const isFlash = flash?.step === stepIndex && flash.side === side ? flash.kind : null;

    if (isFrontier) {
      const btn = el("button", undefined, `crossing-tile crossing-tile--frontier${isSteppingHere ? " is-stepping" : ""}`);
      btn.type = "button";
      btn.dataset.step = String(stepIndex);
      btn.dataset.side = side;
      btn.disabled = busy || snap.remainingToday <= 0;
      btn.append(
        el("span", side === "left" ? "Left" : "Right", "crossing-tile-label"),
        el("small", isSteppingHere ? "Stepping…" : snap.remainingToday > 0 ? "50 / 50" : "Locked", "crossing-tile-sub"),
      );
      btn.addEventListener("click", () => { void step(side); });
      return btn;
    }

    if (isRevealed) {
      const safeSide = snap.revealedSides[stepIndex];
      if (side === safeSide) {
        const tile = el("div", undefined, `crossing-tile crossing-tile--safe${isFlash === "safe" ? " is-flash-safe" : ""}`);
        tile.append(
          el("span", "✓ Safe", "crossing-tile-label"),
          el("small", pioneer ? pioneer.name : "Revealed", "crossing-tile-sub"),
        );
        return tile;
      }
      const tile = el("div", undefined, `crossing-tile crossing-tile--broken${fall ? " has-fallen" : ""}${isFlash === "shatter" ? " is-flash-shatter" : ""}`);
      if (fall) {
        const badge = el("div", undefined, "crossing-fallen-badge");
        const portrait = el("span", undefined, "guild-avatar crossing-fallen-avatar");
        portrait.setAttribute("aria-hidden", "true");
        options.applyPortrait(portrait, fall.profileIcon, fall.identity);
        const skull = el("span", "💀", "crossing-skull");
        skull.setAttribute("aria-hidden", "true");
        const wrap = el("span", undefined, "crossing-fallen-portrait");
        wrap.append(portrait, skull);
        badge.append(wrap, el("strong", fall.name, "crossing-fallen-name"));
        tile.append(badge);
      } else {
        tile.append(el("span", "Fragile", "crossing-tile-sub"));
      }
      return tile;
    }

    const future = el("div", undefined, "crossing-tile crossing-tile--future");
    future.append(el("span", "?", "crossing-tile-sub"));
    return future;
  }

  function render(scrollToFrontier = false) {
    if (disposed) return;
    const prevScroll = dialog.querySelector<HTMLElement>(".crossing-bridge-scroll")?.scrollTop ?? null;
    dialog.replaceChildren();

    const h2 = el("h2", undefined, "window-banner");
    h2.id = "guildTitle";
    h2.append(el("span", "Glass Crossing"));
    dialog.append(h2);

    const body = el("div", undefined, "guild-content crossing-content");

    if (!state) {
      const loading = el("div", undefined, "guild-loading");
      loading.setAttribute("role", "status");
      loading.append(el("span", busy ? "Opening the Glass Crossing…" : (toast?.text ?? "Join a guild to play the Glass Crossing.")));
      body.append(loading);
    } else {
      const snap = state;
      const topBar = el("div", undefined, "crossing-topbar");
      const stats = el("div", undefined, "crossing-stats");
      stats.append(
        el("span", `Step ${Math.min(snap.revealed, snap.steps)} / ${snap.steps}`, "crossing-pill"),
        el("span", `+${snap.pointsAwarded} / ${snap.maxPoints} pts`, "crossing-pill crossing-pill--gold"),
      );
      if (snap.completed) {
        stats.append(el("span", "Cleared!", "crossing-pill crossing-pill--win"));
      } else if (snap.currentStreak > 0) {
        stats.append(el("span", `Streak ×${snap.currentStreak}`, "crossing-pill crossing-pill--streak"));
      }
      const refreshBtn = el("button", "↻", "guild-button guild-button--icon");
      refreshBtn.type = "button";
      refreshBtn.disabled = busy;
      refreshBtn.setAttribute("aria-label", "Refresh Glass Crossing");
      refreshBtn.addEventListener("click", () => { void refresh(); });
      topBar.append(stats, refreshBtn);
      body.append(topBar);

      const triesLine = el("div", undefined, "crossing-tries");
      const resetIn = formatQuestReset(Math.max(60_000, snap.nextDayAtMs - now()));
      const weekIn = formatQuestReset(Math.max(60_000, snap.resetsAtMs - now()));
      if (snap.completed) {
        triesLine.textContent = `Cleared by ${snap.winner?.name ?? "your guild"} · Resets in ${weekIn}`;
      } else if (snap.remainingToday > 0) {
        triesLine.textContent = `${snap.remainingToday} of ${snap.dailyLimit} ${snap.dailyLimit === 1 ? "try" : "tries"} left today · Safe steps keep your try`;
      } else {
        triesLine.textContent = `0 of ${snap.dailyLimit} tries left today · Next try in ${resetIn}`;
      }
      body.append(triesLine);

      // Milestone progress chips
      const milestones = el("div", undefined, "crossing-milestones");
      for (const m of CROSSING_MILESTONES) {
        const hit = m.step === CROSSING_STEPS ? snap.completed : snap.revealed >= m.step;
        milestones.append(el("span", `Step ${m.step}: +${m.points} pts${hit ? " ✓" : ""}`, `crossing-milestone${hit ? " is-done" : ""}`));
      }
      body.append(milestones);

      if (toast) {
        const banner = el("p", toast.text, `crossing-toast crossing-toast--${toast.kind}`);
        banner.setAttribute("role", toast.kind === "error" ? "alert" : "status");
        body.append(banner);
      }

      // Vertical Glass Bridge (Victory Portal at top, Start Platform at bottom)
      const scrollWrap = el("div", undefined, "crossing-bridge-scroll");
      const bridge = el("div", undefined, "crossing-bridge");

      const finishReady = snap.revealed >= snap.steps && !snap.completed;
      const portal = el("div", undefined, `crossing-portal${snap.completed ? " is-cleared" : finishReady ? " is-ready" : ""}`);
      if (snap.completed && snap.winner) {
        const winRow = el("div", undefined, "crossing-winner");
        const portrait = el("span", undefined, "guild-avatar");
        portrait.setAttribute("aria-hidden", "true");
        options.applyPortrait(portrait, snap.winner.profileIcon, snap.winner.identity);
        winRow.append(portrait, el("strong", `${snap.winner.name} crossed the Victory Portal!`));
        portal.append(winRow, el("small", `+${snap.maxPoints} Guild Quest Points & Hall Fund awarded`));
      } else if (finishReady) {
        portal.append(el("strong", "Victory Portal Open!"));
        const finishBtn = el("button", snap.remainingToday > 0 ? "Cross Finish Portal (+20 pts)" : "Waiting for a guildmate with a try", "guild-button guild-button--primary crossing-finish-btn");
        finishBtn.type = "button";
        finishBtn.disabled = busy || snap.remainingToday <= 0;
        finishBtn.addEventListener("click", () => { void step("finish"); });
        portal.append(finishBtn);
      } else {
        portal.append(el("strong", "Victory Portal"), el("small", "+20 Bonus Guild Quest Points & Hall Fund"));
      }
      bridge.append(portal);

      const fallsByStep = new Map(snap.falls.map(f => [f.step, f]));
      const pioneersByStep = new Map(snap.pioneers.map(p => [p.step, p]));

      for (let i = snap.steps - 1; i >= 0; i--) {
        const milestone = CROSSING_MILESTONES.find(m => m.step === i + 1 && m.step < CROSSING_STEPS);
        if (milestone) {
          const hit = snap.revealed >= milestone.step;
          bridge.append(el("div", `★ Checkpoint · +${milestone.points} pts${hit ? " Earned" : ""}`, `crossing-checkpoint${hit ? " is-done" : ""}`));
        }
        const isFrontier = i === snap.revealed && !snap.completed;
        const row = el("div", undefined, `crossing-row${isFrontier ? " is-frontier" : i < snap.revealed ? " is-revealed" : " is-future"}`);
        row.dataset.stepRow = String(i);
        row.append(
          renderTile(i, "left", snap, fallsByStep.get(i), pioneersByStep.get(i)),
          el("span", String(i + 1).padStart(2, "0"), "crossing-step-num"),
          renderTile(i, "right", snap, fallsByStep.get(i), pioneersByStep.get(i)),
        );
        bridge.append(row);
      }

      const startPad = el("div", undefined, "crossing-start");
      startPad.append(el("strong", "Start Platform"), el("small", `${snap.guildName} · ${snap.memberCount} member${snap.memberCount === 1 ? "" : "s"} (${snap.dailyLimit} try/day each)`));
      bridge.append(startPad);

      scrollWrap.append(bridge);
      body.append(scrollWrap);

      if (snap.falls.length) {
        const wall = el("div", undefined, "crossing-fallen-wall");
        wall.append(el("strong", `Fallen Heroes (${snap.falls.length}): `));
        const names = snap.falls.map(f => `💀 ${f.name} (Step ${f.step + 1})`).join(" · ");
        wall.append(el("span", names));
        body.append(wall);
      }

      const rules = el("details", undefined, "guild-disclosure crossing-rules");
      rules.append(
        el("summary", "How Glass Crossing works"),
        el("p", "Pick Left or Right on the active glass pair. Safe tiles keep your daily try so you can chain a streak!"),
        el("p", "Fragile glass shatters, spends 1 try, marks your memorial on the tile, and reveals the safe side for your whole guild."),
        el("p", "Daily tries reset at 00:00 UTC (1/day for 11–20 members, 2/day for 5–10, 3/day for 1–4). Every step awards +2 guild points right away (+20 on clear, 50 total) on top of the 300-quest pool toward next week's guild bonus."),
      );
      body.append(rules);

      if (scrollToFrontier) {
        const target = scrollWrap.querySelector<HTMLElement>(".crossing-row.is-frontier")
          ?? (finishReady ? scrollWrap.querySelector<HTMLElement>(".crossing-portal") : scrollWrap.querySelector<HTMLElement>(".crossing-portal"));
        if (target && typeof target.scrollIntoView === "function") {
          requestAnimationFrame(() => { if (!disposed) target.scrollIntoView({ block: "center", behavior: "smooth" }); });
        }
      } else if (prevScroll !== null) {
        scrollWrap.scrollTop = prevScroll;
      }
    }

    dialog.append(body);

    const footer = el("footer", undefined, "window-back-footer");
    const back = el("button", "Back", "window-back-button");
    back.type = "button";
    back.addEventListener("click", () => options.onBack(changed));
    footer.append(back);
    dialog.append(footer);
  }

  render();
  void refresh();

  return {
    dispose() { disposed = true; serial++; },
    back() { options.onBack(changed); },
  };
}
