import { formatRemaining } from "./format-remaining";
import {
  RESEARCH_DEFINITIONS,
  POWER_RESEARCH_IDS,
  UTILITY_RESEARCH_IDS,
  researchDurationMs,
  researchIsAvailable as sharedResearchIsAvailable,
  researchPrerequisitesForNextRank,
  researchRankBandEnd,
  researchRankBandStart,
  type ResearchId,
  type ResearchTree,
  type ResearchRanks as SharedResearchRanks,
} from "../../shared/research";
import { researchSpeedUpGemCost } from "../../shared/gems";
import { createTechTreeLayout, type TechTreeNode } from "./tech-tree-layout";
import { gemSpendConfirmation } from "./gem-spend-confirmation";
import { gameConfirm, type ConfirmPrompt, type ConfirmRequest } from "./confirm-dialog";

export type ResearchRanks = SharedResearchRanks;
export type ActiveResearch = {
  researchId: ResearchId;
  targetRank: number;
  startedAtMs: number;
  completesAtMs: number;
};

type ResearchResult = { ok: boolean; error?: string } | undefined;

export type TechTreeControllerElements = {
  notice: HTMLElement;
  overlay: HTMLElement;
  title: HTMLElement;
  categories: HTMLElement;
  viewport: HTMLElement;
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
  gemBalance: () => bigint;
  speedUpResearch: () => Promise<ResearchResult>;
  confirmGemSpend?: ConfirmPrompt;
  showMessage: (message: string, color: string) => void;
  localIdentity: () => string;
  isConnected: () => boolean;
  onResearchFinished?: (research: ActiveResearch) => void;
  beforeOpen: () => void;
  nowMs: () => number;
};

export function researchIsAvailable(researchId: ResearchId, ranks: ResearchRanks) {
  return sharedResearchIsAvailable(researchId, ranks);
}

export function hasAvailableResearch(ranks: ResearchRanks) {
  return Object.values(RESEARCH_DEFINITIONS).some((definition) => researchIsAvailable(definition.id, ranks));
}

export function researchProgressLabel(researchId: ResearchId, rank: number, rankBandIndex: number) {
  const start = researchRankBandStart(researchId, rankBandIndex);
  const end = researchRankBandEnd(researchId, rankBandIndex);
  const localRank = Math.max(0, Math.min(end - start, rank - start));
  return `${localRank} / ${end - start}`;
}

export function researchElapsedRatio(startedAtMs: number, completesAtMs: number, nowMs: number) {
  const duration = Math.max(1, completesAtMs - startedAtMs);
  return Math.max(0, Math.min(1, (nowMs - startedAtMs) / duration));
}

export function researchFocusNode(nodes: TechTreeNode[], ranks: ResearchRanks, current: ActiveResearch | null) {
  const activeNode = current && nodes.find((node) => node.researchId === current.researchId &&
    current.targetRank > node.startRank && current.targetRank <= node.endRank);
  return activeNode || nodes.find((node) => ranks[node.researchId] >= node.startRank &&
    ranks[node.researchId] < node.endRank && researchIsAvailable(node.researchId, ranks))
    || nodes.find((node) => ranks[node.researchId] < node.endRank)
    || nodes[nodes.length - 1];
}

/** Waits for a server-confirmed rank, even if the active row disappears first. */
export function createResearchCompletionTracker() {
  let owner = "";
  const pending = new Map<string, ActiveResearch>();
  return {
    poll(identity: string, connected: boolean, current: ActiveResearch | null, ranks: ResearchRanks) {
      if (!connected || !identity) {
        owner = "";
        pending.clear();
        return [];
      }
      if (owner !== identity) {
        owner = identity;
        pending.clear();
      }
      const completed: ActiveResearch[] = [];
      for (const [key, research] of pending) {
        if (ranks[research.researchId] < research.targetRank) continue;
        completed.push(research);
        pending.delete(key);
      }
      if (current && ranks[current.researchId] < current.targetRank) {
        pending.set(`${current.researchId}:${current.targetRank}`, current);
      }
      return completed;
    },
  };
}

