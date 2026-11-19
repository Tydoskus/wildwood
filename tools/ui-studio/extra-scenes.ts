// Interactive UI Studio scenes for WildStat's newest & primary windows.
// Runs the real game UI controllers against lightweight in-memory state so you can
// click, switch tabs, cook fish, and step across the Glass Crossing without running SpacetimeDB.
import { craftExperienceForLevel } from "../../shared/crafting";
import { fishingExperienceForLevel, type FishId } from "../../shared/fishing";
import {
  CROSSING_MAX_POINTS, CROSSING_STEPS, GUILD_CROSSING_CENTER_X, GUILD_CROSSING_FINISH_PORTAL,
  crossingFrontierSpawn, crossingPointsForState, crossingTileAt, crossingTileRect,
  type CrossingChoice, type CrossingSide, type GuildCrossingSnapshot,
} from "../../shared/guild-crossing";
import {
  BLACK_BOOTS, DARK_METAL_HELMET, DIAMOND_GALAXY_ARMOR, DIAMOND_GALAXY_BOOTS, DIAMOND_GALAXY_BOW,
  DIAMOND_GALAXY_HELMET, FIRE_METAL_HELMET, GALAXY_ARMOR, GALAXY_BOOTS, GALAXY_BOW, GALAXY_HELMET,
  LEGENDARY_WHITE_GOLD_ARMOR, SAMURAI_HAT, SUPERIOR_GOLDEN_HELMET, WOOD_FULL_HELM,
} from "../../shared/items";
import type { GuildSnapshot } from "../../shared/guilds";
import type { LeaderboardBoard } from "../../shared/leaderboard-window";
import type { OreCounts } from "../../shared/ore-bag";
import { applyProfileIcon } from "../../src/app/profile-icons";
import { GUILD_EMBLEM_SHEET_SOURCES } from "../../src/game/guild-emblems";
import { drawStartingPlayer, loadPlayerAppearanceAssets, type PlayerAppearanceAssets } from "../../src/game/player-appearance";
import {
  createGuildCrossingGroundRenderer, createGuildCrossingOverlayRenderer, crossingShakeOffset, drawCrossingFall,
  type CrossingArtAssets,
} from "../../src/game/runtime/guild-crossing/guild-crossing-render";
import {
  guildCrossingScene as liveCrossingScene, pickCrossingFallCry, resetGuildCrossingScene,
  spawnCrossingPop, spawnCrossingShards, spawnCrossingShockwave, stepCrossingEffects, triggerCrossingShake,
} from "../../src/game/runtime/guild-crossing/guild-crossing-scene";
import { cookingScene } from "../../src/game/runtime/town/cooking-scene";
import { paintSkillBadge, type OverheadSkillKind } from "../../src/game/runtime/town/fishing-badge";
import { fishingScene } from "../../src/game/runtime/town/fishing-scene";
import { miningScene } from "../../src/game/runtime/town/mining-scene";
import { woodcuttingScene } from "../../src/game/runtime/town/woodcutting-scene";
import { createCookingFire } from "../../src/ui/cooking-fire";
import { createGuildPanel } from "../../src/ui/guild-panel";
import { createLeaderboardController } from "../../src/ui/leaderboard-controller";
import { guildQuestStanding } from "../../src/ui/quest-board-controller";
import type { LeaderboardEntry } from "../../src/wildstat-coop";

let loadedMarkup: Promise<Document> | null = null;

