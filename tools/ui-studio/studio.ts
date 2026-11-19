// WildStat UI Studio shell: sidebar catalog, device viewport switcher, rotate, freeze, and live CSS tweaker.
type SceneEntry = {
  id: string;
  label: string;
  group: string;
  files: string;
  tag?: string;
};

const CATALOG: readonly SceneEntry[] = [
  // Guilds & Quests
  { id: "guild-crossing", label: "Glass Crossing (Live)", group: "Guilds & Quests", files: "src/ui/guild-crossing.ts · game.css", tag: "Live" },
  { id: "guild-crossing-finish", label: "Glass Crossing (Portal Open)", group: "Guilds & Quests", files: "src/ui/guild-crossing.ts · game.css", tag: "Live" },
  { id: "guild-crossing-cleared", label: "Glass Crossing (Cleared)", group: "Guilds & Quests", files: "src/ui/guild-crossing.ts · game.css" },
  { id: "guild-panel", label: "Guilds Window (Quests)", group: "Guilds & Quests", files: "src/ui/guild-panel.ts · game.css", tag: "Live" },
  { id: "guild-hall", label: "Guild Hall Upgrades", group: "Guilds & Quests", files: "src/ui/guild-hall-window.ts · game.css" },
  { id: "quest-tracker", label: "HUD Quest Tracker", group: "Guilds & Quests", files: "src/ui/quest-tracker.ts · game.css" },

  // Town & Gathering
  { id: "cooking-fire", label: "Cooking Fire (Live)", group: "Town & Gathering", files: "src/ui/cooking-fire.ts · game.css", tag: "Live" },
  { id: "cooking-fire-empty", label: "Cooking Fire (Empty)", group: "Town & Gathering", files: "src/ui/cooking-fire.ts · game.css" },
  { id: "skill-badges", label: "Overhead Skill Badges", group: "Town & Gathering", files: "src/game/runtime/town/fishing-badge.ts" },
  { id: "shops", label: "Smith & Gear Shops", group: "Town & Gathering", files: "src/ui/smith-window.ts · src/ui/gear-seller-window.ts" },
  { id: "world-map-town", label: "World Map (Town)", group: "Town & Gathering", files: "src/ui/map-guide-controller.ts" },

  // Leaderboards & Economy
  { id: "leaderboard", label: "Leaderboard (5 Tabs)", group: "Leaderboards & Economy", files: "src/ui/leaderboard.ts · game.css", tag: "Live" },
  { id: "exchange-window", label: "Trade Chrysanthemum", group: "Leaderboards & Economy", files: "src/ui/exchange-window.ts · game.css" },
  { id: "gem-shop", label: "Gem Shop", group: "Leaderboards & Economy", files: "src/ui/gem-shop-controller.ts · game.css" },
  { id: "server-boost", label: "Server Boost HUD", group: "Leaderboards & Economy", files: "src/ui/server-boost-hud.ts · game.css" },

  // Character & Gear
  { id: "icons", label: "Inventory & Bag Icons", group: "Character & Gear", files: "src/ui/hud.ts · src/ui/bag-item-tile.ts" },
  { id: "grades", label: "Gear Grade Ladder", group: "Character & Gear", files: "public/assets/wildstat/game.css" },
  { id: "item-window", label: "Item Window (Bag)", group: "Character & Gear", files: "src/ui/item-inspection-controller.ts" },
  { id: "item-window-worn", label: "Item Window (Worn)", group: "Character & Gear", files: "src/ui/item-inspection-controller.ts" },
  { id: "card-window", label: "Card Window", group: "Character & Gear", files: "src/ui/item-inspection-controller.ts" },
  { id: "builds", label: "Builds Tab", group: "Character & Gear", files: "src/ui/builds-tab.ts" },
  { id: "profile-own", label: "Profile (Own)", group: "Character & Gear", files: "src/ui/profile-skills.ts · game.css" },
  { id: "profile-other", label: "Profile (Other Player)", group: "Character & Gear", files: "src/ui/profile-guild.ts · game.css" },
  { id: "prestige-runs", label: "Prestige & Runs", group: "Character & Gear", files: "src/ui/prestige-runs-tab.ts" },
  { id: "offline-choice", label: "Offline Progress Summary", group: "Character & Gear", files: "src/ui/offline-progress-summary.ts" },

  // HUD & Overlays
  { id: "hud", label: "Main HUD", group: "HUD & Overlays", files: "src/ui/hud.ts · game.css" },
  { id: "hud-arrow", label: "HUD Arrow Chip", group: "HUD & Overlays", files: "src/ui/hud-arrow-chip.ts" },
  { id: "hud-power-jump", label: "HUD Power Jump", group: "HUD & Overlays", files: "src/ui/power-jump-effect.ts" },
  { id: "dps-breakdown", label: "DPS Breakdown", group: "HUD & Overlays", files: "src/ui/dps-breakdown.ts" },
  { id: "chat-announcement", label: "Chat Announcements", group: "HUD & Overlays", files: "src/ui/chat-announcement-line.ts" },
  { id: "settings-search", label: "Settings Search", group: "HUD & Overlays", files: "src/ui/settings.ts" },
  { id: "wordmark", label: "Title Wordmark", group: "HUD & Overlays", files: "public/index.html · game.css" },
];

const VIEWPORTS = {
  phone: { w: 390, h: 844 },
  small: { w: 360, h: 640 },
  tablet: { w: 768, h: 1024 },
  desktop: { w: 1280, h: 800 },
  fill: null,
} as const;
type ViewportKey = keyof typeof VIEWPORTS;

