import { MINING_NODES, MINING_NODE_KINDS } from "../../shared/mining";
import { gatherRespawnMs } from "../../shared/gather-respawn";
import type { MiningSource } from "../game/runtime/town/mining-runtime";
import { installMovableHudCard } from "./movable-hud-card";
import { renderBooleanSetting, setText } from "./settings";

const ENABLED_KEY = "wildstat-mysterious-ore-timer-enabled-v1";
const POSITION_KEY = "wildstat-mysterious-ore-timer-position-v1";
const ROCKS = MINING_NODES.filter(node => node.kind === "mysterious");

/** Uses the mining runtime's break timestamps, server clock and research-adjusted regrowth. */
export function installMysteriousOreTimer(options: {
  source: () => MiningSource | null | undefined;
  connected: () => boolean;
}) {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Session-only controls still work. */ }
  let enabled = false;
  try { enabled = storage?.getItem(ENABLED_KEY) === "true"; } catch { /* Off by default. */ }
  let panel: HTMLElement | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let handle: HTMLButtonElement | null = null;
  let movable: ReturnType<typeof installMovableHudCard> | undefined;

  const anchor = document.getElementById("statTrackerToggle")?.closest(".setting-row");
  if (!anchor) return;
  const setting = document.createElement("div");
  setting.className = "setting-row";
  const label = document.createElement("span");
  label.textContent = "Mysterious Ore Timer";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "mysteriousOreTimerToggle";
  toggle.className = "setting-toggle";
  toggle.setAttribute("aria-label", label.textContent);
  setting.append(label, toggle);
  anchor.after(setting);

  function render() {
    if (!enabled || !handle || document.hidden) return;
    const source = options.source();
    const connected = options.connected() && Boolean(source?.minedNodeAt);
    const now = source?.serverNowMs?.() ?? Date.now();
    const respawn = gatherRespawnMs(MINING_NODE_KINDS.mysterious.respawnSeconds, source?.research?.().resourceRespawn ?? 0);
    let ready = 0, next = Infinity, all = 0;
    for (const rock of ROCKS) {
      const brokenAt = connected ? source?.minedNodeAt?.(rock.id) ?? null : null;
      const seconds = brokenAt === null ? 0 : Math.max(0, Math.ceil((brokenAt + respawn - now) / 1000));
      if (seconds === 0) ready++;
      else { next = Math.min(next, seconds); all = Math.max(all, seconds); }
    }
    const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    setText(handle, !connected ? "Mysterious: Connecting…"
      : `Mysterious: ${ready}/${ROCKS.length} · ${all > 0 ? `Next ${clock(next)} · All ${clock(all)}` : "All ready"}`);
  }

  function createPanel() {
    panel = document.createElement("section");
    panel.className = "mysterious-ore-timer";
    panel.setAttribute("aria-label", "Mysterious Ore respawn timers");
    handle = document.createElement("button");
    handle.type = "button";
    handle.className = "mysterious-ore-timer-handle";
    handle.title = "Mysterious Ore: ready rocks, next respawn, all respawned. Drag to move; Home to reset position.";
    panel.append(handle);
    (document.getElementById("hud") ?? document.body).append(panel);
    movable = installMovableHudCard({ panel, handle, storage: () => storage, positionKey: POSITION_KEY, toggle: () => {} });
  }

  function setEnabled(value: boolean) {
    enabled = value;
    try { storage?.setItem(ENABLED_KEY, String(value)); } catch { /* Session-only choice. */ }
    renderBooleanSetting(toggle, value);
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    if (value && !panel) createPanel();
    if (panel) panel.hidden = !value;
    if (value) {
      render();
      movable?.place();
      interval = setInterval(render, 1000);
    }
  }
  toggle.addEventListener("click", () => setEnabled(!enabled));
  document.addEventListener("visibilitychange", render);
  renderBooleanSetting(toggle, enabled);
  if (enabled) setEnabled(true);
}