/** Loads public/index.html stylesheets into this iframe and returns parsed DOM for importing overlays. */
export async function loadGameMarkup() {
  loadedMarkup ??= (async () => {
    const response = await fetch("index.html");
    if (!response.ok) throw new Error(`index.html: ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    const loads: Promise<unknown>[] = [];
    for (const node of doc.head.querySelectorAll("style, link[rel=stylesheet]")) {
      const copy = document.importNode(node, true) as HTMLElement;
      if (copy instanceof HTMLLinkElement) {
        loads.push(new Promise(resolve => {
          copy.addEventListener("load", resolve, { once: true });
          copy.addEventListener("error", resolve, { once: true });
        }));
      }
      document.head.append(copy);
    }
    await Promise.all(loads);
    return doc;
  })();
  return loadedMarkup;
}

async function importElement(id: string) {
  const doc = await loadGameMarkup();
  const source = doc.getElementById(id);
  if (!source) throw new Error(`index.html has no #${id}`);
  const copy = document.importNode(source, true) as HTMLElement;
  document.body.append(copy);
  return copy;
}

function mockCrossing(mode: "mid" | "finish" | "cleared"): {
  loadCrossing: () => Promise<GuildCrossingSnapshot>;
  stepCrossing: (expectedStep: number, side: CrossingChoice) => Promise<GuildCrossingSnapshot>;
  current: () => GuildCrossingSnapshot;
} {
  const secret: CrossingSide[] = [
    "left", "right", "right", "left", "left", "right", "left", "right",
    "left", "left", "right", "right", "left", "right", "left", "right",
  ];
  const revealed = mode === "mid" ? 8 : CROSSING_STEPS;
  const completed = mode === "cleared";
  let snap: GuildCrossingSnapshot = {
    week: 2928,
    day: 20500,
    resetsAtMs: Date.now() + 86_400_000 * 4 + 3_600_000 * 5,
    nextDayAtMs: Date.now() + 3_600_000 * 7,
    guildId: "7",
    guildName: "OAKS",
    guildEmblem: 12,
    memberCount: 18,
    steps: CROSSING_STEPS,
    revealed,
    completed,
    pointsAwarded: crossingPointsForState(revealed, completed),
    maxPoints: CROSSING_MAX_POINTS,
    fallsCount: mode === "mid" ? 4 : 7,
    dailyLimit: 1,
    usedToday: 0,
    remainingToday: mode === "cleared" ? 0 : 1,
    winnerName: completed ? "Mossheart" : null,
    revealedSides: secret.slice(0, revealed),
    falls: [
      { step: 1, side: "left", name: "Thornbrook", identity: "0xthorn", profileIcon: 4, atMs: Date.now() - 80_000, skinTone: 1, headItem: WOOD_FULL_HELM, chestItem: LEGENDARY_WHITE_GOLD_ARMOR, feetItem: BLACK_BOOTS, rightHandItem: GALAXY_BOW },
      { step: 3, side: "right", name: "Kaelix", identity: "0xkaelix", profileIcon: 7, atMs: Date.now() - 60_000, skinTone: 4, headItem: DARK_METAL_HELMET, chestItem: GALAXY_ARMOR, feetItem: GALAXY_BOOTS, rightHandItem: GALAXY_BOW },
      { step: 5, side: "left", name: "Pyrewing", identity: "0xpyre", profileIcon: 11, atMs: Date.now() - 40_000, skinTone: 2, headItem: FIRE_METAL_HELMET, chestItem: LEGENDARY_WHITE_GOLD_ARMOR, feetItem: BLACK_BOOTS, rightHandItem: DIAMOND_GALAXY_BOW },
      { step: 7, side: "left", name: "Juniper", identity: "0xjuni", profileIcon: 2, atMs: Date.now() - 20_000, skinTone: 0, headItem: SAMURAI_HAT, chestItem: DIAMOND_GALAXY_ARMOR, feetItem: DIAMOND_GALAXY_BOOTS, rightHandItem: DIAMOND_GALAXY_BOW },
      ...(mode !== "mid" ? [
        { step: 10, side: "left" as const, name: "Ashgrove", identity: "0xash", profileIcon: 9, atMs: Date.now() - 15_000, skinTone: 3, headItem: SUPERIOR_GOLDEN_HELMET, chestItem: LEGENDARY_WHITE_GOLD_ARMOR, feetItem: BLACK_BOOTS, rightHandItem: GALAXY_BOW },
        { step: 13, side: "left" as const, name: "Vexlyn", identity: "0xvex", profileIcon: 1, atMs: Date.now() - 10_000, skinTone: 2, headItem: GALAXY_HELMET, chestItem: GALAXY_ARMOR, feetItem: GALAXY_BOOTS, rightHandItem: GALAXY_BOW },
        { step: 15, side: "left" as const, name: "Nyxie", identity: "0xnyx", profileIcon: 6, atMs: Date.now() - 5_000, skinTone: 5, headItem: DIAMOND_GALAXY_HELMET, chestItem: DIAMOND_GALAXY_ARMOR, feetItem: DIAMOND_GALAXY_BOOTS, rightHandItem: DIAMOND_GALAXY_BOW },
      ] : []),
    ],
    pioneers: [
      { step: 0, side: "left", name: "Mossheart", identity: "0xmoss", profileIcon: 0 },
      { step: 2, side: "right", name: "Mossheart", identity: "0xmoss", profileIcon: 0 },
      { step: 4, side: "left", name: "Vexlyn", identity: "0xvex", profileIcon: 1 },
      { step: 6, side: "left", name: "Juniper", identity: "0xjuni", profileIcon: 2 },
    ],
    winner: completed ? { name: "Mossheart", identity: "0xmoss", profileIcon: 0 } : null,
    currentStreak: mode === "mid" ? 2 : 0,
    bestStreak: 4,
  };

  return {
    current: () => snap,
    loadCrossing: async () => ({ ...snap }),
    stepCrossing: async (expectedStep, side) => {
      if (snap.completed) throw new Error("Already cleared this week.");
      if (expectedStep !== snap.revealed) throw new Error("A guildmate just stepped ahead! Refreshing.");
      if (snap.remainingToday <= 0) throw new Error("No tries left today.");
      if (snap.revealed >= CROSSING_STEPS) {
        snap = {
          ...snap,
          completed: true,
          pointsAwarded: CROSSING_MAX_POINTS,
          winnerName: "Mossheart",
          winner: { name: "Mossheart", identity: "0xmoss", profileIcon: 0 },
          currentStreak: snap.currentStreak + 1,
        };
        return { ...snap };
      }
      const safe = secret[snap.revealed];
      const nextRevealed = snap.revealed + 1;
      const isSafe = side === safe;
      const nextCompleted = isSafe && nextRevealed >= CROSSING_STEPS;
      const nextPoints = crossingPointsForState(nextRevealed, nextCompleted);
      snap = {
        ...snap,
        revealed: nextRevealed,
        revealedSides: secret.slice(0, nextRevealed),
        completed: nextCompleted,
        pointsAwarded: Math.max(snap.pointsAwarded, nextPoints),
        winnerName: nextCompleted ? "Mossheart" : snap.winnerName,
        winner: nextCompleted ? { name: "Mossheart", identity: "0xmoss", profileIcon: 0 } : snap.winner,
        usedToday: isSafe ? snap.usedToday : snap.usedToday + 1,
        remainingToday: isSafe ? snap.remainingToday : Math.max(0, snap.remainingToday - 1),
        currentStreak: isSafe ? snap.currentStreak + 1 : 0,
        bestStreak: Math.max(snap.bestStreak, isSafe ? snap.currentStreak + 1 : 0),
        falls: isSafe ? snap.falls : [...snap.falls, { step: expectedStep, side: side as CrossingSide, name: "Mossheart", identity: "0xmoss", profileIcon: 0, atMs: Date.now() }],
        fallsCount: isSafe ? snap.fallsCount : snap.fallsCount + 1,
        pioneers: isSafe ? [...snap.pioneers, { step: expectedStep, side: side as CrossingSide, name: "Mossheart", identity: "0xmoss", profileIcon: 0 }] : snap.pioneers,
      };
      return { ...snap };
    },
  };
}

let studioCrossingArtPromise: Promise<CrossingArtAssets> | null = null;
function loadStudioCrossingArt(): Promise<CrossingArtAssets> {
  studioCrossingArtPromise ??= (async () => {
    const loadImg = (src: string) => new Promise<HTMLImageElement>(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(img);
      img.src = src;
    });
    let playerAssets!: PlayerAppearanceAssets;
    const playerReady = new Promise<void>(resolve => {
      playerAssets = loadPlayerAppearanceAssets(resolve, { lazyEquipment: false });
    });
    const [duelSpaceBackground, duelPlatformArt, portalArch, portalSwirl, guildHallProps, ...emblemImages] = await Promise.all([
      loadImg("assets/wildstat/duel-space-background-v1.webp"),
      loadImg("assets/wildstat/duel-floating-platform-v1.webp"),
      loadImg("assets/wildstat/stone-portal-arch.webp"),
      loadImg("assets/wildstat/portal-swirl-spritesheet.webp"),
      loadImg("assets/wildstat/guild-hall/hall-props.webp"),
      ...GUILD_EMBLEM_SHEET_SOURCES.map(src => loadImg(src)),
    ]);
    await playerReady;
    return {
      duelSpaceBackground, duelPlatformArt, portalArch, portalSwirl, guildHallProps,
      guildEmblemSheets: emblemImages,
      playerAppearanceAssets: playerAssets,
    };
  })();
  return studioCrossingArtPromise;
}

async function guildCrossingScene(mode: "start" | "mid" | "finish" | "cleared") {
  await loadGameMarkup();
  const art = await loadStudioCrossingArt();
  const api = mockCrossing(mode === "start" ? "mid" : mode);
  resetGuildCrossingScene();
  liveCrossingScene.snapshot = api.current();

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;display:block;cursor:pointer;";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;
  const camera = { x: 0, y: 0, zoom: 1 };
  const spawn = mode === "start"
    ? { x: GUILD_CROSSING_CENTER_X, y: 2_975 }
    : crossingFrontierSpawn(api.current().revealed, api.current().completed, api.current().revealedSides);
  const playerPos = { x: spawn.x, y: spawn.y };
  let targetCamY = mode === "finish" ? 685 : mode === "start" ? 3_010 : playerPos.y - 40;
  let clock = 0;
  let stepping = false;

  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });
  const drawGround = createGuildCrossingGroundRenderer({ ctx, camera, viewport, time: () => clock, active: () => true, assets: () => art, drawExitPortal: true });
  const drawOverlay = createGuildCrossingOverlayRenderer({ ctx, camera, viewport, time: () => clock, active: () => true, topInset: 14 });

  // Wheel scroll pans smoothly along the vertical bridge; clicking a frontier glass tile tests it live!
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    targetCamY = Math.max(380, Math.min(3_250, targetCamY + event.deltaY * 0.9));
  }, { passive: false });

  canvas.addEventListener("click", async event => {
    if (stepping) return;
    const rect = canvas.getBoundingClientRect();
    const wx = camera.x + (event.clientX - rect.left) / camera.zoom;
    const wy = camera.y + (event.clientY - rect.top) / camera.zoom;
    const snap = liveCrossingScene.snapshot;
    if (!snap || snap.completed) return;
    if (snap.revealed >= CROSSING_STEPS && Math.hypot(wx - GUILD_CROSSING_FINISH_PORTAL.x, wy - GUILD_CROSSING_FINISH_PORTAL.y) < GUILD_CROSSING_FINISH_PORTAL.r + 48) {
      stepping = true;
      const next = await api.stepCrossing(snap.revealed, "finish").catch(() => null);
      if (next) {
        liveCrossingScene.snapshot = next;
        spawnCrossingShards(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, 44, ["#ffd34d", "#fff2a6", "#7ef7eb", "#7df7a3"]);
        spawnCrossingShockwave(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y, "#ffe27a", 160);
        spawnCrossingPop(GUILD_CROSSING_FINISH_PORTAL.x, GUILD_CROSSING_FINISH_PORTAL.y - 54, "VICTORY! +20 PTS", "#ffe27a", 1.25);
        triggerCrossingShake(9, 0.35);
      }
      stepping = false;
      return;
    }
    const hit = crossingTileAt(wx, wy);
    if (!hit || hit.step !== snap.revealed) return;
    stepping = true;
    const tile = crossingTileRect(hit.step, hit.side);
    playerPos.x = tile.cx; playerPos.y = tile.cy - 29;
    liveCrossingScene.stepping = { step: hit.step, side: hit.side, progress: 0 };
    await new Promise(resolve => setTimeout(resolve, 440));
    liveCrossingScene.stepping = null;
    try {
      const next = await api.stepCrossing(hit.step, hit.side);
      const gained = Math.max(0, next.pointsAwarded - snap.pointsAwarded);
      const fell = next.usedToday > snap.usedToday;
      liveCrossingScene.snapshot = next;
      if (fell) {
        const cry = pickCrossingFallCry(hit.step, "Mossheart");
        spawnCrossingShards(tile.cx, tile.cy, 38);
        triggerCrossingShake(12, 0.40);
        spawnCrossingPop(tile.cx, tile.cy - 28, cry, "#fff", 1.05, true);
        liveCrossingScene.fall = { active: true, progress: 0, elapsed: 0, direction: hit.side === "left" ? -1 : 1, cry };
        await new Promise(resolve => setTimeout(resolve, 760));
        liveCrossingScene.fall.active = false;
      } else {
        liveCrossingScene.safeFlash = { step: hit.step, side: hit.side, left: 0.7 };
        spawnCrossingShockwave(tile.cx, tile.cy, "#7ef7b2", 118);
        spawnCrossingPop(tile.cx, tile.cy - 34, next.currentStreak >= 2 ? `🔥 STREAK ×${next.currentStreak}! +${gained || 2}` : `+${gained || 2} PTS!`, "#ffe27a", 1.1);
      }
      const nextSpawn = crossingFrontierSpawn(next.revealed, next.completed, next.revealedSides);
      playerPos.x = nextSpawn.x; playerPos.y = nextSpawn.y;
      targetCamY = nextSpawn.y - 40;
    } catch (error) {
      liveCrossingScene.banner = { text: error instanceof Error ? error.message : "No tries left today.", color: "#ffd88a", left: 2.5 };
    }
    stepping = false;
  });

  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    stepCrossingEffects(dt);
    if (liveCrossingScene.stepping) {
      liveCrossingScene.stepping.progress = Math.min(1, liveCrossingScene.stepping.progress + dt / 0.44);
    }
    if (liveCrossingScene.fall.active) {
      liveCrossingScene.fall.elapsed += dt;
      liveCrossingScene.fall.progress = Math.min(1, liveCrossingScene.fall.elapsed / 0.72);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const view = viewport();
    if (canvas.width !== Math.round(view.width * dpr) || canvas.height !== Math.round(view.height * dpr)) {
      canvas.width = Math.round(view.width * dpr);
      canvas.height = Math.round(view.height * dpr);
    }
    camera.zoom = view.width < 520 ? Math.max(0.62, view.width / 540) : 0.92;
    camera.x = GUILD_CROSSING_CENTER_X - view.width / (2 * camera.zoom);
    camera.y = targetCamY - view.height / (2 * camera.zoom);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    // Apply world zoom just like the real WildStat camera transform!
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    drawGround();
    if (art.playerAppearanceAssets) {
      const shake = crossingShakeOffset(clock);
      const px = playerPos.x - camera.x - shake.x;
      const py = playerPos.y - camera.y - shake.y;
      drawCrossingFall(ctx, px, py, () => {
        if (!liveCrossingScene.fall.active) {
          ctx.fillStyle = "rgba(0,0,0,0.34)";
          ctx.beginPath(); ctx.ellipse(px, py + 29, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
        }
        drawStartingPlayer(ctx, art.playerAppearanceAssets!, {
          x: px,
          y: py,
          facing: -Math.PI / 2,
          moving: false,
          gameTime: clock,
          skinTone: 2,
          headItem: GALAXY_HELMET,
          chestItem: GALAXY_ARMOR,
          feetItem: GALAXY_BOOTS,
          rightHandItem: GALAXY_BOW,
          alpha: 1,
        });
      });
    }
    drawOverlay();
    ctx.restore();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function guildPanelScene() {
  await loadGameMarkup();
  const crossingApi = mockCrossing("mid");
  const nowMicros = String(BigInt(Date.now()) * 1000n);
  const nextWeekMicros = String(BigInt(Date.now() + 86_400_000 * 4) * 1000n);
  const makeSnapshot = (): GuildSnapshot => {
    const c = crossingApi.current();
    return {
      identity: "0xmoss",
      serverNow: nowMicros,
      week: c.week,
      nextWeekAt: nextWeekMicros,
      joinAfter: "0",
      signedIn: true,
      guild: {
        id: "7",
        name: "OAKS",
        emblem: 12,
        leader: "0xmoss",
        vicePresident: "0xthorn",
        attacksRemaining: 2,
        score: 18,
        totalPower: 842_000_000,
        requestOnly: false,
        requests: [],
        members: [
          { identity: "0xmoss", name: "Mossheart", profileIcon: 0, power: 347_000_000, prestige: 5, online: true, eligibleAt: "0", questsDone: 15, questsTotal: 15, questPoints: 22, questsCollected: 7 },
          { identity: "0xthorn", name: "Thornbrook", profileIcon: 4, power: 215_000_000, prestige: 4, online: true, eligibleAt: "0", questsDone: 15, questsTotal: 15, questPoints: 15 },
          { identity: "0xkaelix", name: "Kaelix", profileIcon: 7, power: 162_000_000, prestige: 3, online: false, lastSeenAtMs: Date.now() - 3_600_000, eligibleAt: "0", questsDone: 11, questsTotal: 15, questPoints: 11 },
          { identity: "0xjuni", name: "Juniper", profileIcon: 2, power: 118_000_000, prestige: 2, online: true, eligibleAt: "0", questsDone: 8, questsTotal: 15, questPoints: 8 },
        ],
        questCollect: { ready: true, left: 8, pool: 244, poolSize: 300 },
        crossing: {
          revealed: c.revealed,
          steps: c.steps,
          completed: c.completed,
          pointsAwarded: c.pointsAwarded,
          maxPoints: c.maxPoints,
          fallsCount: c.fallsCount,
          dailyLimit: c.dailyLimit,
          usedToday: c.usedToday,
          remainingToday: c.remainingToday,
          winnerName: c.winnerName,
        },
      },
      directory: [
        { id: "11", name: "VALE", emblem: 3, members: 19, totalPower: 910_000_000, challengedToday: false },
        { id: "14", name: "RIFT", emblem: 8, members: 16, totalPower: 620_000_000, challengedToday: true },
      ],
      nextPage: null,
      standings: [
        { id: "11", name: "VALE", emblem: 3, members: 19, score: 21, wins: 7, battles: 8 },
        { id: "7", name: "OAKS", emblem: 12, members: 18, score: 18, wins: 6, battles: 7 },
        { id: "14", name: "RIFT", emblem: 8, members: 16, score: 15, wins: 5, battles: 7 },
      ],
      battles: [],
    };
  };

  const panel = createGuildPanel({
    api: () => ({
      cancel: () => {},
      loadGuild: async () => makeSnapshot(),
      loadGuildPreview: async () => ({ id: "11", name: "VALE", emblem: 3, leader: "0x1", vicePresident: null, score: 21, members: [], requestOnly: false }),
      battleBadges: async () => [],
      loadReplay: async () => { throw new Error("No replay in studio mock"); },
      guildAction: async () => {},
      loadCrossing: crossingApi.loadCrossing,
      stepCrossing: crossingApi.stepCrossing,
    }),
    sessionKey: () => "studio-session",
    beforeOpen: () => {},
    onClose: () => {},
    questStanding: () => {
      const pts = 56 + crossingApi.current().pointsAwarded;
      return guildQuestStanding(
        { day: 20500, quests: [], bonus: 1.24, guildPoints: pts, guildName: "OAKS" },
        [
          { guildId: "11", guildName: "VALE", points: 112 },
          { guildId: "7", guildName: "OAKS", points: pts },
          { guildId: "14", guildName: "RIFT", points: 48 },
        ],
      );
    },
  });
  panel.open("quests");
}

async function cookingFireScene(empty = false) {
  await loadGameMarkup();
  const stock: Record<string, number> = empty ? {} : {
    minnow: 838,
    perch: 757,
    bluegill: 629,
    eel: 495,
    trout: 483,
    carp: 385,
    salmon: 340,
    tuna: 270,
    lobster: 42,
    shark: 12,
  };
  let xp = BigInt(craftExperienceForLevel(28)) + 420n;
  const fire = createCookingFire({
    ores: () => stock,
    xp: () => xp,
    skillet: () => 2,
    cook: async (fish: FishId, recipe: string, begin: boolean) => {
      if (!begin) {
        const costs: Record<string, number> = { skewer: 1, cakes: 2, chowder: 3, pie: 4, platter: 5, feast: 6 };
        const portions: Record<string, number> = { skewer: 1, cakes: 3, chowder: 5, pie: 8, platter: 12, feast: 18 };
        const take = costs[recipe] ?? 1;
        stock[fish] = Math.max(0, (stock[fish] ?? 0) - take);
        stock[`cooked_${fish}`] = (stock[`cooked_${fish}`] ?? 0) + (portions[recipe] ?? 1);
        xp += 65n;
      }
      return { ok: true };
    },
  });
  fire.open();
}

async function leaderboardScene() {
  await loadGameMarkup();
  const overlay = await importElement("leaderboardOverlay");
  overlay.hidden = false;
  const dummyBtn = document.createElement("button");
  const mockPlayers: LeaderboardEntry[] = [
    { identity: "0xash", displayName: "Ashgrove", power: 347_000_000, prestige: 6, damage: 1, health: 1, speed: 1, armor: 1, regen: 1, crit: 1, playSeconds: 185_000, joinedAtMs: Date.now() - 90 * 86_400_000, profileIcon: 9, skinTone: 1, gender: 0, rightHand: "", leftHand: "", head: "", body: "", legs: "", feet: "", guildTag: "OAKS" },
    { identity: "0xmoss", displayName: "Mossheart", power: 215_000_000, prestige: 5, damage: 1, health: 1, speed: 1, armor: 1, regen: 1, crit: 1, playSeconds: 142_000, joinedAtMs: Date.now() - 75 * 86_400_000, profileIcon: 0, skinTone: 0, gender: 1, rightHand: "", leftHand: "", head: "", body: "", legs: "", feet: "", guildTag: "OAKS" },
    { identity: "0xkaelix", displayName: "Kaelix", power: 162_000_000, prestige: 4, damage: 1, health: 1, speed: 1, armor: 1, regen: 1, crit: 1, playSeconds: 98_000, joinedAtMs: Date.now() - 60 * 86_400_000, profileIcon: 7, skinTone: 2, gender: 0, rightHand: "", leftHand: "", head: "", body: "", legs: "", feet: "", guildTag: "VALE" },
    { identity: "0xpyre", displayName: "Pyrewing", power: 88_000_000, prestige: 3, damage: 1, health: 1, speed: 1, armor: 1, regen: 1, crit: 1, playSeconds: 64_000, joinedAtMs: Date.now() - 40 * 86_400_000, profileIcon: 11, skinTone: 1, gender: 0, rightHand: "", leftHand: "", head: "", body: "", legs: "", feet: "", guildTag: "RIFT" },
    { identity: "0xjuni", displayName: "Juniper", power: 34_000_000, prestige: 2, damage: 1, health: 1, speed: 1, armor: 1, regen: 1, crit: 1, playSeconds: 31_000, joinedAtMs: Date.now() - 25 * 86_400_000, profileIcon: 2, skinTone: 0, gender: 1, rightHand: "", leftHand: "", head: "", body: "", legs: "", feet: "", guildTag: "OAKS" },
  ];
  const scoreFor = (board: LeaderboardBoard, idx: number) => {
    if (board === "skill:fishing") return fishingExperienceForLevel(Math.max(12, 82 - idx * 14)) + 900;
    if (board === "skill:mining") return Math.max(400, 107_400 - idx * 21_000);
    if (board === "skill:woodcutting") return Math.max(300, 64_200 - idx * 12_500);
    if (board.startsWith("skill:")) return craftExperienceForLevel(Math.max(10, 76 - idx * 13)) + 500;
    return undefined;
  };
  const controller = createLeaderboardController({
    button: dummyBtn,
    overlay,
    closeButton: overlay.querySelector<HTMLElement>("#closeLeaderboardBtn")!,
    tabs: {
      rivals: overlay.querySelector<HTMLElement>("#leaderboardRivalsTab")!,
      power: overlay.querySelector<HTMLElement>("#leaderboardPowerTab")!,
      prestige: overlay.querySelector<HTMLElement>("#leaderboardPrestigeTab")!,
      time: overlay.querySelector<HTMLElement>("#leaderboardTimeTab")!,
      skills: overlay.querySelector<HTMLElement>("#leaderboardSkillsTab")!,
    },
    valueHeading: overlay.querySelector<HTMLElement>("#leaderboardValueHeading")!,
    podium: overlay.querySelector<HTMLElement>("#leaderboardPodium")!,
    rows: overlay.querySelector<HTMLElement>("#leaderboardRows")!,
    loading: overlay.querySelector<HTMLElement>("#leaderboardLoading")!,
    empty: overlay.querySelector<HTMLElement>("#leaderboardEmpty")!,
    filterChips: overlay.querySelector<HTMLElement>("#leaderboardFilterChips")!,
    filterHeading: overlay.querySelector<HTMLElement>("#leaderboardFilterHeading")!,
  }, {
    loadPage: async (board: LeaderboardBoard) => ({
      entries: mockPlayers.map((entry, i) => ({ ...entry, rank: i + 1, skillScore: scoreFor(board, i) })),
      podium: mockPlayers.slice(0, 3).map((entry, i) => ({ ...entry, rank: i + 1, skillScore: scoreFor(board, i) })),
      startRank: 1,
      endRank: mockPlayers.length,
      localRank: 2,
      total: mockPlayers.length,
    }),
    localIdentity: () => "0xmoss",
    isDeveloper: () => false,
    paintProfileIcon: (canvas, identity) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#263344";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(identity.slice(2, 4).toUpperCase(), canvas.width / 2, canvas.height / 2);
    },
    drawPodiumCharacter: () => {},
    openProfile: () => {},
    beforeOpen: () => {},
  });
  controller.open();
  overlay.querySelector<HTMLButtonElement>("#leaderboardSkillsTab")?.click();
}

async function skillBadgesScene() {
  await loadGameMarkup();
  fishingScene.experience = fishingExperienceForLevel(42) + 4_200;
  fishingScene.gain = 90;
  fishingScene.gainLeft = 0.72;
  miningScene.level = 107_400;
  miningScene.gain = 8;
  miningScene.gainLeft = 0.72;
  woodcuttingScene.level = 215;
  woodcuttingScene.gain = 4;
  woodcuttingScene.gainLeft = 0.72;
  cookingScene.experience = craftExperienceForLevel(28) + 640;
  cookingScene.gain = 48;
  cookingScene.gainLeft = 0.72;

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:14px;";
  const canvas = document.createElement("canvas");
  canvas.width = 340 * 2;
  canvas.height = 420 * 2;
  canvas.style.cssText = "width:340px;height:420px;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:linear-gradient(180deg,#2a5438,#1d3b2b);";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  const items: [OverheadSkillKind, string, number][] = [
    ["fishing", "Fishing (1–99 level)", 92],
    ["mining", "Mining (uncapped stat)", 192],
    ["woodcutting", "Woodcutting (mid-unlock)", 292],
    ["cooking", "Cooking (1–99 level)", 392],
  ];
  for (const [kind, caption, y] of items) {
    ctx.save();
    ctx.translate(170, y);
    paintSkillBadge(ctx, 0, kind);
    ctx.font = "700 11px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.textAlign = "center";
    ctx.fillText(caption, 0, 14);
    ctx.restore();
  }
  wrap.append(canvas);
  document.body.append(wrap);
}

export const EXTRA_SCENES: Record<string, () => Promise<void>> = {
  "guild-crossing": () => guildCrossingScene("mid"),
  "guild-crossing-start": () => guildCrossingScene("start"),
  "guild-crossing-finish": () => guildCrossingScene("finish"),
  "guild-crossing-cleared": () => guildCrossingScene("cleared"),
  "guild-panel": guildPanelScene,
  "cooking-fire": () => cookingFireScene(false),
  "cooking-fire-empty": () => cookingFireScene(true),
  "leaderboard": leaderboardScene,
  "skill-badges": skillBadgesScene,
};
