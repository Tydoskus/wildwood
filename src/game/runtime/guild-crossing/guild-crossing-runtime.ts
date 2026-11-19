import {
  CROSSING_STEPS,
  GUILD_CROSSING_BRIDGE_X,
  GUILD_CROSSING_FEET_OFFSET,
  GUILD_CROSSING_FINISH_PORTAL,
  GUILD_CROSSING_FINISH_RECT,
  GUILD_CROSSING_START_RECT,
  GUILD_HALL_CROSSING_PORTAL,
  crossingFrontierSpawn,
  crossingStepY,
  crossingTileAt,
  crossingTileRect,
  guildCrossingMapId,
  isGuildCrossingMap,
  oppositeCrossingSide,
  type CrossingChoice,
  type GuildCrossingSnapshot,
} from "../../../../shared/guild-crossing";
import { guildHallGuildId, isGuildHallMap } from "../../../../shared/guild-hall";
import { guildHallShown } from "../../guild-hall";
import type { MapId } from "../../world";
import type { PlayerState } from "../types";
import {
  guildCrossingScene,
  pickCrossingFallCry,
  resetGuildCrossingScene,
  spawnCrossingPop,
  spawnCrossingShards,
  spawnCrossingShockwave,
  stepCrossingEffects,
  triggerCrossingHop,
  triggerCrossingShake,
} from "./guild-crossing-scene";

export type GuildCrossingSource = {
  guild?: {
    loadCrossing: () => Promise<GuildCrossingSnapshot | null>;
    stepCrossing: (expectedStep: number, side: CrossingChoice) => Promise<GuildCrossingSnapshot | null>;
  };
};

const POLL_SECONDS = 2.5;
const SUSPENSE_SECONDS = 0.42;
const FALL_SECONDS = 0.72;
const HALL_PORTAL_REACH = 48;

/**
 * Runs the playable in-world Glass Crossing map (`guild_crossing_<guildId>`):
 * - Polls the guild's crossing state every 2.5s ONLY while inside the map so online
 *   guildmates see newly shattered panes, memorials, and shard bursts live.
 * - Clamps player feet onto the Start Platform, the bridge corridor, and Finish Sanctuary,
 *   gently keeping feet out of already-shattered holes and blocking past the active frontier.
 * - Stepping onto Left or Right of the active frontier pane runs a 0.42s suspenseful crackle,
 *   resolves on the server, and either locks glowing emerald (keeping your try!) or shatters
 *   into shards with a 0.72s chasm plunge and clean respawn right behind the new frontier!
 * - Also triggers entry when walking onto the Glass Crossing portal in the Guild Hall courtyard.
 */