export function centerResearchNode(viewport: HTMLElement, node: HTMLElement) {
  const viewportBounds = viewport.getBoundingClientRect();
  const nodeBounds = node.getBoundingClientRect();
  // offsetTop is relative to the positioned tier, not the scrolling tree.
  viewport.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight,
    viewport.scrollTop + nodeBounds.top + nodeBounds.height / 2 - viewportBounds.top - viewport.clientTop - viewport.clientHeight / 2));
  viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth,
    viewport.scrollLeft + nodeBounds.left + nodeBounds.width / 2 - viewportBounds.left - viewport.clientLeft - viewport.clientWidth / 2));
}

export function createTechTreeController(elements: TechTreeControllerElements, hooks: TechTreeControllerHooks) {
  const { notice, overlay, title, categories, viewport, closeButton, active, canvas, map, detail, detailContent, closeDetailButton } = elements;
  // A prompt is awaited, so the pending flags below are not yet set while it is
  // open. Without this a second click opens a second prompt over the first and
  // both answers act. window.confirm used to block the page and hide the gap.
  let confirming = false;
  async function ask(prompt: ConfirmPrompt, request: ConfirmRequest) {
    if (confirming) return false;
    confirming = true;
    try { return await prompt(request); } finally { confirming = false; }
  }
  const confirmGemSpend = hooks.confirmGemSpend ?? gameConfirm;
  const layouts = { power: createTechTreeLayout("power"), utility: createTechTreeLayout("utility") };
  let tree: ResearchTree | null = null;
  let layout = layouts.power;
  let nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  let selectedNodeId = "";

  function buildTree(nextTree: ResearchTree) {
    tree = nextTree;
    layout = layouts[nextTree];
    nodesById = new Map(layout.nodes.map(node => [node.id, node]));
    map.replaceChildren(canvas);
    map.style.setProperty("--tech-tree-row-count", String(layout.rows.length));
    for (const row of layout.rows) {
      const tier = document.createElement("div");
      tier.className = `tech-tree-tier${row.length > 1 ? " tech-tree-tier-bottom" : ""}`;
      for (const layoutNode of row) {
        const definition = RESEARCH_DEFINITIONS[layoutNode.researchId];
        const node = document.createElement("button");
        node.className = "tech-tree-node";
        node.type = "button";
        node.dataset.techNode = layoutNode.id;
        node.setAttribute("aria-label", definition.effect);
        const nodeTitle = document.createElement("strong");
        nodeTitle.textContent = definition.effect;
        const progress = document.createElement("small");
        progress.textContent = researchProgressLabel(layoutNode.researchId, 0, layoutNode.rankBandIndex);
        node.append(nodeTitle, progress);
        tier.append(node);
      }
      map.append(tier);
    }
    linksSize = "";
    categories.hidden = true;
    viewport.hidden = false;
    (title.querySelector("span") ?? title).textContent = nextTree === "power" ? "Power Research" : "Utility Research";
    const focusNode = researchFocusNode(layout.nodes, hooks.researchRanks(), hooks.activeResearch());
    selectedNodeId = focusNode?.id ?? "";
    sizeTreeEdges();
    render();
    requestAnimationFrame(() => {
      if (overlay.hidden || tree !== nextTree) return;
      const element = map.querySelector<HTMLElement>(`[data-tech-node="${selectedNodeId}"]`);
      if (element) centerResearchNode(viewport, element);
    });
  }
  let researchRequestPending = false;
  let nextRenderAt = 0;
  const completionTracker = createResearchCompletionTracker();

  function formatResearchTime(milliseconds: number) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function techProgress(node: TechTreeNode, ranks: ResearchRanks) {
    const rank = ranks[node.researchId];
    return {
      rank,
      isFuture: rank < node.startRank,
      isComplete: rank >= node.endRank,
      isCurrent: rank >= node.startRank && rank < node.endRank,
    };
  }

  function requirementText(researchId: ResearchId, ranks: ResearchRanks) {
    const any = RESEARCH_DEFINITIONS[researchId].prerequisiteAny;
    if (any?.length && !any.some(id => ranks[id] >= 1)) {
      return any.map(id => `${RESEARCH_DEFINITIONS[id].effect} 1/${RESEARCH_DEFINITIONS[id].ranksPerBand}`).join(" OR ");
    }
    const completedRanks = ranks[researchId];
    const requirements = Object.entries(researchPrerequisitesForNextRank(researchId, completedRanks))
      .filter(([id, rank]) => ranks[id as ResearchId] < Number(rank));
    if (!requirements.length) return "AVAILABLE";
    if (requirements.length > 3) return "FINISH PREVIOUS LEVELS";
    return requirements.map(([id, rank]) => {
      const requiredId = id as ResearchId;
      const ranksPerBand = RESEARCH_DEFINITIONS[requiredId].ranksPerBand;
      const requiredBand = Math.max(0, Math.ceil(Number(rank) / ranksPerBand) - 1);
      const localRank = Number(rank) - researchRankBandStart(requiredId, requiredBand);
      return `${RESEARCH_DEFINITIONS[requiredId].effect} T${requiredBand + 1} ${localRank}/${ranksPerBand}`;
    }).join(" + ");
  }

  let linksSize = "";
  function drawLinks() {
    if (!tree) return;
    const bounds = map.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const size = `${bounds.width}:${bounds.height}:${scale}`;
    // Links share the scrolling map's coordinate space. Research timers and
    // scrolling do not change their geometry or require another rasterization.
    if (linksSize === size) return;
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const treeCtx = canvas.getContext("2d");
    if (!treeCtx) return;
    linksSize = size;
    treeCtx.setTransform(scale, 0, 0, scale, 0, 0);
    treeCtx.clearRect(0, 0, bounds.width, bounds.height);
    const center = (nodeId: string) => {
      const element = map.querySelector<HTMLButtonElement>(`[data-tech-node="${nodeId}"]`);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left - bounds.left + rect.width / 2, y: rect.top - bounds.top + rect.height / 2 };
    };
    treeCtx.strokeStyle = "rgba(191, 198, 207, .52)";
    treeCtx.lineWidth = 3;
    for (const [from, to] of layout.paths) {
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
    const ranks = hooks.researchRanks();
    for (const finished of completionTracker.poll(hooks.localIdentity(), hooks.isConnected(), current, ranks)) {
      hooks.onResearchFinished?.(finished);
    }
    notice.hidden = Boolean(current) || !hasAvailableResearch(ranks);
  }

  function render() {
    const ranks = hooks.researchRanks();
    const current = hooks.activeResearch();
    const activeRemaining = current ? current.completesAtMs - hooks.nowMs() : 0;
    updateNotice();
    active.textContent = current
      ? activeRemaining > 0
        ? `${RESEARCH_DEFINITIONS[current.researchId].effect} · ${formatResearchTime(activeRemaining)}`
        : `${RESEARCH_DEFINITIONS[current.researchId].effect} · FINALIZING`
      : "NO RESEARCH ACTIVE";

    if (!tree) {
      for (const [name, ids] of [["power", POWER_RESEARCH_IDS], ["utility", UTILITY_RESEARCH_IDS]] as const) {
        const choice = categories.querySelector<HTMLButtonElement>(`[data-research-tree="${name}"]`);
        const progress = choice?.querySelector<HTMLElement>(".tech-tree-choice-progress");
        if (progress) progress.textContent = `${ids.reduce((total, id) => total + Math.min(ranks[id], RESEARCH_DEFINITIONS[id].maxRank), 0)} / ${ids.reduce((total, id) => total + RESEARCH_DEFINITIONS[id].maxRank, 0)} RANKS`;
        choice?.classList.toggle("is-ready", ids.some(id => researchIsAvailable(id, ranks)));
      }
      return;
    }

    for (const element of map.querySelectorAll<HTMLButtonElement>("[data-tech-node]")) {
      const node = nodesById.get(element.dataset.techNode ?? "");
      if (!node) continue;
      const progress = techProgress(node, ranks);
      const activeOnNode = current?.researchId === node.researchId &&
        current.targetRank > node.startRank && current.targetRank <= node.endRank;
      const available = !current && progress.isCurrent && researchIsAvailable(node.researchId, ranks);
      element.classList.toggle("is-available", available);
      element.classList.toggle("is-complete", progress.isComplete);
      element.classList.toggle("is-active", activeOnNode);
      element.classList.toggle("is-locked", !available && !progress.isComplete && !activeOnNode);
      element.setAttribute("aria-pressed", String(selectedNodeId === node.id));
      const small = element.querySelector("small");
      if (small) small.textContent = researchProgressLabel(node.researchId, progress.rank, node.rankBandIndex);
    }

    const selected = nodesById.get(selectedNodeId) ?? layout.nodes[0];
    if (!selected) return;
    const definition = RESEARCH_DEFINITIONS[selected.researchId];
    const progress = techProgress(selected, ranks);
    const selectedActive = current?.researchId === selected.researchId &&
      current.targetRank > selected.startRank && current.targetRank <= selected.endRank;
    const duration = researchDurationMs(selected.researchId, progress.rank, ranks.researchSpeed);
    const canStart = !current && progress.isCurrent && researchIsAvailable(selected.researchId, ranks);
    detailContent.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = `${definition.icon} ${definition.effect} · ${researchProgressLabel(selected.researchId, progress.rank, selected.rankBandIndex)}`;
    const description = document.createElement("span");
    const value = definition.unit === "s" ? `-${definition.valuePerRank}s`
      : definition.unit === "min" ? `+${definition.valuePerRank} MIN`
        : definition.unit === "speed" ? `+${definition.valuePerRank} SPEED`
          : definition.unit === "range" ? `+${definition.valuePerRank} RANGE`
          : `+${definition.valuePerRank}%`;
    description.textContent = `${value} PER RANK`;
    detailContent.append(title, description);
    const effectValue = document.createElement("div");
    effectValue.className = "tech-tree-effect-value";
    effectValue.textContent = value;
    detailContent.append(effectValue);

    if (progress.isCurrent) {
      const time = document.createElement("div");
      time.className = "tech-tree-research-time";
      const timeLabel = document.createElement("span");
      timeLabel.textContent = selectedActive && activeRemaining > 0 ? "RESEARCH REMAINING" : "NEXT RESEARCH";
      const timeValue = document.createElement("strong");
      timeValue.textContent = formatResearchTime(selectedActive && activeRemaining > 0 ? activeRemaining : duration);
      time.append(timeLabel, timeValue);
      detailContent.append(time);
    }
    if (selectedActive && activeRemaining > 0 && current) {
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
      const elapsed = Math.round(researchElapsedRatio(current.startedAtMs, current.completesAtMs, hooks.nowMs()) * totalDuration);
      track.setAttribute("aria-valuenow", String(elapsed));
      const fill = document.createElement("div");
      fill.className = "tech-tree-timer-fill";
      fill.style.setProperty("--research-progress", String(elapsed / totalDuration));
      track.append(fill);
      timer.append(label, track);
      detailContent.append(timer);
    }
    const action = document.createElement("button");
    action.className = "primary-button tech-tree-action";
    const canSpeedUp = Boolean(selectedActive && current && activeRemaining > 0);
    const speedUpCost = canSpeedUp ? researchSpeedUpGemCost(activeRemaining) : 0n;
    action.disabled = researchRequestPending || (canSpeedUp ? hooks.gemBalance() < speedUpCost : Boolean(current) || !canStart);
    if (canSpeedUp) {
      action.classList.add("is-gem-speed-up");
      const label = document.createElement("span");
      label.textContent = "Finish Now";
      const icon = document.createElement("img");
      icon.src = "assets/wildstat/gems/gem-icon-v2.webp";
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      icon.draggable = false;
      const cost = document.createElement("strong");
      cost.textContent = speedUpCost.toString();
      action.append(label, icon, cost);
      action.setAttribute("aria-label", `Finish research now for ${speedUpCost} Gems. One Gem is worth ten minutes. Your balance is ${hooks.gemBalance()} Gems.`);
    } else {
      action.textContent = current
        ? activeRemaining <= 0 ? "FINALIZING RESEARCH" : "RESEARCH IN PROGRESS"
        : progress.isComplete ? "LEVELS COMPLETE"
          : progress.isFuture ? "COMPLETE EARLIER LEVELS"
          : canStart ? "START RESEARCH"
            : `REQUIRES ${requirementText(selected.researchId, ranks)}`;
    }
    action.addEventListener("click", () => { void triggerAction(); });
    detailContent.append(action);
    drawLinks();
  }

  async function triggerAction() {
    const current = hooks.activeResearch();
    const selected = nodesById.get(selectedNodeId);
    if (!selected) return;
    const now = hooks.nowMs();
    const speedingUp = current?.researchId === selected.researchId &&
      current.targetRank > selected.startRank && current.targetRank <= selected.endRank &&
      current.completesAtMs > now;
    if (speedingUp) {
      const cost = researchSpeedUpGemCost(current.completesAtMs - now);
      if (!await ask(confirmGemSpend, gemSpendConfirmation("finish this research now", cost, hooks.gemBalance()))) return;
    }
    researchRequestPending = true;
    render();
    const result = speedingUp
      ? await hooks.speedUpResearch()
      : current ? { ok: false, error: "RESEARCH IN PROGRESS" }
        : await hooks.startResearch(selected.researchId);
    researchRequestPending = false;
    if (!result?.ok) hooks.showMessage(result?.error ?? "RESEARCH UNAVAILABLE", "#ff9b91");
    render();
  }

  function sizeTreeEdges() {
    linksSize = "";
    const viewport = map.parentElement;
    // Leave room to center even the first and final rows.
    if (viewport) map.style.setProperty("--tech-tree-edge-space", `${viewport.clientHeight / 2}px`);
  }

  function open() {
    overlay.hidden = false;
    detail.hidden = true;
    hooks.beforeOpen();
    tree = null;
    categories.hidden = false;
    viewport.hidden = true;
    (title.querySelector("span") ?? title).textContent = "Tech Research";
    render();
  }

  function close() {
    overlay.hidden = true;
    detail.hidden = true;
  }


  closeButton.addEventListener("click", () => {
    if (!tree) { close(); return; }
    tree = null;
    detail.hidden = true;
    categories.hidden = false;
    viewport.hidden = true;
    (title.querySelector("span") ?? title).textContent = "Tech Research";
    render();
  });
  closeDetailButton.addEventListener("click", () => { detail.hidden = true; });
  addEventListener("resize", () => { if (!overlay.hidden && tree) { sizeTreeEdges(); drawLinks(); } });
  categories.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-research-tree]");
    const next = button?.dataset.researchTree;
    if (next === "power" || next === "utility") buildTree(next);
  });
  map.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-tech-node]");
    const node = nodesById.get(button?.dataset.techNode ?? "");
    if (!node) return;
    selectedNodeId = node.id;
    detail.hidden = false;
    render();
  });

  return {
    open,
    close,
    isOpen: () => !overlay.hidden,
    render,
    tick(now: number) {
      if (overlay.hidden || now < nextRenderAt) return;
      nextRenderAt = now + 1_000;
      render();
    },
    updateNotice,
    /** Timer for the research desk sign, formatted like the upgrade bench. */
    worldStatus: () => {
      const current = hooks.activeResearch();
      return current ? { timer: formatRemaining(current.completesAtMs - Date.now()) } : null;
    },
  };
}
