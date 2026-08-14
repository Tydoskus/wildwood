import { requiredElement } from "../game/runtime/dom";
import type { PerformanceSnapshot } from "../game/runtime/performance-monitor";

type DevPanelTab = "controls" | "bugs" | "cutscenes" | "performance";

type BugReportEntry = {
  id: bigint;
  reportedAtMs: number;
  reporterName: string;
  protocolVersion: number;
  message: string;
};

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

type DevPanelDependencies = {
  isDeveloper: () => boolean;
  getPresenceVisible: () => boolean;
  setPresenceVisible: (visible: boolean) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  getBugReports: () => BugReportEntry[];
  deleteBugReport: (id: bigint) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
  getMetrics: () => DevPanelMetrics;
  closeCompetingWindows: () => void;
  showMessage: (message: string, color: string) => void;
};

/** Dev-only UI state, tabs, and live diagnostics. Game code only supplies data. */
export function createDevPanelController(dependencies: DevPanelDependencies) {
  const button = requiredElement("devAuditBtn");
  const panel = requiredElement("devAudit");
  const closeButton = requiredElement("closeDevAuditBtn");
  const tabs: Record<DevPanelTab, HTMLElement> = {
    controls: requiredElement("devControlsTab"),
    bugs: requiredElement("devBugReportsTab"),
    cutscenes: requiredElement("devCutscenesTab"),
    performance: requiredElement("devPerformanceTab"),
  };
  const tabPanels: Record<DevPanelTab, HTMLElement> = {
    controls: requiredElement("devControlsPanel"),
    bugs: requiredElement("devBugReportsPanel"),
    cutscenes: requiredElement("devCutscenesPanel"),
    performance: requiredElement("devPerformancePanel"),
  };
  const presenceStatus = requiredElement("devPresenceStatus");
  const presenceToggle = requiredElement<HTMLButtonElement>("devPresenceToggle");
  const bugRows = requiredElement("devBugReportRows");
  const bugEmpty = requiredElement("devBugReportEmpty");
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

  function setTab(tab: DevPanelTab) {
    for (const [name, element] of Object.entries(tabs) as [DevPanelTab, HTMLElement][]) {
      const selected = name === tab;
      element.classList.toggle("is-active", selected);
      element.setAttribute("aria-selected", String(selected));
      tabPanels[name].hidden = !selected;
    }
    if (tab === "controls") renderControls();
    if (tab === "bugs") renderBugReports();
    if (tab === "performance") renderPerformance();
  }

  function renderControls() {
    const visible = dependencies.getPresenceVisible();
    presenceStatus.textContent = visible ? "VISIBLE · COUNTED ONLINE" : "INVISIBLE · NOT COUNTED ONLINE";
    presenceToggle.textContent = visible ? "GO INVISIBLE" : "APPEAR ONLINE";
    presenceToggle.setAttribute("aria-pressed", String(visible));
  }

  function renderBugReports() {
    const entries = dependencies.getBugReports()
      .sort((a, b) => b.reportedAtMs - a.reportedAtMs || Number(b.id - a.id));
    bugRows.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "dev-bug-report";
      const content = document.createElement("div");
      const meta = document.createElement("div");
      meta.className = "dev-bug-report-meta";
      meta.textContent = `[${new Date(entry.reportedAtMs).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}] ${entry.reporterName} · P${entry.protocolVersion}`;
      const message = document.createElement("div");
      message.className = "dev-bug-report-message";
      message.textContent = `> ${entry.message}`;
      content.append(meta, message);
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "dev-bug-report-clear";
      clear.textContent = "CLEAR";
      clear.addEventListener("click", async () => {
        clear.disabled = true;
        const result = await dependencies.deleteBugReport(entry.id);
        if (!result?.ok) {
          clear.disabled = false;
          dependencies.showMessage(result?.error || "BUG REPORT DELETE FAILED", "#ff9b91");
        }
      });
      row.append(content, clear);
      bugRows.appendChild(row);
    }
    bugEmpty.hidden = entries.length > 0;
    bugRows.hidden = entries.length === 0;
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

  function open() {
    if (!dependencies.isDeveloper()) return;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    dependencies.closeCompetingWindows();
    setTab("controls");
  }

  function close() {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function setDeveloperAccess(developer: boolean) {
    button.hidden = !developer;
    if (!developer) close();
  }

  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  for (const [tab, element] of Object.entries(tabs) as [DevPanelTab, HTMLElement][]) {
    element.addEventListener("click", () => setTab(tab));
  }
  presenceToggle.addEventListener("click", async () => {
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

  return {
    close,
    isOpen: () => !panel.hidden,
    isPerformanceVisible: () => !tabPanels.performance.hidden,
    refresh: () => {
      if (panel.hidden) return;
      renderControls();
      renderBugReports();
    },
    renderPerformance,
    setDeveloperAccess,
  };
}

function setValue(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}
