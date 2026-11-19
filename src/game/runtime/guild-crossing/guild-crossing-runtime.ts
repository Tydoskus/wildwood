import {
  CROSSING_STEPS,
  GUILD_CROSSING_ARRIVAL,
  GUILD_CROSSING_CENTER_X,
  GUILD_CROSSING_EXIT_PAD,
  GUILD_CROSSING_FEET_OFFSET,
  GUILD_CROSSING_FINISH_PORTAL,
  GUILD_HALL_CROSSING_PORTAL,
  crossingFrontierSpawn,
  crossingTileAt,
  crossingTileRect,
  guildCrossingMapId,
  isGuildCrossingMap,
  oppositeCrossingSide,
  type CrossingChoice,
  type GuildCrossingSnapshot,
} from "../../../../shared/guild-crossing";
import { guildHallGuildId, isGuildHallMap } from "../../../../shared/guild-hall";
import { TOWN_MAP_ID } from "../../../../shared/town";
import { guildHallShown } from "../../guild-hall";
import type { MapId } from "../../world";
import type { Camera } from "../render/camera";
import type { PlayerState } from "../types";
import {
  guildCrossingScene,
  pickCrossingFallCry,
  resetGuildCrossingScene,
  spawnCrossingPop,
  spawnCrossingShards,
  spawnCrossingShockwave,
  startCrossingLeap,
  stepCrossingEffects,
  triggerCrossingShake,
} from "./guild-crossing-scene";

