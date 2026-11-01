/**
 * Settings' search box: typing shows every matching setting from all tabs at once, under its tab's name, with
 * collapsed sections opened; clearing it puts the tabs and sections back as they were. A row hidden by the game
 * (an account-only row, say) stays hidden.
 */
export function installSettingsSearch(doc: Document, content: HTMLElement, tablist: HTMLElement) {
  const box = doc.createElement("div");
  box.className = "settings-search";
  const input = doc.createElement("input");
  input.type = "search";
  input.placeholder = "Search Settings";
  input.setAttribute("aria-label", "Search settings");
  input.autocomplete = "off";
  input.spellcheck = false;
  const empty = doc.createElement("p");
  empty.className = "settings-search-empty";
  empty.textContent = "No Settings Match";
  empty.hidden = true;
  box.append(input);
  tablist.after(box);
  content.prepend(empty);
  /** Which sections were open before the search, to put back after. */
  let wasOpen: Map<HTMLDetailsElement, boolean> | null = null;

  const panels = () => [...content.querySelectorAll<HTMLElement>(":scope > .settings-tab-panel")];
  // A row is a panel's own child, or a child of a collapsible section's body.
  const rowsOf = (parent: Element) => [...parent.children].filter((child): child is HTMLElement =>
    child instanceof HTMLElement && !child.matches("details, h3, .settings-section-title"));
  /** The words a row is found by: its label and notes, not its buttons' ON/OFF. */
  function words(row: HTMLElement) {
    const copy = row.cloneNode(true) as HTMLElement;
    for (const control of copy.querySelectorAll("button.setting-toggle, select, input, option")) control.remove();
    return `${copy.textContent ?? ""} ${row.getAttribute("aria-label") ?? ""}`.toLowerCase();
  }

  function search() {
    const query = input.value.trim().toLowerCase();
    content.classList.toggle("is-searching", Boolean(query));
    tablist.classList.toggle("is-searching", Boolean(query));
    if (query && !wasOpen) wasOpen = new Map([...content.querySelectorAll("details")].map(details => [details, details.open]));
    let found = 0;
    for (const panel of panels()) {
      const label = doc.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.textContent ?? "";
      panel.dataset.searchLabel = label;
      let inPanel = 0;
      const show = (rows: HTMLElement[], sectionWords: string) => {
        let shown = 0;
        for (const row of rows) {
          const match = !query || sectionWords.includes(query) || words(row).includes(query);
          row.classList.toggle("is-search-hidden", !match);
          if (match && !row.hidden) shown += 1;
        }
        return shown;
      };
      inPanel += show(rowsOf(panel), label.toLowerCase());
      for (const details of panel.querySelectorAll<HTMLDetailsElement>("details")) {
        // The section's name finds all of it; its description's examples do not.
        const title = details.querySelector("summary > span")?.textContent?.toLowerCase() ?? "";
        const body = details.querySelector(".settings-disclosure-content") ?? details;
        const shown = show(rowsOf(body), title);
        details.classList.toggle("is-search-hidden", Boolean(query) && !shown);
        if (query) details.open = shown > 0;
        inPanel += shown;
      }
      for (const heading of panel.querySelectorAll<HTMLElement>(".settings-section-title")) heading.classList.toggle("is-search-hidden", Boolean(query));
      panel.classList.toggle("is-search-empty", Boolean(query) && !inPanel);
      found += inPanel;
    }
    empty.hidden = !query || found > 0;
    if (!query && wasOpen) {
      for (const [details, open] of wasOpen) details.open = open;
      wasOpen = null;
    }
  }

  input.addEventListener("input", search);
  // Escape clears the box first; a second Escape closes Settings as before.
  input.addEventListener("keydown", event => {
    if (event.key === "Escape" && input.value) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  });
  const clear = () => { if (input.value) { input.value = ""; search(); } };
  // Settings opens on its tabs again, never on an old search.
  const panel = content.closest<HTMLElement>(".settings-panel");
  if (panel && typeof MutationObserver !== "undefined") new MutationObserver(() => { if (panel.hidden) clear(); }).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  return { clear };
}
