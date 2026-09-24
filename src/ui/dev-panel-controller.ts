import { createPlayerTravelControl } from "./player-travel-control";
import { createOfflineProgressTestControl } from "./offline-progress-test-control";
import { createBossHitboxOverlayControl } from "./boss-hitbox-overlay-control";
import { createPrestigeUnlockPreviewControl } from "./prestige-unlock-popup";
import { createOtaPanel } from './ota-panel';
import { createBalanceEditorPanel, type BalanceEditorDependencies } from "./balance-editor-panel";
import { createDevModerationLog, type ModerationLogLoader } from "./dev-moderation-log";
import { createDevConsolePanels, type DevConsoleApi } from "./dev-console-panels";
import type { DevConsoleOverview } from "../../shared/dev-console";
import { requiredElement } from "../game/runtime/dom";
import { createDevReviewPanel, type DevReviewApi } from "./dev-review-panel";
import { createDevPlayerPanel, type DevPlayerApi } from "./dev-player-panel";
import type { ConfirmPrompt } from "./confirm-dialog";
import type { PerformanceSnapshot } from "../game/runtime/performance-monitor";
import {
  BROWSER_VIRTUAL_PLAYER_LIMIT,
  VIRTUAL_PLAYER_DEFAULT,
  normalizeVirtualPlayerCount,
} from "../../shared/virtual-player-load-test";
import type { AnalyticsDashboard } from "../coop/services/analytics-types";

type DevPanelTab = "reports" | "bugs" | "muted" | "banned" | "players" | "moderation" | "controls" | "balance" | "performance" | "analytics";

type BugReportEntry = { id: bigint };

type DevPanelMetrics = {
  performance: PerformanceSnapshot;
  enemies: number;
  projectiles: number;
  particles: number;
  remotePlayers: number;
  dpr: number;
  canvasWidth: number;
  canvasHeight: number;
  subscriptions: number;
};

type VirtualPlayerLoadTestState = {
  phase: "idle" | "starting" | "running" | "stopping";
  requested: number;
  connected: number;
  failures: number;
  movementHz: number;
  saveIntervalMs: number;
};

type DevPanelDependencies = {
  teleportPlayer: (query: string) => Promise<void>;
  simulateTimeAway: (seconds: number) => Promise<boolean>;
  offlineWindowRank?: () => number;
  /** Opens the "Prestige N unlocked" window without beating a boss. */
  previewPrestigeUnlock?: () => void;
  balance: BalanceEditorDependencies;
  /** Server calls for the triage tabs; null while disconnected. */
  review: () => (DevReviewApi & DevPlayerApi & DevConsoleApi) | null;
  confirm: ConfirmPrompt;
  /** The server-assigned identity the connection authenticated as. */
  localIdentity: () => string;
  isDeveloper: () => boolean;
  getNameTagVisible: () => boolean;
  setNameTagVisible: (visible: boolean) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  getPresenceVisible: () => boolean;
  setPresenceVisible: (visible: boolean) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  getVirtualPlayerLoadTest: () => VirtualPlayerLoadTestState;
  startVirtualPlayers: (count: number) => Promise<{ ok?: boolean; error?: string; connected?: number; requested?: number } | undefined> | undefined;
  stopVirtualPlayers: () => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  loadModerationLog: ModerationLogLoader;
  getBugReports: () => BugReportEntry[];
  deleteBugReport: (id: bigint) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  loadAnalytics: (fromDayKey: string, toDayKey: string) => Promise<AnalyticsDashboard>;
  getMetrics: () => DevPanelMetrics;
  closeCompetingWindows: () => void;
  showMessage: (message: string, color: string) => void;
};

