import {
  RESEARCH_DEFINITIONS,
  researchDurationMs,
  researchIsAvailable as sharedResearchIsAvailable,
  researchPrerequisitesForNextRank,
  researchRankBandEnd,
  researchRankBandStart,
  type ResearchId,
  type ResearchRanks as SharedResearchRanks,
} from "../../shared/research";
import { researchSpeedUpGemCost } from "../../shared/gems";
import { createTechTreeLayout, type TechTreeNode } from "./tech-tree-layout";
import { gemSpendConfirmationText } from "./gem-spend-confirmation";

export type ResearchRanks = SharedResearchRanks;
export type ActiveResearch = {
  researchId: ResearchId;
  targetRank: number;
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
  gemBalance: () => bigint;
  speedUpResearch: () => Promise<ResearchResult>;
  confirmGemSpend?: (message: string) => boolean;
  showMessage: (message: string, color: string) => void;
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

export function createTechTreeController(elements: TechTreeControllerElements, hooks: TechTreeControllerHooks) {
  const { button, notice, overlay, closeButton, active, canvas, map, detail, detailContent, closeDetailButton } = elements;
  const confirmGemSpend = hooks.confirmGemSpend ?? ((message: string) => confirm(message));
  const layout = createTechTreeLayout();
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
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
      const title = document.createElement("strong");
      title.textContent = definition.effect;
      const progress = document.createElement("small");
      progress.textContent = researchProgressLabel(layoutNode.researchId, 0, layoutNode.rankBandIndex);
      node.append(title, progress);
      tier.append(node);
    }
    map.append(tier);
  }

  let selectedNodeId = layout.nodes[0]?.id ?? "";
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

  function drawLinks() {
    const bounds = map.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const treeCtx = canvas.getContext("2d");
    if (!treeCtx) return;
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
    notice.hidden = Boolean(current) || !hasAvailableResearch(hooks.researchRanks());
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
    const duration = researchDurationMs(selected.researchId, progress.rank);
    const canStart = !current && progress.isCurrent && researchIsAvailable(selected.researchId, ranks);
    detailContent.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = `${definition.icon} ${definition.effect} · ${researchProgressLabel(selected.researchId, progress.rank, selected.rankBandIndex)}`;
    const description = document.createElement("span");
    description.textContent = `${definition.valuePerRank}% PER RANK`;
    detailContent.append(title, description);
    const effectValue = document.createElement("div");
    effectValue.className = "tech-tree-effect-value";
    effectValue.textContent = `+${definition.valuePerRank}%`;
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
      icon.src = "assets/wildstat/gems/gem-icon-v2.png";
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
      if (!confirmGemSpend(gemSpendConfirmationText("finish this research now", cost))) return;
    }
    researchRequestPending = true;
    render();
    const result = speedingUp
      ? await hooks.speedUpResearch()
      : current ? { ok: false, error: "RESEARCH IN PROGRESS" }
        : await hooks.startResearch(selected.researchId);
    researchRequestPending = false;
    if (!result?.ok) hooks.showMessage(result?.error ?? "RESEARCH UNAVAILABLE", "#ff9b91");
    else if (speedingUp) hooks.showMessage("RESEARCH COMPLETED WITH GEMS", "#ff9fd2");
    render();
  }

  function currentNode(ranks: ResearchRanks, current: ActiveResearch | null) {
    if (current) {
      const activeNode = layout.nodes.find((node) => node.researchId === current.researchId &&
        current.targetRank > node.startRank && current.targetRank <= node.endRank);
      if (activeNode) return activeNode;
    }
    return layout.nodes.find((node) => techProgress(node, ranks).isCurrent && researchIsAvailable(node.researchId, ranks))
      ?? layout.nodes.find((node) => !techProgress(node, ranks).isComplete)
      ?? layout.nodes[layout.nodes.length - 1];
  }

  function open() {
    overlay.hidden = false;
    detail.hidden = true;
    button.setAttribute("aria-expanded", "true");
    hooks.beforeOpen();
    const focusNode = currentNode(hooks.researchRanks(), hooks.activeResearch());
    if (focusNode) selectedNodeId = focusNode.id;
    render();
    requestAnimationFrame(() => {
      const element = map.querySelector<HTMLElement>(`[data-tech-node="${selectedNodeId}"]`);
      const viewport = map.parentElement;
      if (element && viewport) viewport.scrollTop = Math.max(0, element.offsetTop - viewport.clientHeight / 2 + element.offsetHeight / 2);
    });
  }

  function close() {
    overlay.hidden = true;
    detail.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.addEventListener("click", () => {
    if (overlay.hidden) open();
    else close();
  });
  closeButton.addEventListener("click", close);
  closeDetailButton.addEventListener("click", () => { detail.hidden = true; });
  addEventListener("resize", () => { if (!overlay.hidden) drawLinks(); });
  canvas.parentElement?.addEventListener("scroll", () => { if (!overlay.hidden) drawLinks(); }, { passive: true });
  for (const element of map.querySelectorAll<HTMLButtonElement>("[data-tech-node]")) {
    element.addEventListener("click", () => {
      const node = nodesById.get(element.dataset.techNode ?? "");
      if (!node) return;
      selectedNodeId = node.id;
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
