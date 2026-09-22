import { chooseOnboardingName } from "./onboarding-name";
import { DEFAULT_TUTORIAL_COPY, loadTutorialCopy, tutorialText } from "./tutorial-copy";
import { ONBOARDING_ENEMY_HP, ONBOARDING_REGEN_ENEMY_HP, ONBOARDING_ENEMY_POSITION, ONBOARDING_MAP_ID, ONBOARDING_WORLD, ONBOARDING_STEP as S, onboardingPending } from "../../shared/onboarding";
import { ENEMY_TYPES, REWARD_DATA, rewardLabel } from "../game/enemies";
import type { SpawnSite } from "../game/world";
import type { EnemyState, PlayerState } from "../game/runtime/types";

type Options = {
  step: () => number;
  identity: () => string;
  connected: () => boolean;
  stats: () => { damage: number; regen: number };
  complete: (step: number) => Promise<{ ok: boolean; error?: string } | undefined>;
  player: PlayerState;
  enemies: EnemyState[];
  sites: SpawnSite[];
  spawn: (site: SpawnSite) => void;
  enter: (map: typeof ONBOARDING_MAP_ID) => void;
  respawn: () => void;
  clearCombat: () => void;
  clearInput: () => void;
  logPickup: (text: string, color: string) => void;
  fadeToWorld: (onBlack: () => void | Promise<void>, durationMs?: number) => void;
  profileOpen: () => boolean;
  setName: (name: string) => Promise<{ ok?: boolean; error?: string } | undefined>;
  hasChosenName: () => boolean;
  waitForNameSave: () => Promise<void>;
  closeWindows: () => void;
  cancel: () => void;
};