/** Dev-only UI state, tabs, and live diagnostics. Game code only supplies data. */
export function createDevPanelController(dependencies: DevPanelDependencies) {
  const button = requiredElement("devAuditBtn");
  const settingsRow = requiredElement("developerSettingsRow");
  const panel = requiredElement("devAudit");
  const closeButton = requiredElement("closeDevAuditBtn");
  const gate = requiredElement("devAccessGate");
  const tabList = requiredElement("devAuditTabs");
  const overview = requiredElement("devOverview");
  const tabs: Record<DevPanelTab, HTMLElement> = {
    reports: requiredElement("devReportsTab"),
    bugs: requiredElement("devBugReportsTab"),
    muted: requiredElement("devMutedTab"),
    banned: requiredElement("devBannedTab"),
    players: requiredElement("devPlayersTab"),
    moderation: requiredElement("devModerationTab"),
    controls: requiredElement("devControlsTab"),
    balance: requiredElement("devBalanceTab"),
    performance: requiredElement("devPerformanceTab"),
    analytics: requiredElement("devAnalyticsTab"),
  };
  const tabPanels: Record<DevPanelTab, HTMLElement> = {
    reports: requiredElement("devReportsPanel"),
    bugs: requiredElement("devBugReportsPanel"),
    muted: requiredElement("devMutedPanel"),
    banned: requiredElement("devBannedPanel"),
    players: requiredElement("devPlayersPanel"),
    moderation: requiredElement("devModerationPanel"),
    controls: requiredElement("devControlsPanel"),
    balance: requiredElement("devBalancePanel"),
    performance: requiredElement("devPerformancePanel"),
    analytics: requiredElement("devAnalyticsPanel"),
  };
  const playerTravel = createPlayerTravelControl(tabPanels.controls, { allowed: dependencies.isDeveloper, travel: dependencies.teleportPlayer, showMessage: dependencies.showMessage });
  const offlineProgressTest = createOfflineProgressTestControl(tabPanels.controls, {
    allowed: dependencies.isDeveloper, simulate: dependencies.simulateTimeAway, offlineWindowRank: dependencies.offlineWindowRank, showMessage: dependencies.showMessage,
  });
  const bossHitboxes = createBossHitboxOverlayControl(tabPanels.controls, { allowed: dependencies.isDeveloper });
  const prestigeUnlockPreview = createPrestigeUnlockPreviewControl(tabPanels.controls, {
    allowed: () => dependencies.isDeveloper() && Boolean(dependencies.previewPrestigeUnlock),
    // The popup waits for other windows to clear, so this one steps aside first.
    preview: () => { close(); dependencies.previewPrestigeUnlock?.(); },
  });
  const ota = createOtaPanel(tabPanels.controls);
  const balance = createBalanceEditorPanel(tabPanels.balance, dependencies.balance);
  const moderation = createDevModerationLog(tabPanels.moderation, dependencies.loadModerationLog);
  const players = createDevPlayerPanel(tabPanels.players, {
    api: dependencies.review, confirm: dependencies.confirm, showMessage: dependencies.showMessage, onAccessDenied: denyAccess,
  });
  const reviews = createDevReviewPanel({ reports: tabPanels.reports, bugs: tabPanels.bugs }, {
    api: dependencies.review,
    deleteBug: dependencies.deleteBugReport,
    confirm: dependencies.confirm,
    showMessage: dependencies.showMessage,
    onCounts: ({ reports, bugs }) => showOverview({ ...counts, pendingReports: reports, openBugs: bugs }),
    openPlayer,
  });
  const consolePanels = createDevConsolePanels({ muted: tabPanels.muted, banned: tabPanels.banned }, {
    api: dependencies.review, confirm: dependencies.confirm, showMessage: dependencies.showMessage,
    openPlayer, onOverview: showOverview, onAccessDenied: denyAccess,
  });
  let counts: DevConsoleOverview = { pendingReports: 0, openBugs: 0, muted: 0, banned: 0 };
  const overviewTabs: [keyof DevConsoleOverview, DevPanelTab, string][] = [
    ["pendingReports", "reports", "Reports"], ["openBugs", "bugs", "Bugs"], ["muted", "muted", "Muted"], ["banned", "banned", "Banned"],
  ];

  /** The headline counts, on the strip above the tabs and on the tabs themselves. */
  function showOverview(next: DevConsoleOverview) {
    counts = next;
    const chips = overviewTabs.map(([key, tab, label]) => {
      tabs[tab].textContent = counts[key] ? `${label} (${counts[key]})` : label;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dev-overview-chip";
      chip.dataset.active = String(counts[key] > 0);
      const value = document.createElement("strong");
      value.textContent = String(counts[key]);
      chip.append(value, document.createTextNode(label === "Reports" ? "pending" : label === "Bugs" ? "open bugs" : label.toLowerCase()));
      chip.addEventListener("click", () => setTab(tab));
      return chip;
    });
    overview.replaceChildren(...chips);
  }

  function openPlayer(identity: string, displayName: string) {
    setTab("players");
    players.open(identity, displayName);
  }
  // Identity the server has confirmed for this panel; "" until a developer-gated
  // read succeeds. The button is only a hint: nothing renders until then.
  let confirmedIdentity = "";
  let openGeneration = 0;
  let bugSignature = "";
  let lastBugReload = 0;
  const nameTagToggle = requiredElement<HTMLButtonElement>("devNameTagToggle");
  const presenceStatus = requiredElement("devPresenceStatus");
  const presenceToggle = requiredElement<HTMLButtonElement>("devPresenceToggle");
  const virtualPlayerStatus = requiredElement("devVirtualPlayerStatus");
  const virtualPlayerCount = requiredElement<HTMLInputElement>("devVirtualPlayerCount");
  const virtualPlayerToggle = requiredElement<HTMLButtonElement>("devVirtualPlayerToggle");
  virtualPlayerCount.max = String(BROWSER_VIRTUAL_PLAYER_LIMIT);
  virtualPlayerCount.setAttribute("aria-label", `Browser virtual player count, 1 to ${BROWSER_VIRTUAL_PLAYER_LIMIT}`);
  virtualPlayerCount.value = String(VIRTUAL_PLAYER_DEFAULT);
  const performanceValues = {
    fps: requiredElement("perfFps"),
    workFps: requiredElement("perfWorkFps"),
    frameP50: requiredElement("perfFrameP50"),
    frameP95: requiredElement("perfFrameP95"),
    frameWorst: requiredElement("perfFrameWorst"),
    longFrames: requiredElement("perfLongFrames"),
    renderMs: requiredElement("perfRenderMs"),
    scriptMs: requiredElement("perfScriptMs"),
    enemies: requiredElement("perfEnemies"),
    projectiles: requiredElement("perfProjectiles"),
    particles: requiredElement("perfParticles"),
    remotePlayers: requiredElement("perfRemotePlayers"),
    canvasDpr: requiredElement("perfCanvasDpr"),
    canvasSize: requiredElement("perfCanvasSize"),
    memory: requiredElement("perfMemory"),
    subscriptions: requiredElement("perfSubscriptions"),
  };

  function setTab(tab: DevPanelTab, reloadQueue = true) {
    // The server is authoritative, but keep a stale or manually-unhidden
    // client panel from even attempting developer actions after access is
    // revoked or the identity changes, or before the server has confirmed it.
    if (!dependencies.isDeveloper() || confirmedIdentity !== dependencies.localIdentity()) {
      close();
      return;
    }
    if (tab === "balance") void balance.open(); else balance.close();
    if (tab === "moderation") moderation.open();
    else moderation.clear();
    consolePanels.setActive(tab === "muted" || tab === "banned");
    for (const [name, element] of Object.entries(tabs) as [DevPanelTab, HTMLElement][]) {
      const selected = name === tab;
      element.classList.toggle("is-active", selected);
      element.setAttribute("aria-selected", String(selected));
      tabPanels[name].hidden = !selected;
      // The strip scrolls sideways on a phone; keep the chosen tab in view.
      if (selected) element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
    if (tab === "controls") renderControls();
    if (reloadQueue && (tab === "reports" || tab === "bugs")) void reviews.load().then(result => { if (result.state === "denied") denyAccess(); });
    if (tab === "performance") renderPerformance();
    if (tab === "analytics") void renderAnalytics();
  }

  function renderControls() {
    nameTagToggle.textContent = dependencies.getNameTagVisible() ? "HIDE [dev]" : "SHOW [dev]";
    nameTagToggle.setAttribute("aria-pressed", String(dependencies.getNameTagVisible()));
    const visible = dependencies.getPresenceVisible();
    presenceStatus.textContent = visible ? "VISIBLE · COUNTED ONLINE" : "INVISIBLE · NOT COUNTED ONLINE";
    presenceToggle.textContent = visible ? "GO INVISIBLE" : "APPEAR ONLINE";
    presenceToggle.setAttribute("aria-pressed", String(visible));

    const loadTest = dependencies.getVirtualPlayerLoadTest();
    if (loadTest.phase === "idle") virtualPlayerStatus.textContent = `OFF · BROWSER MAX ${BROWSER_VIRTUAL_PLAYER_LIMIT} · CLI FOR LARGE TESTS`;
    else if (loadTest.phase === "stopping") virtualPlayerStatus.textContent = "STOPPING · ERASING TEST DATA";
    else {
      const failures = loadTest.failures ? ` · ${loadTest.failures} FAILED` : "";
      const movementPerSecond = loadTest.connected * loadTest.movementHz;
      const savesPerSecond = loadTest.connected * 1_000 / loadTest.saveIntervalMs;
      virtualPlayerStatus.textContent = `${loadTest.connected}/${loadTest.requested} · ${movementPerSecond} MOVE/S · ${savesPerSecond.toFixed(1)} SAVE/S${failures}`;
    }
    virtualPlayerCount.disabled = loadTest.phase !== "idle";
    virtualPlayerToggle.disabled = loadTest.phase === "stopping";
    virtualPlayerToggle.textContent = loadTest.phase === "idle" ? "START TEST" : loadTest.phase === "stopping" ? "STOPPING…" : "STOP + ERASE";
    virtualPlayerToggle.setAttribute("aria-pressed", String(loadTest.phase !== "idle"));
  }

  function renderPerformance() {
    if (tabPanels.performance.hidden) return;
    const metrics = dependencies.getMetrics();
    const { performance } = metrics;
    const memory = (globalThis.performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const megabytes = memory ? `${(memory.usedJSHeapSize / 1_048_576).toFixed(1)} MB` : "UNAVAILABLE";
    setValue(performanceValues.fps, `${performance.fps} FPS`);
    setValue(performanceValues.workFps, `${performance.workFps} FPS`);
    setValue(performanceValues.frameP50, `${performance.frameP50Ms.toFixed(1)} ms`);
    setValue(performanceValues.frameP95, `${performance.frameP95Ms.toFixed(1)} ms`);
    setValue(performanceValues.frameWorst, `${performance.worstFrameMs.toFixed(1)} ms`);
    setValue(performanceValues.longFrames, `${performance.longFrames} · ${performance.longestFrameMs.toFixed(0)} ms`);
    setValue(performanceValues.renderMs, `${performance.renderMs.toFixed(1)} ms`);
    setValue(performanceValues.scriptMs, `${performance.updateMs.toFixed(1)} ms`);
    setValue(performanceValues.enemies, String(metrics.enemies));
    setValue(performanceValues.projectiles, String(metrics.projectiles));
    setValue(performanceValues.particles, String(metrics.particles));
    setValue(performanceValues.remotePlayers, String(metrics.remotePlayers));
    setValue(performanceValues.canvasDpr, `${metrics.dpr.toFixed(1)}×`);
    setValue(performanceValues.canvasSize, `${metrics.canvasWidth}×${metrics.canvasHeight}`);
    setValue(performanceValues.memory, megabytes);
    setValue(performanceValues.subscriptions, String(metrics.subscriptions));
  }

  let analyticsRequest = 0;
  async function renderAnalytics() {
    const panel = tabPanels.analytics;
    const request = ++analyticsRequest;
    panel.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "dev-audit-help";
    loading.textContent = "LOADING UTC ANALYTICS…";
    panel.append(loading);
    const today = Math.floor(Date.now() / 86_400_000);
    try {
      const dashboard = await dependencies.loadAnalytics(String(today - 29), String(today));
      if (request !== analyticsRequest || panel.hidden) return;
      panel.replaceChildren(renderAnalyticsDashboard(dashboard));
    } catch (error) {
      if (request !== analyticsRequest || panel.hidden) return;
      const failure = document.createElement("p");
      failure.className = "dev-audit-help dev-analytics-error";
      failure.textContent = error instanceof Error ? error.message : "ANALYTICS UNAVAILABLE";
      panel.replaceChildren(failure);
    }
  }

  function showGate(message: string | null) {
    gate.hidden = message === null;
    gate.textContent = message ?? "";
    tabList.hidden = overview.hidden = message !== null;
    if (message !== null) for (const element of Object.values(tabPanels)) element.hidden = true;
  }

  /**
   * Opens on the pending report queue. That read is developer-gated on the
   * server, so it doubles as the access check: until it succeeds for this
   * identity, no tab renders, whatever local state says.
   */
  async function open() {
    if (!dependencies.isDeveloper()) return;
    const request = ++openGeneration;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    dependencies.closeCompetingWindows();
    const identity = dependencies.localIdentity();
    bugSignature = liveBugSignature();
    if (confirmedIdentity === identity) { showGate(null); setTab("reports"); void consolePanels.load(); return; }
    showGate("Checking developer access…");
    const result = await reviews.load();
    if (request !== openGeneration || panel.hidden) return;
    if (result.state === "denied") { denyAccess(); return; }
    if (result.state === "failed") { showGate(`${result.error} Close and reopen to retry.`); return; }
    confirmedIdentity = identity;
    showGate(null);
    setTab("reports", false);
    void consolePanels.load();
  }

  function liveBugSignature() {
    return dependencies.getBugReports().map(entry => entry.id.toString()).sort().join(",");
  }

  function denyAccess() {
    confirmedIdentity = "";
    reviews.clear();
    players.clear();
    consolePanels.clear();
    close();
    dependencies.showMessage("Developer access required.", "#ff9b91");
  }

  function close() {
    openGeneration++;
    balance.close();
    moderation.clear();
    consolePanels.setActive(false);
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function setDeveloperAccess(developer: boolean) {
    ota.setDeveloperAccess(developer);
    playerTravel.render();
    offlineProgressTest.render();
    prestigeUnlockPreview.render();
    settingsRow.hidden = !developer;
    button.hidden = !developer;
    if (developer) return;
    close();
    // Drop the triage data once, on the way out, not on every HUD refresh.
    if (!confirmedIdentity) return;
    confirmedIdentity = "";
    reviews.clear();
    players.clear();
    consolePanels.clear();
  }

  button.addEventListener("click", () => {
    if (panel.hidden) void open();
    else close();
  });
  closeButton.addEventListener("click", close);
  for (const [tab, element] of Object.entries(tabs) as [DevPanelTab, HTMLElement][]) {
    element.addEventListener("click", () => setTab(tab));
  }
  nameTagToggle.addEventListener("click", async () => {
    if (!dependencies.isDeveloper()) { close(); return; }
    nameTagToggle.disabled = true;
    try {
      const result = await dependencies.setNameTagVisible(!dependencies.getNameTagVisible());
      if (!result?.ok) dependencies.showMessage(result?.error || "NAME TAG UPDATE FAILED", "#ff9b91");
    } finally { nameTagToggle.disabled = false; renderControls(); }
  });
  presenceToggle.addEventListener("click", async () => {
    if (!dependencies.isDeveloper()) { close(); return; }
    const visible = dependencies.getPresenceVisible();
    presenceToggle.disabled = true;
    const result = await dependencies.setPresenceVisible(!visible);
    presenceToggle.disabled = false;
    renderControls();
    dependencies.showMessage(
      result?.ok ? (!visible ? "VISIBLE · NOW ONLINE" : "INVISIBLE · NOW OFFLINE") : result?.error || "PRESENCE UPDATE FAILED",
      result?.ok ? "#72ef58" : "#ff9b91",
    );
  });
  virtualPlayerToggle.addEventListener("click", async () => {
    if (!dependencies.isDeveloper()) { close(); return; }
    const current = dependencies.getVirtualPlayerLoadTest();
    if (current.phase === "stopping") return;
    if (current.phase !== "idle") {
      const pending = dependencies.stopVirtualPlayers();
      renderControls();
      const result = await pending;
      renderControls();
      dependencies.showMessage(
        result?.ok ? "VIRTUAL PLAYERS STOPPED · TEST DATA ERASED" : result?.error || "VIRTUAL PLAYER CLEANUP FAILED",
        result?.ok ? "#72ef58" : "#ff9b91",
      );
      return;
    }

    const count = normalizeVirtualPlayerCount(Number(virtualPlayerCount.value));
    if (count > BROWSER_VIRTUAL_PLAYER_LIMIT) {
      dependencies.showMessage(`BROWSER LIMIT ${BROWSER_VIRTUAL_PLAYER_LIMIT} · USE npm run loadtest:virtual`, "#ffdb84");
      return;
    }
    virtualPlayerCount.value = String(count);
    const pending = dependencies.startVirtualPlayers(count);
    renderControls();
    const result = await pending;
    renderControls();
    dependencies.showMessage(
      result?.ok ? `${result.connected ?? count}/${result.requested ?? count} VIRTUAL PLAYERS RUNNING` : result?.error || "VIRTUAL PLAYER START FAILED",
      result?.ok ? "#72ef58" : "#ff9b91",
    );
  });

  return {
    close,
    isOpen: () => !panel.hidden,
    bossHitboxesVisible: () => bossHitboxes.visible(),
    isPerformanceVisible: () => !tabPanels.performance.hidden,
    refresh: () => {
      if (panel.hidden) return;
      renderControls();
      // A new /bug report arrives on the live developer view; re-read the queue
      // for it, at most every few seconds, while a triage tab is showing.
      const signature = liveBugSignature();
      const triageVisible = !tabPanels.reports.hidden || !tabPanels.bugs.hidden;
      if (signature !== bugSignature && triageVisible && performance.now() - lastBugReload > 5_000) {
        bugSignature = signature;
        lastBugReload = performance.now();
        void reviews.load();
      }
    },
    renderPerformance,
    setDeveloperAccess,
  };
}

function setValue(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

function renderAnalyticsDashboard(data: AnalyticsDashboard) {
  const root = document.createElement("div");
  root.className = "dev-analytics-dashboard";
  const help = document.createElement("p");
  help.className = "dev-audit-help";
  help.textContent = `UTC · ${data.fromDayKey} → ${data.toDayKey} · collection starts with this release`;
  root.append(help);
  const latest = data.days[data.days.length - 1];
  if (latest) root.append(renderAnalyticsCards(latest, data.conversion.total));
  root.append(renderAnalyticsTable("DAILY ACTIVE / NEW / RETURNING", ["DAY", "DAU", "WAU", "MAU", "NEW", "RETURNING", "SESSIONS/PLAYER", "AVG SESSION"], data.days.map(day => [day.dayKey, day.dau, day.wau, day.mau, day.newPlayers, day.returningPlayers, formatNumber(day.sessionsPerPlayer), formatSeconds(day.averageSessionSeconds)])));
  root.append(renderAnalyticsTable("RETENTION COHORTS", ["COHORT", "SIZE", "D1", "D7", "D30"], data.retention.map(cohort => [cohort.cohortDayKey, cohort.size, formatRate(cohort.d1, cohort.d1Rate), formatRate(cohort.d7, cohort.d7Rate), formatRate(cohort.d30, cohort.d30Rate)])));
  root.append(renderAnalyticsTable("MAP / RELEASE ACTIVITY", ["MAP", "VERSION", "PLAYERS", "SESSIONS", "AVG SESSION"], data.activity.slice(0, 40).map(row => [row.mapId, row.releaseVersion, row.players, row.sessions, formatSeconds(row.averageSessionSeconds)])));
  const conversion = document.createElement("p");
  conversion.className = "dev-analytics-note";
  conversion.textContent = `GUEST → ACCOUNT CONVERSIONS · ${data.conversion.total} in range`;
  root.append(conversion);
  const milestone = document.createElement("p");
  milestone.className = "dev-analytics-note";
  milestone.textContent = `MILESTONES · FIRST KILL ${sumCounts(data.milestones.firstKill)} · FIRST BOSS ${sumCounts(data.milestones.firstBoss)} · FIRST PRESTIGE ${sumCounts(data.milestones.firstPrestige)}`;
  root.append(milestone);
  return root;
}

function renderAnalyticsCards(day: AnalyticsDashboard["days"][number], conversions: number) {
  const cards = document.createElement("div");
  cards.className = "dev-analytics-cards";
  for (const [label, value] of [["DAU", day.dau], ["WAU", day.wau], ["MAU", day.mau], ["AVG SESSION", formatSeconds(day.averageSessionSeconds)], ["CONVERSIONS", conversions]] as const) {
    const card = document.createElement("div");
    const title = document.createElement("span"); title.textContent = label;
    const number = document.createElement("strong"); number.textContent = String(value);
    card.append(title, number); cards.append(card);
  }
  return cards;
}

function renderAnalyticsTable(title: string, headings: string[], rows: Array<Array<string | number>>) {
  const section = document.createElement("section");
  section.className = "dev-analytics-section";
  const heading = document.createElement("h3"); heading.textContent = title; section.append(heading);
  const table = document.createElement("table"); table.className = "dev-analytics-table";
  const header = document.createElement("tr");
  for (const value of headings) { const cell = document.createElement("th"); cell.textContent = value; header.append(cell); }
  table.append(header);
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of row) { const cell = document.createElement("td"); cell.textContent = String(value); tr.append(cell); }
    table.append(tr);
  }
  section.append(table);
  return section;
}

function formatSeconds(value: number | null) { return value === null ? "—" : `${value.toFixed(1)}s`; }
function formatNumber(value: number | null) { return value === null ? "—" : value.toFixed(2); }
function formatRate(count: number | null, percentage: number | null) { return count === null ? "—" : `${count} · ${percentage}%`; }
function sumCounts(values: Record<string, number>) { return Object.values(values).reduce((sum, count) => sum + count, 0); }