const nav = document.getElementById("nav")!;
const search = document.getElementById("search") as HTMLInputElement;
const preview = document.getElementById("preview") as HTMLIFrameElement;
const device = document.getElementById("device")!;
const bezel = document.getElementById("bezel")!;
const deviceSize = document.getElementById("deviceSize")!;
const sceneTitle = document.getElementById("sceneTitle")!;
const sceneFiles = document.getElementById("sceneFiles")!;
const rotateBtn = document.getElementById("rotateBtn") as HTMLButtonElement;
const freezeBtn = document.getElementById("freezeBtn") as HTMLButtonElement;
const reloadBtn = document.getElementById("reloadBtn") as HTMLButtonElement;
const cssBtn = document.getElementById("cssBtn") as HTMLButtonElement;
const cssDrawer = document.getElementById("cssDrawer")!;
const cssInput = document.getElementById("cssInput") as HTMLTextAreaElement;
const copyCssBtn = document.getElementById("copyCssBtn") as HTMLButtonElement;
const clearCssBtn = document.getElementById("clearCssBtn") as HTMLButtonElement;
const hmrPill = document.getElementById("hmrPill")!;

let activeId = decodeURIComponent(location.hash.replace(/^#/, "")) || "guild-crossing";
if (!CATALOG.some(entry => entry.id === activeId)) activeId = "guild-crossing";
let vp: ViewportKey = "phone";
let rotated = false;
let frozen = false;
let hmrTimer: number | undefined;

function syncFrameState() {
  preview.contentWindow?.postMessage({ type: "studio:set-css", css: cssInput.value }, "*");
  preview.contentWindow?.postMessage({ type: "studio:set-freeze", freeze: frozen }, "*");
}

function applyViewport() {
  const size = VIEWPORTS[vp];
  device.classList.toggle("is-fill", size === null);
  rotateBtn.disabled = size === null;
  if (size) {
    const w = rotated ? size.h : size.w;
    const h = rotated ? size.w : size.h;
    bezel.style.width = `${w}px`;
    bezel.style.height = `${h}px`;
    deviceSize.textContent = `${w} × ${h}`;
  } else {
    deviceSize.textContent = "Full stage";
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#viewports [data-vp]")) {
    btn.classList.toggle("is-active", btn.dataset.vp === vp);
  }
}

function selectScene(id: string, forceReload = false) {
  const entry = CATALOG.find(item => item.id === id) ?? CATALOG[0];
  activeId = entry.id;
  if (location.hash !== `#${activeId}`) history.replaceState(null, "", `#${activeId}`);
  sceneTitle.textContent = entry.label;
  sceneFiles.textContent = entry.files;
  document.title = `WildStat UI Studio · ${entry.label}`;
  const target = `ui-studio-frame.html${forceReload ? `?r=${Date.now()}` : ""}#${encodeURIComponent(activeId)}`;
  preview.src = target;
  renderNav();
}

function renderNav() {
  const q = search.value.trim().toLowerCase();
  nav.replaceChildren();
  const groups = new Map<string, SceneEntry[]>();
  for (const item of CATALOG) {
    if (q && !`${item.label} ${item.group} ${item.id} ${item.files}`.toLowerCase().includes(q)) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  for (const [title, items] of groups) {
    const section = document.createElement("section");
    section.className = "group";
    const h = document.createElement("h3");
    h.className = "group-title";
    h.textContent = title;
    section.append(h);
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `item${item.id === activeId ? " is-active" : ""}`;
      const label = document.createElement("span");
      label.textContent = item.label;
      btn.append(label);
      if (item.tag) {
        const tag = document.createElement("span");
        tag.className = "item-tag";
        tag.textContent = item.tag;
        btn.append(tag);
      }
      btn.addEventListener("click", () => selectScene(item.id));
      section.append(btn);
    }
    nav.append(section);
  }
}

search.addEventListener("input", renderNav);
for (const btn of document.querySelectorAll<HTMLButtonElement>("#viewports [data-vp]")) {
  btn.addEventListener("click", () => { vp = btn.dataset.vp as ViewportKey; rotated = false; applyViewport(); });
}
rotateBtn.addEventListener("click", () => { rotated = !rotated; applyViewport(); });
freezeBtn.addEventListener("click", () => {
  frozen = !frozen;
  freezeBtn.classList.toggle("is-on", frozen);
  syncFrameState();
});
reloadBtn.addEventListener("click", () => selectScene(activeId, true));
cssBtn.addEventListener("click", () => {
  cssDrawer.hidden = !cssDrawer.hidden;
  cssBtn.classList.toggle("is-on", !cssDrawer.hidden);
  if (!cssDrawer.hidden) cssInput.focus();
});
cssInput.addEventListener("input", syncFrameState);
copyCssBtn.addEventListener("click", () => {
  void navigator.clipboard?.writeText(cssInput.value);
  copyCssBtn.textContent = "Copied!";
  window.setTimeout(() => { copyCssBtn.textContent = "Copy CSS"; }, 1200);
});
clearCssBtn.addEventListener("click", () => { cssInput.value = ""; syncFrameState(); });
preview.addEventListener("load", syncFrameState);
window.addEventListener("hashchange", () => {
  const next = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (next && next !== activeId) selectScene(next);
});
window.addEventListener("message", event => {
  const data = event.data as { type?: string } | null;
  if (data?.type === "studio:ready") syncFrameState();
  if (data?.type === "studio:css-reloaded") {
    hmrPill.classList.add("is-shown");
    clearTimeout(hmrTimer);
    hmrTimer = window.setTimeout(() => hmrPill.classList.remove("is-shown"), 1600);
  }
});

applyViewport();
selectScene(activeId);
