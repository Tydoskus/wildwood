import { GUILD_MEMBER_LIMIT, GUILD_TEAM_SIZE, type GuildSnapshot } from "../../shared/guilds";
import type { GuildAction, GuildApi } from "../coop/services/guild-service";

type Section = "guild" | "battles" | "rankings";
type Member = NonNullable<GuildSnapshot["guild"]>["members"][number];
type Options = {
  api: () => GuildApi | undefined;
  sessionKey: () => string;
  beforeOpen: () => void;
  onClose: () => void;
  document?: Document;
};
const number = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
const date = (micros: string) => new Date(Number(BigInt(micros) / 1000n));

export function createGuildPanel(options: Options) {
  const doc = options.document ?? document;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const root = element("div", undefined, "guild-overlay");
  root.id = "guildOverlay"; root.hidden = true;
  const dialog = element("section", undefined, "guild-window");
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "guildTitle"); dialog.tabIndex = -1;
  root.append(dialog); doc.body.append(root);
  let section: Section = "guild";
  let snapshot: GuildSnapshot | null = null;
  let busy = false;
  let error = "", notice = "", page = "0", session = "", draftName = "";
  let serial = 0, clockOffset = 0;
  let creating = false;
  let managedMember: string | null = null;
  let confirmation: { title: string; detail: string; label: string; action: GuildAction } | null = null;
  let previousFocus: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  function button(label: string, action: () => void, style = "secondary", disabled = false, key = label) {
    const node = element("button", label, `guild-button guild-button--${style}`);
    node.type = "button"; node.disabled = busy || disabled; node.dataset.focusKey = key;
    node.addEventListener("click", action); return node;
  }
  function mark(name: string, className = "guild-mark") {
    const node = element("span", name.trim().split(/\s+/u).slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase(), className);
    node.setAttribute("aria-hidden", "true"); return node;
  }
  function heading(parent: HTMLElement, title: string, detail?: string) {
    const node = element("div", undefined, "guild-section-heading");
    node.append(element("h3", title));
    if (detail) node.append(element("p", detail));
    parent.append(node); return node;
  }
  function empty(parent: HTMLElement, title: string, detail: string) {
    const node = element("div", undefined, "guild-empty");
    node.append(element("h3", title), element("p", detail)); parent.append(node); return node;
  }
  function row(parent: HTMLElement, title: string, detail: string) {
    const node = element("div", undefined, "guild-row");
    const copy = element("div", undefined, "guild-row-copy");
    copy.append(element("strong", title), element("span", detail));
    node.append(copy); parent.append(node); return node;
  }
  function now() { return Date.now() + clockOffset; }
  function isLeader() { return snapshot?.guild?.leader === snapshot?.identity; }
  function ask(title: string, detail: string, label: string, action: GuildAction) {
    confirmation = { title, detail, label, action }; render();
    dialog.querySelector<HTMLElement>(".guild-confirm button")?.focus();
  }
  function current(id: number) { return !root.hidden && serial === id && session === options.sessionKey(); }
  async function load(action?: GuildAction) {
    if (session !== options.sessionKey()) { close(); return; }
    if (busy) return;
    const api = options.api();
    if (!api) { error = "Connect to your character to view guilds."; render(); return; }
    const id = ++serial;
    const focusKey = (doc.activeElement as HTMLElement | null)?.dataset?.focusKey;
    busy = true; error = ""; notice = ""; confirmation = null; render();
    let saved = false;
    try {
      if (action) { await api.guildAction(action); saved = true; }
      if (!current(id)) return;
      const next = await api.loadGuild(page);
      if (!current(id)) return;
      snapshot = next; clockOffset = date(next.serverNow).getTime() - Date.now();
      if (action?.kind === "create" || action?.kind === "join" || action?.kind === "leave") {
        section = "guild"; creating = false; managedMember = null; draftName = "";
      }
      if (action?.kind === "refreshChampion") notice = "Your champion build is up to date.";
      if (action?.kind === "challenge") notice = "Battle complete. Your report is ready below.";
    } catch (failure) {
      if (current(id)) {
        if (saved) {
          snapshot = null;
          error = "Your change was saved. Refresh to load the latest guild details.";
        } else error = failure instanceof Error ? failure.message : "Could not load guilds. Try again.";
      }
    } finally {
      if (current(id)) {
        busy = false; render();
        if (doc.activeElement === dialog && focusKey) {
          const control = [...dialog.querySelectorAll<HTMLButtonElement>("button[data-focus-key]")].find(node => node.dataset.focusKey === focusKey && !node.disabled);
          control?.focus();
        }
      }
    }
  }
  const act = (action: GuildAction) => { void load(action); };
  function switchSection(next: Section) {
    const body = dialog.querySelector(".guild-content"); if (body) body.scrollTop = 0;
    section = next; confirmation = null; managedMember = null; notice = ""; render();
    dialog.querySelector<HTMLElement>(`[data-focus-key="tab-${next}"]`)?.focus();
  }
  function renderCreate(parent: HTMLElement) {
    if (!creating) {
      parent.append(button("Create a guild", () => { creating = true; render(); doc.getElementById("guildName")?.focus(); }, "quiet", !canJoin()));
      return;
    }
    const form = element("form", undefined, "guild-create");
    const label = element("label", "Guild name"); label.htmlFor = "guildName";
    const input = element("input"); input.id = "guildName"; input.name = "guildName";
    input.value = draftName; input.placeholder = "Name your guild"; input.maxLength = 24; input.minLength = 3;
    input.required = true; input.disabled = busy || !canJoin(); input.autocomplete = "off";
    input.dataset.focusKey = "guild-name";
    input.addEventListener("input", () => { draftName = input.value; });
    const create = button("Create guild", () => {}, "primary", !canJoin()); create.type = "submit";
    const controls = element("div", undefined, "guild-actions");
    controls.append(create, button("Cancel", () => { creating = false; render(); }, "quiet"));
    form.append(label, input, controls);
    form.addEventListener("submit", event => {
      event.preventDefault(); if (!busy && canJoin() && input.value.trim().length >= 3) act({ kind: "create", name: input.value.trim() });
    }); parent.append(form);
  }
  function canJoin() { return Boolean(snapshot?.signedIn && date(snapshot.joinAfter).getTime() <= now()); }
  function renderDirectory(parent: HTMLElement, challenge = false) {
    const g = snapshot!;
    const entries = g.directory.filter(entry => entry.id !== g.guild?.id);
    if (!entries.length) empty(parent, challenge ? "No opponents yet" : "No guilds here yet", challenge ? "Other guilds will appear here as players create them." : "Be the first to create one, or check another page.");
    const list = element("div", undefined, "guild-list"); parent.append(list);
    for (const entry of entries) {
      const item = row(list, entry.name, `${entry.members}/${GUILD_MEMBER_LIMIT} members · ${entry.champions}/${GUILD_TEAM_SIZE} champions`);
      item.prepend(mark(entry.name, "guild-avatar"));
      if (!challenge) item.append(button(entry.members >= GUILD_MEMBER_LIMIT ? "Full" : "Join", () => act({ kind: "join", guildId: entry.id }), "secondary", !canJoin() || entry.members >= GUILD_MEMBER_LIMIT, `join-${entry.id}`));
      else if (isLeader()) {
        const ready = g.guild!.members.filter(member => member.champion && date(member.eligibleAt).getTime() <= now()).length === GUILD_TEAM_SIZE;
        const disabled = !ready || !g.guild!.attacksRemaining || entry.champions !== GUILD_TEAM_SIZE || entry.challengedToday;
        item.append(button(entry.challengedToday ? "Challenged" : entry.champions !== GUILD_TEAM_SIZE ? "Not ready" : "Challenge", () => ask(
          `Challenge ${entry.name}?`, `Your saved champions will battle their lineup. Uses 1 of your guild’s ${g.guild!.attacksRemaining} remaining attacks today.`, "Start battle", { kind: "challenge", opponentGuildId: entry.id }), "secondary", disabled, `challenge-${entry.id}`));
      }
    }
    if (page !== "0" || g.nextPage) {
      const pagination = element("div", undefined, "guild-pagination");
      pagination.append(button("First page", () => { page = "0"; void load(); }, "quiet", page === "0"),
        button("Next page", () => { page = g.nextPage!; void load(); }, "quiet", !g.nextPage)); parent.append(pagination);
    }
  }
  function renderMember(parent: HTMLElement, member: Member) {
    const g = snapshot!, own = g.guild!;
    const self = member.identity === g.identity;
    const detail = [member.identity === own.leader ? "Leader" : "Member", self ? "You" : "", member.champion ? `${number(member.power)} power` : ""].filter(Boolean).join(" · ");
    const item = row(parent, member.name, detail); item.prepend(mark(member.name, "guild-avatar"));
    if (member.champion) item.append(element("span", "Champion", "guild-badge"));
    if (isLeader()) {
      const control = button("···", () => { managedMember = managedMember === member.identity ? null : member.identity; render(); }, "icon", false, `manage-${member.identity}`);
      control.setAttribute("aria-label", `Manage ${member.name}`); control.setAttribute("aria-expanded", String(managedMember === member.identity)); item.append(control);
      if (managedMember === member.identity) {
        const menu = element("div", undefined, "guild-member-actions");
        const full = own.members.filter(entry => entry.champion).length >= GUILD_TEAM_SIZE;
        menu.append(button(member.champion ? "Remove champion" : "Set as champion", () => act({ kind: "champion", identity: member.identity, champion: !member.champion }), "secondary", !member.champion && full, `champion-${member.identity}`));
        if (!member.champion && full) menu.append(element("p", "Remove a champion to free a slot."));
        if (!self) menu.append(
          button("Transfer leadership", () => ask(`Make ${member.name} leader?`, "You will become a member. Only the new leader can manage the guild and start battles.", "Transfer leadership", { kind: "transfer", identity: member.identity }), "quiet"),
          button("Remove member", () => ask(`Remove ${member.name}?`, "They will leave the guild and wait 24 hours before joining another.", "Remove member", { kind: "kick", identity: member.identity }), "danger"));
        parent.append(menu);
      }
    }
  }
  function renderGuild(body: HTMLElement) {
    const g = snapshot!;
    if (!g.guild) {
      const intro = element("div", undefined, "guild-intro");
      intro.append(mark("W"), element("h3", "Find your guild"), element("p", "Choose three champions. Battle together, even while offline.")); body.append(intro);
      if (!g.signedIn) body.append(element("p", "Sign in to join or create a guild. You can browse the rankings as a guest.", "guild-callout"));
      else if (!canJoin()) body.append(element("p", `You can join again ${date(g.joinAfter).toLocaleString()}.`, "guild-callout"));
      heading(body, "Discover guilds"); renderDirectory(body);
      if (g.signedIn) renderCreate(body);
      return;
    }
    const own = g.guild;
    const stats = element("div", undefined, "guild-stats");
    for (const [value, label] of [[`${own.members.length}/${GUILD_MEMBER_LIMIT}`, "Members"], [number(own.score), "Weekly points"], [String(own.attacksRemaining), "Attacks today"]]) {
      const stat = element("div"); stat.append(element("strong", value), element("span", label)); stats.append(stat);
    } body.append(stats);
    heading(body, "Champions", isLeader() ? "Choose your lineup from the member list." : "Your leader chooses the guild’s battle lineup.");
    const lineup = element("div", undefined, "guild-lineup");
    const champions = own.members.filter(member => member.champion);
    for (let i = 0; i < GUILD_TEAM_SIZE; i++) {
      const member = champions[i];
      const slot = element("div", undefined, `guild-champion${member ? "" : " guild-champion--empty"}`);
      slot.append(mark(member?.name ?? "+", "guild-avatar"), element("strong", member?.name ?? "Open slot"),
        element("span", member ? date(member.eligibleAt).getTime() > now() ? "Eligible soon" : `${number(member.power)} power` : "No champion")); lineup.append(slot);
    } body.append(lineup);
    if (champions.some(member => member.identity === g.identity)) {
      const update = element("div", undefined, "guild-build-update");
      update.append(element("span", "Upgraded your gear?"), button("Update my build", () => act({ kind: "refreshChampion" }), "quiet")); body.append(update);
    }
    heading(body, "Members", `${own.members.length} of ${GUILD_MEMBER_LIMIT}`);
    const roster = element("div", undefined, "guild-list"); body.append(roster);
    [...own.members].sort((a, b) => Number(b.identity === own.leader) - Number(a.identity === own.leader) || a.name.localeCompare(b.name)).forEach(member => renderMember(roster, member));
    const settings = element("details", undefined, "guild-disclosure"); settings.append(element("summary", "Guild options"));
    settings.append(button("Leave guild", () => ask("Leave this guild?", `You will wait 24 hours before joining another.${isLeader() ? own.members.length > 1 ? " Leadership passes to the longest-serving member." : " As the last member, leaving will disband the guild." : ""}`, "Leave guild", { kind: "leave" }), "danger")); body.append(settings);
  }
  function renderReports(body: HTMLElement) {
    const g = snapshot!;
    heading(body, "Recent battles");
    if (!g.battles.length) { empty(body, "Your first battle awaits", "Battle reports will appear here after a guild challenge."); return; }
    for (const battle of g.battles) {
      const attacking = battle.attackerId === g.guild?.id;
      const wins = attacking ? battle.result.wins : battle.result.losses;
      const losses = attacking ? battle.result.losses : battle.result.wins;
      const result = wins === losses ? "Draw" : wins > losses ? "Victory" : "Defeat";
      const report = element("details", undefined, "guild-report");
      const summary = element("summary");
      const info = element("span", undefined, "guild-row-copy");
      info.append(element("strong", `vs ${attacking ? battle.defender : battle.attacker}`), element("span", `${attacking ? "Attack" : "Defense"} · ${date(battle.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`));
      summary.append(element("span", result, `guild-result guild-result--${result.toLowerCase()}`), info, element("strong", `${wins}–${losses}`)); report.append(summary);
      battle.result.rounds.forEach((round, i) => {
        const winner = round.outcome === "CHALLENGER_WIN" ? round.attacker : round.outcome === "OPPONENT_WIN" ? round.defender : null;
        row(report, `${round.attacker} vs ${round.defender}`, `Round ${i + 1} · ${winner ? `${winner} wins` : "Draw"} · ${(round.durationMicros / 1_000_000).toFixed(1)}s`);
      }); body.append(report);
    }
  }
  function renderBattles(body: HTMLElement) {
    const own = snapshot!.guild;
    if (!own) {
      const message = empty(body, "A team of three. One guild.", "Join a guild to compete with saved champion builds. Nobody needs to be online together.");
      message.append(button("Find a guild", () => switchSection("guild"), "primary")); return;
    }
    heading(body, "Challenge a guild", `${own.attacksRemaining} attacks left today · Resets at 00:00 UTC`);
    if (!isLeader()) body.append(element("p", "Your leader starts battles. Everyone can view the results.", "guild-callout"));
    else if (own.members.filter(member => member.champion && date(member.eligibleAt).getTime() <= now()).length < GUILD_TEAM_SIZE) {
      const callout = element("div", undefined, "guild-callout");
      callout.append(element("p", "Three eligible champions are needed to battle."), button("Set your lineup", () => switchSection("guild"), "quiet")); body.append(callout);
    }
    renderDirectory(body, true); renderReports(body);
    const rules = element("details", undefined, "guild-disclosure"); rules.append(element("summary", "How battles work"),
      element("p", "Three saved champions face three opponents. Win more rounds to win the battle. Refresh your champion build after upgrading."),
      element("p", "Your guild gets 3 attacks a day, once per opponent. Attacking earns 3 weekly points for a victory, 1 for a draw. Defense costs no attacks and awards no points.")); body.append(rules);
  }
  function renderRankings(body: HTMLElement) {
    const g = snapshot!;
    heading(body, "Top guilds", `This week · Resets ${date(g.nextWeekAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`);
    if (!g.standings.length) { empty(body, "A new week. An open field.", "Complete a guild battle to earn your place here."); return; }
    const list = element("ol", undefined, "guild-ranking");
    g.standings.forEach((entry, index) => {
      const own = entry.id === g.guild?.id;
      const item = element("li", undefined, own ? "guild-ranking-own" : "");
      item.append(element("span", String(index + 1).padStart(2, "0"), `guild-rank${index < 3 ? " guild-rank--top" : ""}`), mark(entry.name, "guild-avatar"));
      const copy = element("div", undefined, "guild-row-copy");
      copy.append(element("strong", entry.name), element("span", `${entry.wins} wins · ${entry.members} members${own ? " · Your guild" : ""}`));
      const score = element("div", undefined, "guild-score"); score.append(element("strong", number(entry.score)), element("span", "pts"));
      item.append(copy, score); list.append(item);
    }); body.append(list);
  }
  function render() {
    const active = doc.activeElement as HTMLElement | null;
    const focusKey = active?.dataset?.focusKey;
    const wasInside = dialog.contains(active);
    const scroll = dialog.querySelector(".guild-content")?.scrollTop ?? 0;
    dialog.replaceChildren();
    const header = element("header", undefined, "guild-header");
    const title = element("div", undefined, "guild-heading");
    title.append(element("span", "WILDSTAT GUILDS", "guild-eyebrow"));
    const h2 = element("h2", snapshot?.guild?.name ?? "Guilds"); h2.id = "guildTitle"; title.append(h2);
    header.append(title);
    const closeButton = button("×", close, "icon"); closeButton.disabled = false; closeButton.setAttribute("aria-label", "Close guilds"); header.append(closeButton); dialog.append(header);
    const nav = element("nav", undefined, "guild-tabs"); nav.setAttribute("aria-label", "Guild sections");
    for (const [key, label] of [["guild", "Guild"], ["battles", "Battles"], ["rankings", "Rankings"]] as const) {
      const tab = button(label, () => switchSection(key), "tab", false, `tab-${key}`); tab.setAttribute("aria-current", key === section ? "page" : "false"); nav.append(tab);
    } dialog.append(nav);
    const body = element("div", undefined, "guild-content"); body.setAttribute("aria-busy", String(busy));
    if (error || notice) { const status = element("p", error || notice, error ? "guild-status guild-status--error" : "guild-status"); status.setAttribute("role", error ? "alert" : "status"); body.append(status); }
    if (confirmation) {
      const prompt = empty(body, confirmation.title, confirmation.detail); prompt.className = "guild-confirm";
      const selected = confirmation;
      const controls = element("div", undefined, "guild-actions");
      controls.append(button("Cancel", () => { confirmation = null; render(); }, "secondary"), button(selected.label, () => act(selected.action), "primary")); prompt.append(controls);
    } else if (!snapshot) {
      const loading = element("div", undefined, "guild-loading"); loading.setAttribute("role", "status");
      loading.append(element("span", busy ? "Loading guilds…" : "Your guilds will appear here.")); body.append(loading);
    } else if (section === "guild") renderGuild(body);
    else if (section === "battles") renderBattles(body);
    else renderRankings(body);
    dialog.append(body); body.scrollTop = scroll;
    const footer = element("footer", undefined, "guild-footer");
    const state = element("span", busy ? "Updating…" : "Weekly competition · 3v3 battles"); state.setAttribute("role", "status");
    footer.append(state, button("Refresh", () => void load(), "quiet")); dialog.append(footer);
    if (wasInside && !root.hidden) {
      const restored = [...dialog.querySelectorAll<HTMLElement>("[data-focus-key]")].find(node => node.dataset.focusKey === focusKey && !(node as HTMLButtonElement).disabled);
      (restored ?? dialog).focus();
    }
  }
  function close() {
    if (root.hidden) return;
    serial++; root.hidden = true; busy = false; options.api()?.cancel(); clearInterval(timer); timer = undefined;
    confirmation = null; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "false");
    options.onClose(); previousFocus?.focus();
  }
  function open(next: Section = "guild") {
    if (!root.hidden) close();
    previousFocus = doc.activeElement as HTMLElement | null; options.beforeOpen();
    section = next; session = options.sessionKey(); page = "0"; busy = false; snapshot = null;
    error = ""; notice = ""; creating = false; draftName = ""; managedMember = null;
    root.hidden = false; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "true");
    render(); dialog.focus(); void load();
    // Session safety only: snapshots are fetched on opening, refresh or action.
    timer = setInterval(() => { if (session !== options.sessionKey()) close(); }, 1000);
  }
  function onKey(event: KeyboardEvent) {
    if (root.hidden) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); if (confirmation) { confirmation = null; render(); } else close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary")]
      .filter(node => !node.closest("details:not([open])") || node.tagName === "SUMMARY");
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog)) { event.preventDefault(); first.focus(); }
  }
  const guildClick = () => open();
  doc.addEventListener("keydown", onKey, true);
  root.addEventListener("click", event => { if (event.target === root) close(); });
  doc.getElementById("guildBtn")?.addEventListener("click", guildClick);
  return { open, close, isOpen: () => !root.hidden, dispose() {
    close(); root.remove(); doc.removeEventListener("keydown", onKey, true);
    doc.getElementById("guildBtn")?.removeEventListener("click", guildClick);
  } };
}
