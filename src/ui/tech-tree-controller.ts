import { RESEARCH_DEFINITIONS, researchDurationMs, type ResearchId } from "../../shared/research";

export type ResearchRanks = Record<ResearchId, number>;
export type ActiveResearch = {
  researchId: ResearchId;
  startedAtMs: number;
  completesAtMs: number;
};

type ResearchResult = { ok: boolean; error?: string } | undefined;

export type TechTreeControllerElements = {
  button: HTMLElement;
  notice: HTMLElement;
  overlay: HTMLElement;
  closeButton: HTMLElement;
  active: HTMLElement;
  canvas: HTMLCanvasElement;
  map: HTMLElement;
  detail: HTMLElement;
  detailContent: HTMLElement;
  closeDetailButton: HTMLElement;
};

export type TechTreeControllerHooks = {
  researchRanks: () => ResearchRanks;
  activeResearch: () => ActiveResearch | null;
  startResearch: (researchId: ResearchId) => Promise<ResearchResult>;
  showMessage: (message: string, color: string) => void;
  beforeOpen: () => void;
  nowMs: () => number;
};

const techNodeResearch: Record<string, ResearchId | null> = {
  foundations: "foraging",
  war: "warcraft",
  "move-speed": "moveSpeed",
  prosperity: "prosperity",
  vitality: "vitality",
  precision: "precision",
  "critical-chance": "criticalChance",
  "critical-damage": "criticalDamage",
};

