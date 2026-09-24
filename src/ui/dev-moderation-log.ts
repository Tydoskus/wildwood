import type { ModerationHistoryPage } from "../../shared/moderation-history";
import { MODERATION_LOG_CATEGORIES, type ModerationLogQuery } from "../../shared/dev-console";
import { createModerationHistoryPanel } from "./moderation-history-panel";

export type ModerationLogLoader = (query: ModerationLogQuery, beforeId: string) => Promise<ModerationHistoryPage>;

const DAY_MS = 86_400_000;

/**
 * The Moderation log tab: a quick search over player, moderator, reason and
 * evidence, an action-type filter and a date range, above the same entry list
 * the log always had. The server does the filtering and pages on from where
 * each read stopped.
 */
export function createDevModerationLog(container: HTMLElement, load: ModerationLogLoader) {
  const form = document.createElement("form");
  form.className = "dev-log-filters";
  const text = document.createElement("input");
  text.type = "search";
  text.placeholder = "Search player, moderator, reason…";
  text.setAttribute("aria-label", "Search the moderation log");
  text.className = "dev-review-note";
  const category = document.createElement("select");
  category.className = "dev-review-note";
  category.setAttribute("aria-label", "Action type");
  for (const option of MODERATION_LOG_CATEGORIES) {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    category.append(element);
  }
  const date = (label: string) => {
    const input = document.createElement("input");
    input.type = "date";
    input.className = "dev-review-note";
    input.setAttribute("aria-label", label);
    return input;
  };
  const from = date("From date"), to = date("To date");
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "dev-review-action is-primary";
  apply.textContent = "Filter";
  form.append(text, category, from, to, apply);
  const list = document.createElement("div");
  container.replaceChildren(form, list);
  let query: ModerationLogQuery = { text: "", category: "", fromMs: 0, toMs: 0 };
  const panel = createModerationHistoryPanel(list, beforeId => load(query, beforeId));

  function readQuery(): ModerationLogQuery {
    const day = (input: HTMLInputElement) => input.value ? new Date(`${input.value}T00:00:00`).getTime() : 0;
    const end = day(to);
    return { text: text.value.trim(), category: category.value, fromMs: day(from), toMs: end ? end + DAY_MS - 1 : 0 };
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    query = readQuery();
    panel.open();
  });

  return {
    open: () => panel.open(),
    clear: () => panel.clear(),
  };
}
