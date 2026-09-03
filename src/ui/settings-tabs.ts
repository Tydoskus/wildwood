const SETTINGS_GROUPS = [
  { id: "game", label: "Game", selectors: ["#screenShakeToggle", "#attackRangeToggle", "#chatToggle", "#fullscreenToggle", "#lowPerformanceToggle", "#fpsToggle", "#latencyToggle"] },
  { id: "audio", label: "Audio", selectors: ["#musicVolume", "#sfxVolume"] },
  { id: "account", label: "Account", selectors: ["#accountButton", "#accountStatus", ".setting-support", ".setting-legal", "#developerSettingsRow", ".setting-reset"] },
] as const;

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
    for (const selector of group.selectors) {
      for (const control of settings.querySelectorAll<HTMLElement>(selector)) {
        panel.append(control.closest(".setting-row") ?? control);
      }
    }
    tablist.append(tab);
    content.append(panel);
    tabs.push(tab);
    panels.push(panel);
  }
  settings.prepend(tablist);
  const status = doc.getElementById("connectionStatus")?.closest(".setting-row");
  status?.classList.add("settings-connection");
  // Only the body scrolls, keeping navigation and Back visible on short screens.
  settings.insertBefore(content, settings.querySelector(".window-back-footer"));
  bindSettingsTabs(tabs, panels);
}