export type GuildCrossingSource = {
  correctMovementPosition?: (x: number, y: number, force?: boolean) => void;
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
 * - Free-roam walking is disabled so players never drift glitchily into empty space.
 * - Click / tap any solved emerald slab, active 50/50 frontier slab, Start Island, Return Portal,
 *   or unlocked Victory Island / Victory Portal to launch a smooth parabolic 2.5D leap right onto it.
 * - Landing on a 50/50 frontier slab with tries left triggers the 0.42s suspense crackle + server step;
 *   with 0 tries left, visitors can still leap onto solved and frontier tiles to hang out and cheer
 *   without progressing the bridge.
 * - Polls the guild's crossing state every 2.5s ONLY while inside the map so online guildmates see
 *   shattered panes, fallen bodies, and shard bursts live.
 */
export function createGuildCrossingRuntime(deps: {
  source: () => GuildCrossingSource | null | undefined;
  player: PlayerState;
  camera?: Camera;
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
  let fallDoneAt: { x: number; y: number } | null = null;
  let onLeapLand: (() => void) | null = null;

  function showBanner(text: string, color: string) {
    guildCrossingScene.banner = { text, color, left: 2.8 };
    deps.showMessage?.(text, color);
  }

  function syncServerPosition() {
    deps.source()?.correctMovementPosition?.(deps.player.x, deps.player.y, true);
  }

  function beginLeap(toX: number, toY: number, onLand?: () => void) {
    const dx = toX - deps.player.x;
    const dy = toY - deps.player.y;
    if (Math.hypot(dx, dy) < 6) {
      deps.player.x = toX;
      deps.player.y = toY;
      deps.player.moving = false;
      onLand?.();
      return;
    }
    deps.player.facing = Math.atan2(dy, dx);
    deps.player.moving = false;
    onLeapLand = onLand ?? null;
    startCrossingLeap(deps.player.x, deps.player.y, toX, toY);
  }

  async function refresh() {
    const map = deps.currentMapId();
    if (!isGuildCrossingMap(map)) return;
    try {
      const next = await deps.source()?.guild?.loadCrossing();
      if (deps.currentMapId() !== map || !next) return;
      const prev = guildCrossingScene.snapshot;
      if (prev) {
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

  /** Handles click / tap on a floating glass slab, island, or portal inside Glass Crossing. */
  function tap(clientX: number, clientY: number): boolean {
    if (!isGuildCrossingMap(deps.currentMapId())) return false;
    if (stepping || guildCrossingScene.fall.active || guildCrossingScene.leap.active) return true;
    const snap = guildCrossingScene.snapshot;
    const cam = deps.camera;
    if (!snap || !cam || cam.zoom <= 0) return true;

    const wx = cam.x + clientX / cam.zoom;
    const wy = cam.y + clientY / cam.zoom;

    // 1. South Return Portal -> leap into portal and return to Town
    if (Math.hypot(wx - GUILD_CROSSING_EXIT_PAD.x, wy - (GUILD_CROSSING_EXIT_PAD.y - 50)) <= 84) {
      beginLeap(GUILD_CROSSING_EXIT_PAD.x, GUILD_CROSSING_EXIT_PAD.y - GUILD_CROSSING_FEET_OFFSET, () => {
        void deps.travel(TOWN_MAP_ID as MapId);
      });
      return true;
    }

    // 2. South Start Island stone deck -> leap onto Start Island bridgehead
    if (Math.hypot(wx - GUILD_CROSSING_CENTER_X, wy - 3_150) <= 220) {
      beginLeap(GUILD_CROSSING_ARRIVAL.x, GUILD_CROSSING_ARRIVAL.y);
      return true;
    }

    // 3. North Victory Portal & Victory Island (unlocked once all 16 steps are revealed)
    if (snap.revealed >= CROSSING_STEPS) {
      if (Math.hypot(wx - GUILD_CROSSING_FINISH_PORTAL.x, wy - (GUILD_CROSSING_FINISH_PORTAL.y + 10)) <= 105) {
        beginLeap(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y + 20 - GUILD_CROSSING_FEET_OFFSET, () => {
          if (snap.completed) return;
          if (snap.remainingToday > 0) {
            triggerStep(CROSSING_STEPS, "finish");
          } else if (noTryCooldown <= 0) {
            noTryCooldown = 5;
            showBanner("0 tries left today · A guildmate with a try can claim Victory!", "#ffd38a");
          }
        });
        return true;
      }
      if (Math.hypot(wx - GUILD_CROSSING_CENTER_X, wy - 505) <= 220) {
        beginLeap(GUILD_CROSSING_CENTER_X, 580 - GUILD_CROSSING_FEET_OFFSET);
        return true;
      }
    }

    // 4. Floating glass slabs (solved emerald tiles + active 50/50 frontier pair)
    const hit = crossingTileAt(wx, wy, 14);
    if (!hit) return true;

    const rect = crossingTileRect(hit.step, hit.side);
    const targetX = rect.cx;
    const targetY = rect.cy - GUILD_CROSSING_FEET_OFFSET;

    // Solved safe emerald slab: anyone (even with 0 tries) can freely leap here!
    if (hit.step < snap.revealed && snap.revealedSides[hit.step] === hit.side) {
      beginLeap(targetX, targetY);
      return true;
    }

    // Active 50/50 frontier slab: leap onto it, then resolve if tries left (or hang out safely at 0 tries!)
    if (hit.step === snap.revealed && !snap.completed) {
      beginLeap(targetX, targetY, () => {
        if (snap.remainingToday > 0) {
          triggerStep(hit.step, hit.side);
        } else if (noTryCooldown <= 0) {
          noTryCooldown = 5;
          showBanner("0 tries left today · Hang out or cheer on your guild!", "#ffd38a");
        }
      });
      return true;
    }

    return true;
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
    tap,
    blocksFreeMove: () => isGuildCrossingMap(deps.currentMapId()),
    update(dt: number) {
      const mapId = deps.currentMapId();
      checkHallPortal(mapId);

      if (!isGuildCrossingMap(mapId)) {
        if (activeMap) {
          activeMap = "";
          stepping = false;
          fallDoneAt = null;
          onLeapLand = null;
          resetGuildCrossingScene();
        }
        return;
      }

      if (activeMap !== mapId) {
        activeMap = mapId;
        pollClock = 0;
        stepping = false;
        fallDoneAt = null;
        onLeapLand = null;
        noTryCooldown = 0;
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

      // Smooth parabolic 2.5D tile-to-tile leap
      const leap = guildCrossingScene.leap;
      if (leap.active) {
        leap.elapsed += dt;
        const t = Math.min(1, leap.elapsed / Math.max(0.01, leap.duration));
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        deps.player.x = leap.fromX + (leap.toX - leap.fromX) * ease;
        deps.player.y = leap.fromY + (leap.toY - leap.fromY) * ease;
        deps.player.moving = false;
        if (t >= 1) {
          leap.active = false;
          deps.player.x = leap.toX;
          deps.player.y = leap.toY;
          syncServerPosition();
          const cb = onLeapLand;
          onLeapLand = null;
          cb?.();
        }
        return;
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
            syncServerPosition();
          }
          stepping = false;
        }
        return;
      }

      if (guildCrossingScene.stepping) {
        guildCrossingScene.stepping.progress = Math.min(1, guildCrossingScene.stepping.progress + dt / SUSPENSE_SECONDS);
      }
    },
    isBusy: () => stepping || guildCrossingScene.fall.active || guildCrossingScene.leap.active,
  };
}
