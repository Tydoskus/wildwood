import { createGuildBattleReplay, type GuildReplayAssets } from "./guild-battle-replay";
import { renderFriends, renderGuildInvites } from "./social-panel-content";
import type { SocialSnapshot, SocialAction } from "../../shared/social";
import type { SocialApi } from "../coop/services/social-service";
import { playerNamePrefix } from "../app/player-name-tags";
import { GUILD_MEMBER_LIMIT, type GuildSnapshot, type GuildReport } from "../../shared/guilds";
import type { GuildAction, GuildApi } from "../coop/services/guild-service";

type Section = "guild" | "battles" | "rankings" | "friends";
type Member = NonNullable<GuildSnapshot["guild"]>["members"][number];
type Options = {
  api: () => GuildApi | undefined;
  socialApi?: () => SocialApi | undefined;
  sessionKey: () => string;
  beforeOpen: () => void;
  onClose: () => void;
  document?: Document;
  replayAssets?: GuildReplayAssets;
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
  let replay: ReturnType<typeof createGuildBattleReplay> | undefined;
  let activeReplay: GuildReport | null = null;
  let replayFromChat = false;
  let section: Section = "guild";
  let snapshot: GuildSnapshot | null = null;
  let social: SocialSnapshot | null = null;
  const drafts = { friend: "", invite: "" };
  let busy = false;
  let error = "", notice = "", page = "0", session = "", draftName = "";
  let serial = 0, clockOffset = 0, socialRevision = -1;
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
  async function load(action?: GuildAction, socialAction?: SocialAction) {
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
      if (socialAction) {
        const socialApi = options.socialApi?.();
        if (!socialApi) throw new Error("Connect to your character to continue.");
        await socialApi.socialAction(socialAction); saved = true;
        if (!current(id)) return;
      }
      const [next, socialNext] = await Promise.all([api.loadGuild(page), options.socialApi?.()?.loadSocial() ?? Promise.resolve(null)]);
      if (!current(id)) return;
      snapshot = next; social = socialNext;
      if (socialAction) {
        notice = socialAction.action === "requestFriend" ? "Friend request sent." : socialAction.action === "inviteGuild" ? "Guild invitation sent." : "Updated.";
        if (socialAction.action === "requestFriend") drafts.friend = "";
        if (socialAction.action === "inviteGuild") drafts.invite = "";
        if (socialAction.action === "acceptGuildInvite") { section = "guild"; notice = "You joined the guild."; }
      }
      clockOffset = date(next.serverNow).getTime() - Date.now();
      if (action?.kind === "create" || action?.kind === "join" || action?.kind === "leave") {
        section = "guild"; creating = false; managedMember = null; draftName = "";
      }
      if (action?.kind === "challenge") { section = "battles"; notice = "Battle complete."; }
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
    section = next; activeReplay = null; confirmation = null; managedMember = null; notice = ""; render();
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
    input.value = draftName; input.placeholder = "4 letters, e.g. Fire"; input.maxLength = 4; input.minLength = 4; input.pattern = "[A-Za-z]{4}";
    input.required = true; input.disabled = busy || !canJoin(); input.autocomplete = "off";
    input.dataset.focusKey = "guild-name";
    input.addEventListener("input", () => { draftName = input.value; });
    const create = button("Create guild", () => {}, "primary", !canJoin()); create.type = "submit";
    const controls = element("div", undefined, "guild-actions");
    controls.append(create, button("Cancel", () => { creating = false; render(); }, "quiet"));
    form.append(label, input, controls);
    form.addEventListener("submit", event => {
      event.preventDefault(); if (!busy && canJoin() && /^[A-Za-z]{4}$/.test(input.value.trim())) act({ kind: "create", name: input.value.trim() });
    }); parent.append(form);
  }
  function canJoin() { return Boolean(snapshot && date(snapshot.joinAfter).getTime() <= now()); }
  function renderDirectory(parent: HTMLElement, challenge = false) {
    const g = snapshot!;
    const entries = g.directory.filter(entry => entry.id !== g.guild?.id);
    if (!entries.length) empty(parent, challenge ? "No opponents yet" : "No guilds here yet", challenge ? "Other guilds will appear here as players create them." : "Be the first to create one, or check another page.");
    const list = element("div", undefined, "guild-list"); parent.append(list);
    for (const entry of entries) {
      const item = row(list, entry.name, `${entry.members}/${GUILD_MEMBER_LIMIT} members`);
      item.prepend(mark(entry.name, "guild-avatar"));
      if (!challenge) item.append(button(entry.members >= GUILD_MEMBER_LIMIT ? "Full" : "Join", () => act({ kind: "join", guildId: entry.id }), "secondary", !canJoin() || entry.members >= GUILD_MEMBER_LIMIT, `join-${entry.id}`));
      else if (isLeader()) {
        const ready = g.guild!.members.length > 0 && g.guild!.members.every(member => date(member.eligibleAt).getTime() <= now());
        const disabled = !ready || !g.guild!.attacksRemaining || !entry.members || entry.challengedToday;
        item.append(button(entry.challengedToday ? "Challenged" : !entry.members ? "Not ready" : "Challenge", () => ask(
          `Challenge ${entry.name}?`, `All ${g.guild!.members.length} of your members will fight their ${entry.members} members with current saved builds. Uses 1 of your guild’s ${g.guild!.attacksRemaining} remaining attacks today.`, "Start battle", { kind: "challenge", opponentGuildId: entry.id }), "secondary", disabled, `challenge-${entry.id}`));
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
    const detail = [member.identity === own.leader ? "Leader" : "Member", self ? "You" : ""].filter(Boolean).join(" · ");
    const item = row(parent, `${playerNamePrefix(member.identity)}${member.name}`, detail); item.prepend(mark(member.name, "guild-avatar"));
    if (isLeader()) {
      const control = button("···", () => { managedMember = managedMember === member.identity ? null : member.identity; render(); }, "icon", false, `manage-${member.identity}`);
      control.setAttribute("aria-label", `Manage ${member.name}`); control.setAttribute("aria-expanded", String(managedMember === member.identity)); item.append(control);
      if (managedMember === member.identity) {
        const menu = element("div", undefined, "guild-member-actions");
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
      intro.append(element("h3", "Join a guild")); body.append(intro);
      if (!canJoin()) body.append(element("p", `You can join again ${date(g.joinAfter).toLocaleString()}.`, "guild-callout"));
      heading(body, "Discover guilds"); renderDirectory(body);
      renderCreate(body);
      return;
    }
    const own = g.guild;
    if (isLeader() && social) renderGuildInvites(body, socialContext(), own.members.map(member => member.identity));
    const stats = element("div", undefined, "guild-stats");
    for (const [value, label] of [[`${own.members.length}/${GUILD_MEMBER_LIMIT}`, "Members"], [number(own.score), "Weekly points"], [String(own.attacksRemaining), "Attacks today"]]) {
      const stat = element("div"); stat.append(element("strong", value), element("span", label)); stats.append(stat);
    } body.append(stats);
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
      const result = battle.result.outcome === "DRAW" ? "Draw" : (battle.result.outcome === "VICTORY") === attacking ? "Victory" : "Defeat";
      const report = element("div", undefined, "guild-report");
      const summary = element("div", undefined, "guild-report-summary");
      const info = element("span", undefined, "guild-row-copy");
      info.append(element("strong", `vs ${attacking ? battle.defender : battle.attacker}`), element("span", `${attacking ? "Attack" : "Defense"} · ${date(battle.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`));
      summary.append(element("span", result, `guild-result guild-result--${result.toLowerCase()}`), info); report.append(summary);
      if (battle.result.version === 2) {
        summary.append(button("Replay", () => { activeReplay = battle; replayFromChat = false; render(); }, "secondary", false, `replay-${battle.id}`));
      } else {
        const legacy = element("details", undefined, "guild-disclosure"); legacy.append(element("summary", "Previous battle report"));
        battle.result.rounds.forEach(round => row(legacy, `${round.attacker} vs ${round.defender}`, `${(round.durationMicros / 1_000_000).toFixed(1)}s`));
        report.append(legacy);
      }
      body.append(report);
    }
  }
  function renderBattles(body: HTMLElement) {
    const own = snapshot!.guild;
    if (!own) {
      const message = empty(body, "Guild battles", "Join a guild to battle.");
      message.append(button("Find a guild", () => switchSection("guild"), "primary")); return;
    }
    heading(body, "Challenge a guild", `${own.attacksRemaining} attacks left today · Resets at 00:00 UTC`);
    if (!isLeader()) body.append(element("p", "Your leader starts battles. Everyone can view the results.", "guild-callout"));
    renderDirectory(body, true); renderReports(body);
    const rules = element("details", undefined, "guild-disclosure"); rules.append(element("summary", "How battles work"),
      element("p", "Every member joins one simultaneous battle using their latest saved stats and gear. Eliminate the opposing guild to win. At 60 seconds, remaining team health percentage breaks the tie."),
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
  function tick() {
    if (!root.hidden && session !== options.sessionKey()) { close(); return; }
    const api = options.socialApi?.();
    if (!api || busy || api.revision() === socialRevision) return;
    socialRevision = api.revision();
    const next = api.snapshot();
    if (root.hidden || next === social || activeReplay) return;
    social = next;
    if (section === "friends" || section === "guild") render();
  }
  function socialContext() {
    return { document: doc, snapshot: social!, busy, drafts,
      act: (action: SocialAction) => { void load(undefined, action); },
      message: (username: string, identity: string) => {
        close(); doc.defaultView?.dispatchEvent(new CustomEvent("wildwood:open-private-chat", { detail: { username, identity } }));
      },
    };
  }
  function render() {
    replay?.dispose(); replay = undefined;
    dialog.classList.toggle("guild-window--replay", Boolean(activeReplay));
    const active = doc.activeElement as HTMLElement | null;
    const focusKey = active?.dataset?.focusKey;
    const wasInside = dialog.contains(active);
    const inviteExpanded = dialog.querySelector<HTMLDetailsElement>(".social-invite")?.open;
    const scroll = dialog.querySelector(".guild-content")?.scrollTop ?? 0;
    dialog.replaceChildren();
    if (activeReplay?.result.version === 2) {
      const battle = activeReplay;
      replay = createGuildBattleReplay(dialog, activeReplay.result, [battle.attacker, battle.defender], options.replayAssets, backFromReplay);
      dialog.querySelector("h3")!.id = "guildTitle";
      return;
    }
    const header = element("header", undefined, "guild-header");
    const title = element("div", undefined, "guild-heading");
    const h2 = element("h2", undefined, "window-banner"); h2.id = "guildTitle";
    h2.append(element("span", section === "friends" ? "Friends" : "Guilds")); dialog.append(h2);
    if (snapshot?.guild && section !== "friends") title.append(element("strong", snapshot.guild.name));
    header.append(title);
    header.append(button("Refresh", () => void load(), "quiet")); dialog.append(header);
    const nav = element("nav", undefined, "guild-tabs"); nav.setAttribute("aria-label", "Guild sections");
    for (const [key, label] of [["guild", "Guild"], ["battles", "Battles"], ["rankings", "Rankings"], ["friends", "Friends"]] as const) {
      const inbox = social ? social.incomingRequests.length + social.guildInvitations.length : 0;
      const tab = button(key === "friends" && inbox ? `Friends (${inbox})` : label, () => switchSection(key), "tab", false, `tab-${key}`); tab.setAttribute("aria-current", key === section ? "page" : "false"); nav.append(tab);
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
    } else if (section === "friends") {
      if (social) renderFriends(body, socialContext());
      else empty(body, "Friends unavailable", "Connect to your character, then refresh to see your friends.");
    } else if (section === "guild") renderGuild(body);
    else if (section === "battles") renderBattles(body);
    else renderRankings(body);
    dialog.append(body);
    const inviteDisclosure = dialog.querySelector<HTMLDetailsElement>(".social-invite");
    if (inviteDisclosure && inviteExpanded) inviteDisclosure.open = true;
    body.scrollTop = scroll;
    const footer = element("footer", undefined, "window-back-footer");
    const back = button("Back", close); back.className = "window-back-button"; back.disabled = false;
    footer.append(back); dialog.append(footer);
    if (wasInside && !root.hidden) {
      const restored = [...dialog.querySelectorAll<HTMLElement>("[data-focus-key]")].find(node => node.dataset.focusKey === focusKey && !(node as HTMLButtonElement).disabled);
      (restored ?? dialog).focus();
    }
  }
  function close() {
    if (root.hidden) return;
    replay?.dispose(); replay = undefined; activeReplay = null;
    serial++; root.hidden = true; busy = false; options.api()?.cancel(); clearInterval(timer); timer = undefined;
    confirmation = null; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "false");
    options.onClose(); previousFocus?.focus();
  }
  function open(next: Section = "guild") {
    if (!root.hidden) close();
    previousFocus = doc.activeElement as HTMLElement | null; options.beforeOpen();
    section = next; session = options.sessionKey(); page = "0"; busy = false; snapshot = null; social = null; drafts.friend = ""; drafts.invite = "";
    error = ""; notice = ""; creating = false; draftName = ""; managedMember = null;
    root.hidden = false; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "true");
    render(); dialog.focus(); void load();
    // Session safety only: snapshots are fetched on opening, refresh or action.
    timer = setInterval(() => { if (session !== options.sessionKey()) close(); }, 1000);
  }
  function onKey(event: KeyboardEvent) {
    if (root.hidden) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); if (confirmation) { confirmation = null; render(); } else if (activeReplay) { backFromReplay(); } else close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary")]
      .filter(node => !node.closest("details:not([open])") || node.tagName === "SUMMARY");
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); dialog.focus(); }
    else if (event.shiftKey && (doc.activeElement === first || doc.activeElement === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || doc.activeElement === dialog)) { event.preventDefault(); first.focus(); }
  }
  function backFromReplay() {
    activeReplay = null;
    if (replayFromChat) close(); else render();
  }
  const openChatReplay = async (event: Event) => {
    const reportKey = (event as CustomEvent<{ reportKey?: unknown }>).detail?.reportKey;
    if (typeof reportKey !== "string" || !/^\d+:\d+$/.test(reportKey)) return;
    if (!root.hidden) close();
    previousFocus = doc.activeElement as HTMLElement | null; options.beforeOpen();
    session = options.sessionKey(); root.hidden = false; snapshot = null; activeReplay = null;
    replayFromChat = true; error = ""; notice = ""; busy = true; render();
    const id = ++serial;
    timer = setInterval(() => { if (session !== options.sessionKey()) close(); }, 1000);
    try {
      const report = await options.api()?.loadReplay(reportKey);
      if (!current(id)) return;
      if (!report || report.result.version !== 2) throw new Error("This replay is no longer available.");
      activeReplay = report;
    } catch (cause) { if (current(id)) error = cause instanceof Error ? cause.message : "Replay unavailable."; }
    finally { if (current(id)) { busy = false; render(); dialog.focus(); } }
  };
  doc.defaultView?.addEventListener("wildwood:open-guild-replay", openChatReplay);
  const guildClick = () => root.hidden ? open() : close();
  const friendsClick = () => open("friends");
  doc.defaultView?.addEventListener("wildwood:open-friends", friendsClick);
  doc.addEventListener("keydown", onKey, true);
  root.addEventListener("click", event => { if (event.target === root) close(); });
  doc.getElementById("guildBtn")?.addEventListener("click", guildClick);
  return { open, close, tick, isOpen: () => !root.hidden, dispose() {
    doc.defaultView?.removeEventListener("wildwood:open-guild-replay", openChatReplay);
    doc.defaultView?.removeEventListener("wildwood:open-friends", friendsClick);
    close(); root.remove(); doc.removeEventListener("keydown", onKey, true);
    doc.getElementById("guildBtn")?.removeEventListener("click", guildClick);
  } };
}