export function createGuildCrossingRuntime(deps: {
  source: () => GuildCrossingSource | null | undefined;
  player: PlayerState;
  currentMapId: () => MapId;
  travel: (mapId: MapId) => Promise<boolean>;
  clearInput?: () => void;
  showMessage?: (text: string, color?: string) => void;
}) {
  let activeMap = "";
  let pollClock = 0;
  let stepping = false;
  let hallPortalEntered = false;
  let noTryCooldown = 0;
  let lastTileKey = "";
  let fallDoneAt: { x: number; y: number } | null = null;
  let finishTriggered = false;

  function showBanner(text: string, color: string) {
    guildCrossingScene.banner = { text, color, left: 2.8 };
    deps.showMessage?.(text, color);
  }

  async function refresh() {
    const map = deps.currentMapId();
    if (!isGuildCrossingMap(map)) return;
    try {
      const next = await deps.source()?.guild?.loadCrossing();
      if (deps.currentMapId() !== map || !next) return;
      const prev = guildCrossingScene.snapshot;
      if (prev) {
        // Trigger live glass shards whenever a guildmate shatters a new pane while we watch!
        const known = new Set(prev.falls.map(f => f.step));
        for (const fall of next.falls) {
          if (!known.has(fall.step)) {
            const rect = crossingTileRect(fall.step, fall.side);
            spawnCrossingShards(rect.cx, rect.cy, 34);
            triggerCrossingShake(8, 0.32);
            spawnCrossingPop(rect.cx, rect.cy - 28, pickCrossingFallCry(fall.step, fall.name), "#fff", 1, true);
            showBanner(`${fall.name} fell on Step ${fall.step + 1}!`, "#ffb3b8");
          }
        }
        if (next.completed && !prev.completed && !stepping) {
          spawnCrossingShards(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, 40, ["#ffd34d", "#fff2a6", "#7ef7eb", "#7df7a3"]);
          spawnCrossingShockwave(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, "#ffe27a", 160);
          showBanner(`${next.winner?.name ?? "Your guild"} cleared the Glass Crossing!`, "#ffe27a");
        }
      }
      guildCrossingScene.snapshot = next;
    } catch { /* Non-fatal; retry on next poll. */ }
  }

  function triggerStep(step: number, side: CrossingChoice) {
    const api = deps.source()?.guild;
    const prev = guildCrossingScene.snapshot;
    if (!api || !prev || stepping || prev.completed) return;
    stepping = true;
    deps.clearInput?.();
    const map = deps.currentMapId();
    if (side === "left" || side === "right") {
      const rect = crossingTileRect(step, side);
      deps.player.x = rect.cx;
      deps.player.y = rect.cy - GUILD_CROSSING_FEET_OFFSET;
      guildCrossingScene.stepping = { step, side, progress: 0 };
    }
    const wait = new Promise<void>(resolve => setTimeout(resolve, SUSPENSE_SECONDS * 1_000));
    void Promise.all([api.stepCrossing(step, side), wait]).then(([next]) => {
      guildCrossingScene.stepping = null;
      if (deps.currentMapId() !== map || !next) { stepping = false; return; }
      guildCrossingScene.snapshot = next;
      const gained = Math.max(0, next.pointsAwarded - prev.pointsAwarded);
      const pts = gained > 0 ? ` (+${gained} Guild Quest Points!)` : "";
      if (side === "finish" || (next.completed && !prev.completed)) {
        if (side === "left" || side === "right") guildCrossingScene.safeFlash = { step, side, left: 0.7 };
        spawnCrossingShards(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, 44, ["#ffd34d", "#fff2a6", "#7ef7eb", "#7df7a3"]);
        spawnCrossingShockwave(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, "#ffe27a", 170);
        spawnCrossingPop(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y - 54, `VICTORY! +${gained || 20} PTS`, "#ffe27a", 1.25);
        triggerCrossingShake(9, 0.35);
        showBanner(`Victory! Glass Crossing cleared!${pts}`, "#ffe27a");
        stepping = false;
        return;
      }
      if (next.usedToday > prev.usedToday && (side === "left" || side === "right")) {
        const rect = crossingTileRect(step, side);
        const cry = pickCrossingFallCry(step, next.falls[next.falls.length - 1]?.name ?? "");
        spawnCrossingShards(rect.cx, rect.cy, 38);
        triggerCrossingShake(12, 0.40);
        spawnCrossingPop(rect.cx, rect.cy - 28, cry, "#fff", 1.05, true);
        if (gained > 0) spawnCrossingPop(rect.cx, rect.cy + 8, `+${gained} PTS`, "#ffe27a", 0.95);
        const safe = oppositeCrossingSide(side);
        showBanner(`Shattered on Step ${step + 1}! ${safe === "left" ? "Left" : "Right"} is safe!${pts}`, "#ffb3b8");
        guildCrossingScene.fall = { active: true, progress: 0, elapsed: 0, direction: side === "left" ? -1 : 1, cry };
        fallDoneAt = crossingFrontierSpawn(next.revealed, next.completed, next.revealedSides);
        return;
      }
      if (side === "left" || side === "right") {
        const rect = crossingTileRect(step, side);
        guildCrossingScene.safeFlash = { step, side, left: 0.65 };
        spawnCrossingShockwave(rect.cx, rect.cy, "#7ef7b2", 118);
        const streakLabel = next.currentStreak >= 4
          ? `⚡ ×${next.currentStreak} GODLIKE! +${gained || 2}`
          : next.currentStreak === 3
            ? `🔥 ×3 ON FIRE! +${gained || 2}`
            : next.currentStreak === 2
              ? `STREAK ×2! +${gained || 2}`
              : `+${gained || 2} PTS!`;
        spawnCrossingPop(rect.cx, rect.cy - 34, streakLabel, next.currentStreak >= 2 ? "#ffe27a" : "#9df8b4", next.currentStreak >= 3 ? 1.15 : 1);
        showBanner(`Safe! Step ${step + 1} cleared${next.currentStreak > 1 ? ` · Streak ×${next.currentStreak}!` : " · Try kept!"}${pts}`, "#8ef7a8");
      }
      stepping = false;
    }).catch(error => {
      guildCrossingScene.stepping = null;
      stepping = false;
      const msg = error instanceof Error ? error.message : "Step failed.";
      showBanner(msg, "#ffb3b8");
      void refresh();
    });
  }

  function clampWalkable(snap: GuildCrossingSnapshot | null) {
    const { player } = deps;
    let fx = player.x;
    let fy = player.y + GUILD_CROSSING_FEET_OFFSET;
    const revealed = snap?.revealed ?? 0;

    // Northmost allowed Y:
    // - If revealed >= 16 (all tiles solved or completed): open all the way into the Victory Island!
    // - Otherwise: allow walking & jumping freely across all solved slabs AND onto the active frontier row
    //   (even with 0 tries left today so players can visit, hop on tiles, and cheer/point for guildmates
    //   without progressing it), blocked gently at the frontier's north rim!
    const minY = revealed >= CROSSING_STEPS
      ? GUILD_CROSSING_FINISH_RECT.top + 22
      : crossingStepY(revealed) - 44;
    const maxY = GUILD_CROSSING_START_RECT.bottom - 20;

    if (fy < minY) fy = minY;
    if (fy > maxY) fy = maxY;

    // Horizontal bounds widen on the Start Platform and Finish Sanctuary, narrow to the bridge rails between them.
    const onPlatform = fy >= GUILD_CROSSING_START_RECT.top - 10 || (revealed >= CROSSING_STEPS && fy <= GUILD_CROSSING_FINISH_RECT.bottom + 10);
    const minX = onPlatform ? GUILD_CROSSING_START_RECT.left + 22 : GUILD_CROSSING_BRIDGE_X.left + 16;
    const maxX = onPlatform ? GUILD_CROSSING_START_RECT.right - 22 : GUILD_CROSSING_BRIDGE_X.right - 16;
    fx = Math.max(minX, Math.min(maxX, fx));

    // Gently deflect feet away from already-shattered broken glass holes (steps 0..revealed-1).
    if (snap) {
      for (let i = 0; i < Math.min(revealed, CROSSING_STEPS); i++) {
        const safe = snap.revealedSides[i];
        if (!safe) continue;
        const broken = crossingTileRect(i, oppositeCrossingSide(safe));
        const pad = 8;
        if (fx > broken.left - pad && fx < broken.right + pad && fy > broken.top - pad && fy < broken.bottom + pad) {
          // Push smoothly toward the central spine / safe pane side!
          fx = safe === "left" ? Math.min(fx, broken.left - pad) : Math.max(fx, broken.right + pad);
        }
      }
    }

    player.x = fx;
    player.y = fy - GUILD_CROSSING_FEET_OFFSET;
  }

  function checkHallPortal(mapId: MapId) {
    if (!isGuildHallMap(mapId) || guildHallShown.indoors) { hallPortalEntered = false; return; }
    const feetX = deps.player.x;
    const feetY = deps.player.y + GUILD_CROSSING_FEET_OFFSET;
    const near = deps.player.hp > 0 && Math.hypot(feetX - GUILD_HALL_CROSSING_PORTAL.x, feetY - GUILD_HALL_CROSSING_PORTAL.y) <= HALL_PORTAL_REACH;
    if (near && !hallPortalEntered) {
      hallPortalEntered = true;
      const guildId = guildHallGuildId(mapId);
      if (guildId !== null) {
        deps.clearInput?.();
        void deps.travel(guildCrossingMapId(guildId) as MapId);
      }
    } else if (!near) {
      hallPortalEntered = false;
    }
  }

  return {
    update(dt: number) {
      const mapId = deps.currentMapId();
      checkHallPortal(mapId);

      if (!isGuildCrossingMap(mapId)) {
        if (activeMap) {
          activeMap = "";
          stepping = false;
          fallDoneAt = null;
          finishTriggered = false;
          lastTileKey = "";
          resetGuildCrossingScene();
        }
        return;
      }

      if (activeMap !== mapId) {
        activeMap = mapId;
        pollClock = 0;
        stepping = false;
        fallDoneAt = null;
        finishTriggered = false;
        noTryCooldown = 0;
        lastTileKey = "";
        resetGuildCrossingScene();
        void refresh();
      }

      stepCrossingEffects(dt);
      if (noTryCooldown > 0) noTryCooldown = Math.max(0, noTryCooldown - dt);

      // Periodic live refresh so watching guildmates see real-time progress
      pollClock += dt;
      if (pollClock >= POLL_SECONDS) {
        pollClock = 0;
        if (!stepping) void refresh();
      }

      // Chasm fall animation
      if (guildCrossingScene.fall.active) {
        guildCrossingScene.fall.elapsed += dt;
        guildCrossingScene.fall.progress = Math.min(1, guildCrossingScene.fall.elapsed / FALL_SECONDS);
        if (guildCrossingScene.fall.elapsed >= FALL_SECONDS) {
          guildCrossingScene.fall.active = false;
          if (fallDoneAt) {
            deps.player.x = fallDoneAt.x;
            deps.player.y = fallDoneAt.y;
            fallDoneAt = null;
          }
          stepping = false;
        }
        return;
      }

      if (guildCrossingScene.stepping) {
        guildCrossingScene.stepping.progress = Math.min(1, guildCrossingScene.stepping.progress + dt / SUSPENSE_SECONDS);
        return;
      }

      const snap = guildCrossingScene.snapshot;
      clampWalkable(snap);
      if (!snap || stepping) return;

      const fx = deps.player.x;
      const fy = deps.player.y + GUILD_CROSSING_FEET_OFFSET;

      // Tactile hop arc whenever stepping onto a floating glass slab (works even with 0 tries left!)
      const tileHit = crossingTileAt(fx, fy, 16);
      const tileKey = tileHit ? `${tileHit.step}:${tileHit.side}` : "";
      if (tileKey && tileKey !== lastTileKey) {
        triggerCrossingHop();
      }
      lastTileKey = tileKey;

      if (snap.completed) return;

      // Visitors with 0 tries left can hop on all solved & frontier tiles without progressing the bridge.
      if (snap.remainingToday <= 0) {
        if (tileHit && tileHit.step === snap.revealed && noTryCooldown <= 0) {
          noTryCooldown = 6;
          showBanner("0 tries left today · Hang out or cheer on your guild!", "#ffd38a");
        }
        return;
      }

      // Finish Portal claim (when step 16 was shattered earlier and all 16 steps are revealed)
      if (snap.revealed >= CROSSING_STEPS) {
        if (!finishTriggered && Math.hypot(fx - GUILD_CROSSING_FINISH_PORTAL.x, fy - GUILD_CROSSING_FINISH_PORTAL.y) <= GUILD_CROSSING_FINISH_PORTAL.r) {
          finishTriggered = true;
          triggerStep(CROSSING_STEPS, "finish");
        }
        return;
      }

      // Active 50/50 frontier glass step detection
      if (tileHit && tileHit.step === snap.revealed) {
        triggerStep(tileHit.step, tileHit.side);
      }
    },
    isBusy: () => stepping || guildCrossingScene.fall.active,
  };
}