export function createTechTreeController(elements: TechTreeControllerElements, hooks: TechTreeControllerHooks) {
  const { button, notice, overlay, closeButton, active, canvas, map, detail, detailContent, closeDetailButton } = elements;
  const futureTechTreePaths: [string, string][] = [];
  let priorFutureNodes = ["future-h"];
  const futureRowCounts = Array.from({ length: 19 }, (_, index) => index === 18 ? 1 : index % 2 === 0 ? 2 : 1);
  let futureNodeNumber = 9;
  for (const count of futureRowCounts) {
    const tier = document.createElement("div");
    tier.className = `tech-tree-tier${count === 2 ? " tech-tree-tier-bottom" : ""}`;
    const nextFutureNodes: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const nodeId = `future-${futureNodeNumber++}`;
      nextFutureNodes.push(nodeId);
      const node = document.createElement("button");
      node.className = "tech-tree-node tech-tree-node-placeholder";
      node.type = "button";
      node.disabled = true;
      node.dataset.techNode = nodeId;
      node.setAttribute("aria-label", "Future technology");
      tier.append(node);
    }
    for (const from of priorFutureNodes) for (const to of nextFutureNodes) futureTechTreePaths.push([from, to]);
    map.append(tier);
    priorFutureNodes = nextFutureNodes;
  }

  let selectedResearchId: ResearchId = "warcraft";
  let researchRequestPending = false;
  let nextRenderAt = 0;

  function formatResearchTime(milliseconds: number) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function requirementsMet(researchId: ResearchId, ranks = hooks.researchRanks()) {
    return Object.entries(RESEARCH_DEFINITIONS[researchId].prerequisites ?? {})
      .every(([id, rank]) => ranks[id as ResearchId] >= rank!);
  }

  function requirementText(researchId: ResearchId) {
    const requirements = Object.entries(RESEARCH_DEFINITIONS[researchId].prerequisites ?? {});
    return requirements.length
      ? requirements.map(([id, rank]) => `${RESEARCH_DEFINITIONS[id as ResearchId].effect} ${rank}`).join(" + ")
      : "FOUNDATIONS";
  }

  function drawLinks() {
    const viewport = canvas.parentElement;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const treeCtx = canvas.getContext("2d");
    if (!treeCtx) return;
    treeCtx.setTransform(scale, 0, 0, scale, 0, 0);
    treeCtx.clearRect(0, 0, bounds.width, bounds.height);
    const center = (node: string) => {
      const element = document.querySelector<HTMLButtonElement>(`[data-tech-node="${node}"]`);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
    };
    const paths: [string, string][] = [
      ["foundations", "war"], ["foundations", "move-speed"], ["war", "vitality"], ["war", "precision"],
      ["vitality", "prosperity"], ["precision", "prosperity"], ["prosperity", "critical-chance"],
      ["critical-chance", "critical-damage"], ["critical-damage", "future-c"], ["critical-damage", "future-d"], ["future-c", "future-e"],
      ["future-d", "future-e"], ["future-e", "future-f"], ["future-e", "future-g"], ["future-f", "future-h"],
      ["future-g", "future-h"], ...futureTechTreePaths,
    ];
    treeCtx.strokeStyle = "rgba(191, 198, 207, .52)";
    treeCtx.lineWidth = 3;
    for (const [from, to] of paths) {
      const start = center(from);
      const end = center(to);
      if (!start || !end) continue;
      treeCtx.beginPath();
      treeCtx.moveTo(start.x, start.y);
      treeCtx.lineTo(end.x, end.y);
      treeCtx.stroke();
    }
  }

  function updateNotice() {
    const current = hooks.activeResearch();
    notice.hidden = Boolean(current && current.completesAtMs > hooks.nowMs());
  }

  function render() {
    const ranks = hooks.researchRanks();
    const current = hooks.activeResearch();
    const activeRemaining = current ? current.completesAtMs - hooks.nowMs() : 0;
    updateNotice();
    active.textContent = current
      ? activeRemaining > 0
        ? `${RESEARCH_DEFINITIONS[current.researchId].effect} · ${formatResearchTime(activeRemaining)} · SERVER TIMER`
        : `${RESEARCH_DEFINITIONS[current.researchId].effect} · FINALIZING`
      : "NO RESEARCH ACTIVE";

    for (const node of document.querySelectorAll<HTMLButtonElement>("[data-tech-node]")) {
      const researchId = techNodeResearch[node.dataset.techNode ?? ""];
      if (!researchId) continue;
      const definition = RESEARCH_DEFINITIONS[researchId];
      const rank = ranks[researchId];
      const available = !current && rank < definition.maxRank && requirementsMet(researchId, ranks);
      node.classList.toggle("is-available", available);
      node.classList.toggle("is-complete", rank >= definition.maxRank);
      node.classList.toggle("is-active", current?.researchId === researchId);
      node.classList.toggle("is-locked", !available && rank < definition.maxRank && current?.researchId !== researchId);
      node.setAttribute("aria-pressed", String(selectedResearchId === researchId));
      const title = node.querySelector("strong");
      if (title) title.textContent = definition.effect;
      const small = node.querySelector("small");
      if (small) small.textContent = `${rank} / ${definition.maxRank}`;
    }

    const definition = RESEARCH_DEFINITIONS[selectedResearchId];
    const rank = ranks[selectedResearchId];
    const duration = researchDurationMs(selectedResearchId, rank);
    const canStart = !current && rank < definition.maxRank && requirementsMet(selectedResearchId, ranks);
    detailContent.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = `${definition.icon} ${definition.effect} · ${rank} / ${definition.maxRank}`;
    const description = document.createElement("span");
    description.textContent = definition.valuePerRank > 0
      ? `${definition.valuePerRank}% PER RANK`
      : `REQUIRES ${requirementText(selectedResearchId)}`;
    detailContent.append(title, description);
    if (definition.valuePerRank > 0) {
      const effectValue = document.createElement("div");
      effectValue.className = "tech-tree-effect-value";
      effectValue.textContent = `+${definition.valuePerRank}%`;
      detailContent.append(effectValue);
    }
    const time = document.createElement("div");
    time.className = "tech-tree-research-time";
    const timeLabel = document.createElement("span");
    timeLabel.textContent = current?.researchId === selectedResearchId && activeRemaining > 0 ? "RESEARCH REMAINING" : "NEXT RESEARCH";
    const timeValue = document.createElement("strong");
    timeValue.textContent = formatResearchTime(current?.researchId === selectedResearchId && activeRemaining > 0 ? activeRemaining : duration);
    time.append(timeLabel, timeValue);
    detailContent.append(time);
    if (current?.researchId === selectedResearchId && activeRemaining > 0) {
      const totalDuration = Math.max(1, current.completesAtMs - current.startedAtMs);
      const timer = document.createElement("div");
      timer.className = "tech-tree-timer";
      const label = document.createElement("span");
      label.className = "tech-tree-timer-label";
      label.textContent = "RESEARCH PROGRESS";
      const track = document.createElement("div");
      track.className = "tech-tree-timer-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", String(totalDuration));
      track.setAttribute("aria-valuenow", String(Math.max(0, activeRemaining)));
      const fill = document.createElement("div");
      fill.className = "tech-tree-timer-fill";
      fill.style.setProperty("--research-remaining", String(Math.max(0, Math.min(1, activeRemaining / totalDuration))));
      track.append(fill);
      timer.append(label, track);
      detailContent.append(timer);
    }
    const action = document.createElement("button");
    action.className = "primary-button tech-tree-action";
    action.disabled = researchRequestPending || Boolean(current) || (!current && !canStart);
    action.textContent = current
      ? activeRemaining <= 0 ? "FINALIZING RESEARCH" : "RESEARCH IN PROGRESS"
      : rank >= definition.maxRank ? "RESEARCH COMPLETE" : canStart ? "START RESEARCH" : `REQUIRES ${requirementText(selectedResearchId)}`;
    action.addEventListener("click", () => { void triggerAction(); });
    detailContent.append(action);
    drawLinks();
  }

  async function triggerAction() {
    const current = hooks.activeResearch();
    researchRequestPending = true;
    render();
    const result = current ? { ok: false, error: "RESEARCH IN PROGRESS" } : await hooks.startResearch(selectedResearchId);
    researchRequestPending = false;
    if (!result?.ok) hooks.showMessage(result?.error ?? "RESEARCH UNAVAILABLE", "#ff9b91");
    render();
  }

  function open() {
    overlay.hidden = false;
    detail.hidden = true;
    button.setAttribute("aria-expanded", "true");
    hooks.beforeOpen();
    render();
  }

  function close() {
    overlay.hidden = true;
    detail.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  closeDetailButton.addEventListener("click", () => { detail.hidden = true; });
  addEventListener("resize", () => { if (!overlay.hidden) drawLinks(); });
  canvas.parentElement?.addEventListener("scroll", () => { if (!overlay.hidden) drawLinks(); }, { passive: true });
  for (const node of document.querySelectorAll<HTMLButtonElement>("[data-tech-node]")) {
    node.addEventListener("click", () => {
      const researchId = techNodeResearch[node.dataset.techNode ?? ""];
      if (!researchId) return;
      selectedResearchId = researchId;
      detail.hidden = false;
      render();
    });
  }

  return {
    close,
    isOpen: () => !overlay.hidden,
    render,
    tick(now: number) {
      if (overlay.hidden || now < nextRenderAt) return;
      nextRenderAt = now + 1_000;
      render();
    },
    updateNotice,
  };
}
