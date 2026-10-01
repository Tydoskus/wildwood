import { foldPlayerName, searchPlayerDirectory, type PlayerDirectoryEntry } from "../../shared/player-search";

export const MAGNIFIER_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15.3 15.3 20.5 20.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;

const CLOSE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6 18 18M18 6 6 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;

export type PlayerSearchOptions = {
  /** The directory, loaded once and kept by the social service; undefined while offline. */
  load: () => Promise<PlayerDirectoryEntry[]> | undefined;
  onPick: (player: { identity: string; name: string }) => void;
  localIdentity?: () => string;
  label: string;
  placeholder?: string;
  /** A magnifier button that opens the field, rather than a field that is always there. */
  collapsible?: boolean;
  className?: string;
};

let searchCount = 0;

/**
 * Player search with names filled in as you type. The names come from one
 * directory request; every key press after that filters on the device.
 */
export function createPlayerSearch(options: PlayerSearchOptions) {
  const id = `playerSearch${++searchCount}`;
  const root = document.createElement("div");
  root.className = `player-search${options.collapsible ? " is-collapsible" : ""}${options.className ? ` ${options.className}` : ""}`;
  const field = document.createElement("div");
  field.className = "player-search-field";
  const icon = document.createElement("span");
  icon.className = "player-search-icon";
  icon.innerHTML = MAGNIFIER_SVG;
  const input = document.createElement("input");
  input.type = "search";
  input.className = "player-search-input";
  input.placeholder = options.placeholder ?? "Search players";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 40;
  input.enterKeyHint = "search";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", options.label);
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", `${id}Results`);
  input.setAttribute("aria-expanded", "false");
  const results = document.createElement("ul");
  results.id = `${id}Results`;
  results.className = "player-search-results";
  results.setAttribute("role", "listbox");
  results.setAttribute("aria-label", "Matching players");
  results.hidden = true;
  field.append(icon, input);
  let toggle: HTMLButtonElement | null = null;
  if (options.collapsible) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "player-search-toggle";
    toggle.innerHTML = MAGNIFIER_SVG;
    toggle.setAttribute("aria-label", options.label);
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => (root.classList.contains("is-open") ? close() : open()));
    field.hidden = true;
    root.append(toggle);
  }
  root.append(field, results);

  let players: PlayerDirectoryEntry[] | null = null;
  let loading: Promise<void> | null = null;
  let failed = "";
  let matches: PlayerDirectoryEntry[] = [];
  let active = -1;

  function ensureLoaded() {
    if (players || loading) return;
    const request = options.load();
    if (!request) { failed = "Connect to search players."; render(); return; }
    failed = "";
    loading = request.then(list => { players = list; }, error => { failed = error instanceof Error ? error.message : "Could not load players."; })
      .finally(() => { loading = null; render(); });
    render();
  }

  function message(text: string) {
    const item = document.createElement("li");
    item.className = "player-search-message";
    item.textContent = text;
    return item;
  }

  function option(player: PlayerDirectoryEntry, index: number, needle: string) {
    const item = document.createElement("li");
    item.id = `${id}Option${index}`;
    item.className = "player-search-option";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === active));
    // The typed letters stand out, so it is clear why a name matched.
    const at = player.key.indexOf(needle);
    const name = document.createElement("span");
    name.className = "player-search-name";
    if (at >= 0 && player.name.length === player.key.length) {
      const mark = document.createElement("mark");
      mark.textContent = player.name.slice(at, at + needle.length);
      name.append(player.name.slice(0, at), mark, player.name.slice(at + needle.length));
    } else name.textContent = player.name;
    item.append(name);
    // Pressing keeps focus in the field, so the list does not close before the pick lands.
    item.addEventListener("pointerdown", event => event.preventDefault());
    item.addEventListener("click", () => pick(player));
    return item;
  }

  function render() {
    const needle = foldPlayerName(input.value);
    const showing = Boolean(needle) && document.activeElement === input;
    matches = players && needle ? searchPlayerDirectory(players, needle, { exclude: options.localIdentity?.() }) : [];
    if (active >= matches.length) active = matches.length - 1;
    const rows: HTMLElement[] = failed ? [message(failed)]
      : !players ? [message("Loading players…")]
      : !matches.length ? [message("No players found")]
      : matches.map((player, index) => option(player, index, needle));
    results.replaceChildren(...rows);
    results.hidden = !showing;
    input.setAttribute("aria-expanded", String(showing && matches.length > 0));
    if (active >= 0 && matches[active]) input.setAttribute("aria-activedescendant", `${id}Option${active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function pick(player: PlayerDirectoryEntry) {
    input.value = options.collapsible ? "" : player.name;
    active = -1;
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    if (options.collapsible) close();
    options.onPick({ identity: player.identity, name: player.name });
  }

  function open() {
    if (!toggle) return;
    root.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML = CLOSE_SVG;
    toggle.setAttribute("aria-label", "Close player search");
    field.hidden = false;
    ensureLoaded();
    input.focus();
  }

  function close() {
    if (!toggle) return;
    root.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = MAGNIFIER_SVG;
    toggle.setAttribute("aria-label", options.label);
    field.hidden = true;
    input.value = ""; active = -1;
    results.hidden = true;
  }

  input.addEventListener("focus", () => { ensureLoaded(); render(); });
  input.addEventListener("input", () => { active = input.value.trim() ? 0 : -1; render(); });
  input.addEventListener("blur", () => { results.hidden = true; input.setAttribute("aria-expanded", "false"); });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!matches.length) return;
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
      render();
    } else if (event.key === "Enter" && matches[active] && !results.hidden) {
      event.preventDefault();
      pick(matches[active]);
    } else if (event.key === "Escape") {
      // Escape closes the search, not the window around it.
      if (!results.hidden || root.classList.contains("is-open")) event.stopPropagation();
      if (!results.hidden) { results.hidden = true; input.setAttribute("aria-expanded", "false"); }
      else close();
    }
  });

  return { root, input, open, close };
}