/** A private map in the ordinary world runtime. This module only sequences lessons and UI. */
export function createOnboardingTutorial(o: Options) {
  let active = false, owner = "", step = 0, hold = 0, pending = 0, saving = false, failed = false;
  let walked = 0, lastX = 0, lastY = 0, deadFor = -1, finish: () => void = () => {};
  let afterHold: "enemy" | "death-intro" | "complete" | "fade" = "enemy";
  let host: HTMLElement | null = null;
  let naming = false, profileSeen = false, abort = new AbortController();
  let instruction: HTMLElement, hint: HTMLElement, progress: HTMLElement, retry: HTMLButtonElement, pointer: HTMLElement;
  let copy = DEFAULT_TUTORIAL_COPY, titleKey = "moveTitle", hintKey = "moveTouchHint", textValues: Record<string, number> = {};
  function showText(title: string, detail: string, values: Record<string, number> = {}) {
    titleKey = title; hintKey = detail; textValues = values;
    instruction.textContent = tutorialText(copy, title, values);
    hint.textContent = tutorialText(copy, detail, values);
  }
  function readingTime(minimum = 3) {
    const words = `${instruction.textContent} ${hint.textContent}`.trim().split(/\s+/).length;
    return Math.max(minimum, .8 + words / 3);
  }
  function clearEnemy() { o.enemies.length = 0; o.sites.length = 0; o.clearCombat(); }
  function dispose() {
    active = false; abort.abort(); host?.remove(); host = null;
    document.body.classList.remove("is-onboarding", "is-onboarding-profile");
  }

  /**
   * The lesson used to say "tap yourself", which a setting can now switch off,
   * and the HUD it points at instead is hidden for the rest of the tutorial.
   * Reveal it for this step only and put an arrow under the portrait, tracking
   * it rather than guessing where the HUD sits on this screen.
   */
  function aimPointer(show: boolean) {
    document.body.classList.toggle("is-onboarding-profile", show);
    if (!pointer) return;
    const target = show ? document.getElementById("playerHudProfileIcon") : null;
    const box = target?.getBoundingClientRect();
    pointer.hidden = !box || box.width === 0;
    if (!box || box.width === 0) return;
    // Centred under the portrait, and kept on screen: the HUD sits near the
    // left edge, so a naive centre put half the arrow outside the viewport.
    const width = pointer.offsetWidth || 38;
    const centred = box.left + box.width / 2 - width / 2;
    const maxLeft = Math.max(8, (pointer.ownerDocument.defaultView?.innerWidth ?? 0) - width - 8);
    pointer.style.left = `${Math.max(8, Math.min(maxLeft, centred))}px`;
    pointer.style.top = `${box.bottom + 10}px`;
  }
  function labels() {
    showText(step === S.move ? "moveTitle" : step === S.profile ? "profileTitle" : step === S.spitter ? "firstEnemyTitle" : step === S.regen ? "regenEnemyTitle" : step === S.death ? "deathTitle" : "completeTitle",
      step === S.move ? (navigator.maxTouchPoints > 0 ? "moveTouchHint" : "moveKeyboardHint") : step === S.profile ? "profileHint" : step < S.death ? "combatHint" : step === S.death ? "deathHint" : "completeHint");
    progress.setAttribute("aria-valuenow", String(Math.min(5, step)));
    progress.style.setProperty("--lesson-progress", `${Math.min(5, step) / 5 * 100}%`);
  }
  function spawnLessonEnemy() {
    clearEnemy();
    if (step < S.spitter || step > S.death) return;
    const type = step === S.regen ? "Brood" : "Spitter";
    const demonstration = step === S.death;
    const site: SpawnSite = { id: 0, type, campName: "First Steps", x: demonstration ? o.player.x : ONBOARDING_ENEMY_POSITION.x, y: demonstration ? Math.max(180, o.player.y - 100) : ONBOARDING_ENEMY_POSITION.y,
      alive: false, respawnAt: 0, groupAggro: false, leashRange: 1500,
      definition: { ...ENEMY_TYPES[type], hp: demonstration ? Math.max(40, o.player.damage * 12) : step === S.regen ? ONBOARDING_REGEN_ENEMY_HP : ONBOARDING_ENEMY_HP,
        speed: demonstration ? 260 : step === S.spitter ? ENEMY_TYPES.Spitter.speed : 45,
        damage: demonstration ? o.player.maxHp * 2 : step === S.spitter ? 10 : 1,
        attackSpeed: demonstration ? 1 : .5, aggro: demonstration ? 2000 : 100,
        reward: { type: step === S.regen ? "regen" : "damage", amount: demonstration ? 0 : step === S.regen ? .2 : 1 } },
    };
    o.sites.push(site); o.spawn(site);
    const enemy = o.enemies[0];
    enemy.hideStatus = demonstration;
    enemy.displayName = demonstration ? "Spitter" : step === S.regen ? "Baby Brood" : "Baby Spitter";

  }
  async function saveStep() {
    if (!active || saving || !pending) return;
    saving = true; failed = false; retry.hidden = true;
    const target = pending, identity = owner;
    let result;
    try { result = await o.complete(target); } catch { result = undefined; }
    if (!active || naming || owner !== identity || o.identity() !== identity) return;
    saving = false;
    if (!result?.ok) { failed = true; hint.textContent = "Connection interrupted. Retry to continue."; retry.hidden = false; return; }
    const latest = o.stats();
    o.player.damage = latest.damage; o.player.regen = latest.regen;
    step = target; pending = 0; labels(); hold = 0; afterHold = "enemy";
    if (step === S.spitter) spawnLessonEnemy();
    if (step === S.regen || step === S.death) {
      const reward = step === S.regen ? { type: "damage" as const, amount: 1 } : { type: "regen" as const, amount: .2 };
      o.logPickup(rewardLabel(reward), REWARD_DATA[reward.type].color);
      // Give the regular reward popup its own moment, without duplicate prose.
      showText("", ""); hold = 3;
      afterHold = step === S.death ? "death-intro" : "enemy";
    }
  }
  function showUsername() {
    if (!active || naming) return;
    naming = true; step = S.complete; clearEnemy(); o.clearInput(); o.closeWindows(); hold = Infinity;
    const identity = owner;
    o.fadeToWorld(async () => {
      if (host) host.hidden = true;
      await o.waitForNameSave();
      if (!active || owner !== identity || o.identity() !== identity) return;
      const accepted = await chooseOnboardingName({ title: tutorialText(copy, "usernameTitle"), needsName: !o.hasChosenName(), signal: abort.signal,
        commit: async name => {
          if (!active || owner !== identity || o.identity() !== identity) return { ok: false, error: "Your account changed." };
          if (name) {
            const named = await o.setName(name);
            if (!named?.ok) return { ok: false, error: named?.error || "Could not save that username." };
          }
          if (!active || o.identity() !== owner) return { ok: false, error: "Your account changed." };
          return await o.complete(S.complete) ?? { ok: false, error: "Connection interrupted. Try again." };
        },
      });
      if (accepted && active) { dispose(); finish(); }
    }, 700);
  }
  // Saving a lesson must not cancel a held key or an active touch drag.
  function queueStep(next: number) { pending = next; clearEnemy(); void saveStep(); }
  return {
    isActive: () => active,
    required: () => onboardingPending(o.step()),
    canOpenProfile: () => active && step === S.profile,
    blocksInput: () => active && (step >= S.complete || o.profileOpen() || deadFor >= 0 || !o.connected()),
    start(onComplete: () => void) {
      if (active) return;
      active = true; owner = o.identity(); step = o.step(); finish = onComplete;
      hold = pending = walked = 0; saving = failed = profileSeen = naming = false; afterHold = "enemy"; deadFor = -1; abort = new AbortController();
      host = document.createElement("section"); host.className = "onboarding-tutorial"; host.setAttribute("aria-label", "First adventure tutorial");
      host.innerHTML = '<header><div class="onboarding-progress" role="progressbar" aria-label="Tutorial progress" aria-valuemin="1" aria-valuemax="5"></div><p class="onboarding-instruction" role="status"></p><p class="onboarding-hint"></p><button type="button" class="window-back-button" hidden>Retry</button></header><button type="button" class="onboarding-skip-tutorial">Skip tutorial</button><div class="onboarding-pointer" hidden aria-hidden="true"><svg viewBox="0 0 48 64" role="presentation"><path d="M24 5 L44 31 H33 V59 H15 V31 H4 Z" /></svg></div>';
      instruction = host.querySelector(".onboarding-instruction")!; hint = host.querySelector(".onboarding-hint")!;
      progress = host.querySelector(".onboarding-progress")!;
      pointer = host.querySelector(".onboarding-pointer")!;
      retry = host.querySelector("button")!;
      retry.addEventListener("click", () => { void saveStep(); });
      host.querySelector(".onboarding-skip-tutorial")!.addEventListener("click", showUsername);
      document.body.append(host); document.body.classList.add("is-onboarding");
      o.enter(ONBOARDING_MAP_ID); lastX = o.player.x; lastY = o.player.y;
      labels();
      if (step === S.death) { clearEnemy(); hold = readingTime(4); }
      else spawnLessonEnemy();
      const identity = owner;
      void loadTutorialCopy().then(saved => {
        if (!active || owner !== identity || failed) return;
        copy = saved; showText(titleKey, hintKey, textValues);
      });
    },
    enemyDefeated() {
      if (!active) return false;
      if (!naming && (step === S.spitter || step === S.regen)) queueStep(step + 1);
      return true;
    },
    died() {
      if (!active) return false;
      deadFor = 0; clearEnemy(); o.clearInput();
      showText("deathTitle", "deathHint");
      return true;
    },
    update(dt: number) {
      if (!active) return;
      if (o.identity() !== owner) { clearEnemy(); dispose(); o.cancel(); return; }
      if (naming) return;
      if (!o.connected()) { o.clearInput(); hint.textContent = "Reconnecting…"; return; }
      const profileOpen = o.profileOpen();
      if (host) host.hidden = profileOpen || step >= S.complete;
      aimPointer(step === S.profile && !profileOpen && !pending);
      if (step === S.profile) {
        if (profileOpen) profileSeen = true;
        else if (profileSeen && !pending) { profileSeen = false; queueStep(S.spitter); }
      }
      if (saving || failed) return;
      if (deadFor >= 0) {
        deadFor += dt;
        if (deadFor < 2) return;
        deadFor = -1; o.respawn(); lastX = o.player.x; lastY = o.player.y;
        // Keep the same explanation through falling and returning to spawn.
        afterHold = step === S.death ? "complete" : "enemy"; hold = 2;
        return;
      }
      if (hold > 0) {
        hold = Math.max(0, hold - dt);
        if (hold > 0) return;
        if (afterHold === "death-intro") {
          labels(); hold = readingTime(4); afterHold = "enemy";
          return;
        }
        if (afterHold === "complete") {
          showText("completeTitle", "completeHint"); hold = readingTime(); afterHold = "fade";
          return;
        }
        if (afterHold === "fade") {
          showUsername();
          return;
        }
        labels(); spawnLessonEnemy();
      }
      if (step === S.move) {
        walked += Math.hypot(o.player.x - lastX, o.player.y - lastY);
        lastX = o.player.x; lastY = o.player.y;
        if (walked >= 60) queueStep(S.profile);
      }
    },
    spawn: ONBOARDING_WORLD.spawn,
  };
}
