import { createCommunityLinks } from './community-links';
import { controlsTabUseful, createControlsSettings } from './controls-settings';
import { onGamepadChange } from './gamepad-controls';
import { installSettingsSearch } from './settings-search';

type SettingsSection = { title?: string; expandable?: boolean; description?: string; selectors: readonly string[] };

/** Game's long list is split into headed sections; the other tabs are one section each. */
const SETTINGS_GROUPS: readonly { id: string; label: string; sections: readonly SettingsSection[] }[] = [
  { id: "game", label: "Game", sections: [
    { title: "Display & HUD", expandable: true, description: "Combat · Trackers · Timers & hints", selectors: ["#attackRangeToggle", "#enemyHpNumbersToggle", "#damageNumbersToggle", "#statPopupsToggle", "#baseStatRewardsToggle", "#cardFoundPopupsToggle", "#scientificNotationToggle", "#cameraZoomToggle", "#statTrackerToggle", "#dpsBreakdownToggle", "#questTrackerToggle", "#gameTickerToggle"] },
    { title: "Players & Social", expandable: true, description: "Players · Names · Chat", selectors: ["#remoteGhostsToggle", "#ownNamePlateToggle", "#guildTagsToggle", "#chatToggle", "#chatTimestampsToggle"] },
    { title: "Device & Performance", expandable: true, description: "Device · Graphics · Diagnostics", selectors: ["#toolbarHapticsToggle", "#selfProfileTapToggle", "#fullscreenToggle", "#keepScreenOnToggle", "#highResolutionToggle", "#lowPerformanceToggle", "#idleThrottleToggle", "#webglWorldToggle", "#dedicatedGpuToggle", "#fpsToggle", "#dpsToggle", "#latencyToggle", "#graphicsInfo"] },
    { selectors: ["#replayTutorialRow"] },
  ] },
  { id: "controls", label: "Controls", sections: [{ selectors: ["#controlsSettings"] }] },
  { id: "audio", label: "Audio", sections: [{ selectors: ["#musicVolume", "#sfxVolume"] }] },
  { id: "account", label: "Account", sections: [{ selectors: ["#offlineProgressToggle", "#accountButton", "#accountStatus", ".setting-support", ".setting-legal", "#developerSettingsRow", ".setting-reset"] }] },
];

export function bindSettingsTabs(tabs: HTMLButtonElement[], panels: HTMLElement[]) {
  function select(index: number, focus = false) {
    tabs.forEach((tab, tabIndex) => {
      const active = tabIndex === index;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[tabIndex].hidden = !active;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      event.stopPropagation();
      select(next, true);
    });
  });
  select(0);
}

/** Move the existing controls, preserving their values, IDs, and account visibility rules. */
export function installSettingsTabs(doc: Document) {
  const settings = doc.getElementById("settingsPanel");
  if (!settings || doc.getElementById("settingsTabs")) return;
  settings.append(createCommunityLinks(doc));
  const privacy = doc.createElement("div");
  privacy.className = "setting-support";
  privacy.id = "privacySettings";
  for (const [label, path] of [
    ["Privacy policy", "privacy.html"],
  ]) {
    const link = doc.createElement("a");
    link.textContent = label;
    // Absolute public URLs also work inside the native app's local WebView.
    link.href = `https://wildstatmmo.com/${path}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    privacy.append(link);
  }
  settings.append(privacy);
  settings.append(createControlsSettings(doc));
  if (!doc.getElementById("replayTutorialRow")) {
    const row = doc.createElement("div");
    row.className = "setting-row";
    row.id = "replayTutorialRow";
    const label = doc.createElement("span");
    label.textContent = "Tutorial";
    const button = doc.createElement("button");
    button.id = "replayTutorialBtn";
    button.type = "button";
    button.className = "setting-toggle";
    button.textContent = "Replay";
    row.append(label, button);
    settings.append(row);
  }
  if (!doc.getElementById("graphicsInfo")) {
    // Read-only; filled by the graphics report while Settings is open.
    const info = doc.createElement("div");
    info.id = "graphicsInfo";
    info.className = "graphics-info";
    for (const [line, text] of [["card", "Graphics Card: Checking…"], ["drawing", "Drawing: Checking…"], ["tip", ""], ["fps", "FPS: Measuring…"]]) {
      const row = doc.createElement("p");
      row.setAttribute("data-line", line);
      row.textContent = text;
      row.hidden = !text;
      if (line === "tip") row.className = "graphics-tip";
      info.append(row);
    }
    settings.append(info);
  }
  const tablist = doc.createElement("div");
  tablist.id = "settingsTabs";
  tablist.className = "settings-tabs";
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Settings category");
  const content = doc.createElement("div");
  content.className = "settings-content";
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  for (const group of SETTINGS_GROUPS) {
    const tab = doc.createElement("button");
    tab.id = `settings-${group.id}-tab`;
    tab.type = "button";
    tab.className = "inventory-tab";
    tab.textContent = group.label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `settings-${group.id}-panel`);
    const panel = doc.createElement("section");
    panel.id = `settings-${group.id}-panel`;
    panel.className = "settings-tab-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    for (const section of group.sections) {
      const rows = section.selectors.flatMap(selector => [...settings.querySelectorAll<HTMLElement>(selector)].map(control => control.closest<HTMLElement>(".setting-row") ?? control));
      if (!rows.length) continue;
      if (section.expandable) {
        const disclosure = doc.createElement("details");
        disclosure.className = "settings-disclosure";
        const summary = doc.createElement("summary");
        const title = doc.createElement("span");
        title.textContent = section.title ?? "More settings";
        const description = doc.createElement("span");
        description.className = "settings-disclosure-description";
        description.textContent = section.description ?? "";
        summary.append(title, doc.createTextNode(" "), description);
        const content = doc.createElement("div");
        content.className = "settings-disclosure-content";
        for (const row of rows) content.append(row);
        disclosure.append(summary, content);
        panel.append(disclosure);
        continue;
      }
      if (section.title) {
        const heading = doc.createElement("h3");
        heading.className = "settings-section-title";
        heading.textContent = section.title;
        panel.append(heading);
      }
      for (const row of rows) panel.append(row);
    }
    tablist.append(tab);
    content.append(panel);
    tabs.push(tab);
    panels.push(panel);
  }
  settings.prepend(tablist);
  const title = doc.getElementById("settingsTitle");
  if (title) settings.prepend(title);
  const status = doc.getElementById("connectionStatus")?.closest(".setting-row");
  status?.classList.add("settings-connection");
  // Only the body scrolls, keeping navigation and Back visible on short screens.
  settings.insertBefore(content, settings.querySelector(".window-back-footer"));
  bindSettingsTabs(tabs, panels);
  installSettingsSearch(doc, content, tablist);
  // Touch-only phones have nothing to rebind until a controller connects.
  const controlsTab = doc.getElementById("settings-controls-tab");
  const showControls = () => {
    if (!controlsTab) return;
    controlsTab.hidden = !controlsTabUseful(doc);
    if (controlsTab.hidden && controlsTab.getAttribute("aria-selected") === "true") tabs[0].click();
  };
  showControls();
  onGamepadChange(showControls);
}
