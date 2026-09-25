import { formatCompactNumber } from "./number-format";
import { guildMemberPresence } from './guild-presence';
import { createGuildBattleReplay, type GuildReplayAssets } from "./guild-battle-replay";
import { renderFriends, renderGuildInvites, renderReceivedGuildInvites } from "./social-panel-content";
import type { SocialSnapshot, SocialAction } from "../../shared/social";
import type { SocialApi } from "../coop/services/social-service";
import { createGuildEmblem } from './guild-emblems';
import { GUILD_EMBLEMS, GUILD_MEMBER_LIMIT, type GuildSnapshot, type GuildReport } from "../../shared/guilds";
import type { GuildAction, GuildApi } from "../coop/services/guild-service";
import { applyProfileIcon } from "../app/profile-icons";
import { createGuildPreview } from './guild-preview';

type Section = "guild" | "battles" | "rankings" | "friends";
type Member = NonNullable<GuildSnapshot["guild"]>["members"][number];
type Options = {
  api: () => GuildApi | undefined;
  socialApi?: () => SocialApi | undefined;
  sessionKey: () => string;
  beforeOpen: () => void;
  onClose: () => void;
  onOpenPlayer?: (identity: string, name: string) => void;
  document?: Document;
  replayAssets?: GuildReplayAssets;
  lowPerformanceMode?: () => boolean;
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
  const otherGuild = createGuildPreview({ document: doc,
    load: id => { const api = options.api(); if (!api) return Promise.reject(new Error('Connect to view this guild.')); return api.loadGuildPreview(id); },
    openPlayer: (identity, name) => options.onOpenPlayer?.(identity, name),
  });
  let replay: ReturnType<typeof createGuildBattleReplay> | undefined;
  let activeReplay: GuildReport | null = null;
  let replayFromChat = false;
  let section: Section = "guild";
  let friendsReturn: Exclude<Section, "friends"> | null = null;
  let snapshot: GuildSnapshot | null = null;
  let social: SocialSnapshot | null = null;
  const drafts = { friend: "", invite: "" };
  let busy = false;
  let error = "", notice = "", page = "0", session = "", draftName = "";
  let serial = 0, clockOffset = 0, socialRevision = -1;
  let creating = false, choosingEmblem = false;
  let battleView: "opponents" | "history" | null = null;
  let managedMember: string | null = null;
  let confirmation: { title: string; detail: string; label: string; action: GuildAction } | null = null;
  let previousFocus: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  function button(label: string, action: () => void, style = "secondary", disabled = false, key = label) {
    const node = element("button", label, `guild-button guild-button--${style}`);
    node.type = "button"; node.disabled = busy || disabled; node.dataset.focusKey = key;
    node.addEventListener("click", action); return node;
  }
  function mark(name: string, className = "guild-mark", emblem?: number) {
    return createGuildEmblem(doc, name, className, emblem);
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
  function canStartBattles() { return Boolean(snapshot?.guild && (isLeader() || snapshot.guild.vicePresident === snapshot.identity)); }
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
    const previousReports = new Set(snapshot?.battles.map(battle => battle.id) ?? []);
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
      const [next, socialNext] = await Promise.all([api.loadGuild(page, section === "battles"), options.socialApi?.()?.loadSocial() ?? Promise.resolve(null)]);
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
      if (action?.kind === "challenge") {
        section = "battles"; battleView = "history"; notice = "Battle complete.";
        const battle = next.battles.find(report => report.attackerId === next.guild?.id &&
          report.defenderId === action.opponentGuildId && !previousReports.has(report.id) && (report.result.version === 2 || report.result.version === 3 || report.result.version === 4));
        if (battle) { activeReplay = battle; replayFromChat = false; }
      }
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
    const refreshDirectory = section === "battles" || next === "battles";
    if (refreshDirectory) page = "0";
    section = next; activeReplay = null; confirmation = null; managedMember = null; notice = ""; render();
    dialog.querySelector<HTMLElement>(`[data-focus-key="tab-${next}"]`)?.focus();
    if (refreshDirectory) void load();
  }
  function openFriends() {
    friendsReturn = section === "friends" ? friendsReturn : section;
    switchSection("friends");
  }
  function backFromWindow() {
    if (confirmation) { confirmation = null; render(); }
    else if (section === "friends" && friendsReturn) {
      const previous = friendsReturn; friendsReturn = null; switchSection(previous);
    } else close();
  }
  function renderCreate(parent: HTMLElement) {
    parent.append(element("p", "Requires 1 billion power", "guild-create-requirement"));
    if (!creating) {
      parent.append(button("Create a guild", () => { creating = true; render(); doc.getElementById("guildName")?.focus(); }, "primary", !canJoin()));
      return;
    }
    const form = element("form", undefined, "guild-create");
    const label = element("label", "Guild name · 4 letters"); label.htmlFor = "guildName";
    const input = element("input"); input.id = "guildName"; input.name = "guildName";
    input.value = draftName; input.placeholder = "e.g. FIRE"; input.maxLength = 4; input.minLength = 4; input.pattern = "[A-Za-z]{4}";
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
  function canJoin() { return Boolean(snapshot); }
  function renderDirectory(parent: HTMLElement, challenge = false) {
    const g = snapshot!;
    const entries = g.directory.filter(entry => entry.id !== g.guild?.id);
    if (challenge) entries.sort((a, b) => (b.totalPower ?? 0) - (a.totalPower ?? 0));
    if (!entries.length) empty(parent, challenge ? "No opponents yet" : "No guilds here yet", challenge ? "Other guilds will appear here as players create them." : "Be the first to create one, or check another page.");
    const list = element("div", undefined, "guild-list"); parent.append(list);
    for (const entry of entries) {
      const item = row(list, entry.name, `${entry.members}/${GUILD_MEMBER_LIMIT} members`);
      if (challenge) {
        const title = item.querySelector("strong")!;
        title.classList.add("guild-opponent-heading");
        const amount = entry.totalPower === undefined ? "—" : formatCompactNumber(entry.totalPower);
        const power = element("span", amount, "guild-opponent-power");
        power.setAttribute("aria-label", `Guild power: ${amount}`);
        const icon = element("img", undefined, "power-icon");
        icon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp"; icon.alt = "";
        icon.setAttribute("aria-hidden", "true"); power.append(icon);
        title.replaceChildren(element("span", entry.name), power);
      }
      const preview = element('button', undefined, 'guild-member-profile'); preview.type = 'button';
      preview.setAttribute('aria-label', `View ${entry.name} guild`);
      preview.append(mark(entry.name, "guild-avatar", entry.emblem), item.firstElementChild!);
      preview.addEventListener('click', () => void otherGuild.open(entry.id)); item.prepend(preview);
      if (!challenge) item.append(button(entry.members >= GUILD_MEMBER_LIMIT ? "Full" : "Join", () => act({ kind: "join", guildId: entry.id }), "secondary", !canJoin() || entry.members >= GUILD_MEMBER_LIMIT, `join-${entry.id}`));
      else if (canStartBattles()) {
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
  function renderMember(parent: HTMLElement, member: Member, office?: "president" | "vice") {
    const g = snapshot!, own = g.guild!;
    const self = member.identity === g.identity;
    const detail = office ? [office === "president" ? "President" : "Vice President", self ? "You" : ""].filter(Boolean).join(" · ") : guildMemberPresence(member, now());
    const item = row(parent, member.name, detail);
    if (office) item.classList.add("guild-officer", `guild-officer--${office}`);
    else item.querySelector(".guild-row-copy > span")?.classList.add(member.online ? "guild-presence--online" : "guild-presence--offline");
    const portrait = element("span", undefined, "guild-avatar");
    portrait.setAttribute("aria-hidden", "true");
    applyProfileIcon(portrait, member.profileIcon ?? 0);
    const profile = element("button", undefined, "guild-member-profile");
    profile.type = "button";
    profile.setAttribute("aria-label", `View ${member.name}'s profile`);
    profile.dataset.focusKey = `profile-${member.identity}`;
    item.firstElementChild!.append(element("span", `Power: ${member.power === undefined ? "—" : formatCompactNumber(member.power)}`, "guild-member-power"));
    profile.append(portrait, item.firstElementChild!);
    if (!office) {
      const chevron = element("span", "", "guild-profile-chevron");
      chevron.setAttribute("aria-hidden", "true"); profile.append(chevron);
    }
    profile.addEventListener("click", () => options.onOpenPlayer?.(member.identity, member.name));
    item.append(profile);
    if (isLeader() && !self) {
      const control = button("···", () => { managedMember = managedMember === member.identity ? null : member.identity; render(); }, "icon", false, `manage-${member.identity}`);
      control.setAttribute("aria-label", `Manage ${member.name}`); control.setAttribute("aria-expanded", String(managedMember === member.identity)); item.append(control);
      if (managedMember === member.identity) {
        const menu = element("div", undefined, "guild-member-actions");
        if (!self) menu.append(
          button(member.identity === own.vicePresident ? "Remove Vice President" : "Make Vice President", () => ask(
            member.identity === own.vicePresident ? `Remove ${member.name} as Vice President?` : `Make ${member.name} Vice President?`,
            member.identity === own.vicePresident ? "They will remain a member." : "They can start guild battles. Replaces your current Vice President.",
            member.identity === own.vicePresident ? "Remove role" : "Appoint", { kind: "vicePresident", identity: member.identity, enabled: member.identity !== own.vicePresident }), "quiet"),
          button("Make President", () => ask(`Make ${member.name} President?`, "You will become a member.", "Make President", { kind: "transfer", identity: member.identity }), "quiet"),
          button("Remove member", () => ask(`Remove ${member.name}?`, "They will be removed from your guild.", "Remove member", { kind: "kick", identity: member.identity }), "danger"));
        parent.append(menu);
      }
    }
  }
  function renderMembers(body: HTMLElement) {
    const own = snapshot!.guild!;
    const leadership = element("section", undefined, "guild-leadership");
    leadership.setAttribute("aria-label", "Guild leadership");
    const president = own.members.find(member => member.identity === own.leader);
    const offices = element("div", undefined, "guild-offices");
    const vice = own.members.find(member => member.identity === own.vicePresident);
    if (vice) renderMember(offices, vice, "vice");
    else {
      const vacancy = element("div", undefined, "guild-office-vacancy");
      vacancy.append(element("span", "+", "guild-office-placeholder"), element("strong", "Vice President"), element("span", "Vacant"));
      offices.append(vacancy);
    }
    if (president) renderMember(offices, president, "president");
    for (let i = 0; i < 2; i++) {
      const reserved = element("div", undefined, "guild-office-vacancy guild-office-vacancy--future");
      reserved.append(element("span", "+", "guild-office-placeholder"), element("span", "Future role"));
      offices.append(reserved);
    }
    leadership.append(offices); body.append(leadership);
    const members = own.members.filter(member => member !== president && member !== vice).sort((a, b) => a.name.localeCompare(b.name));
    heading(body, "Members", `${own.members.length}/${GUILD_MEMBER_LIMIT}`);
    const roster = element("div", undefined, "guild-list guild-roster"); body.append(roster);
    members.forEach(member => renderMember(roster, member));
    if (isLeader() && social) renderGuildInvites(body, socialContext(), own.members.map(member => member.identity));
  }
  function renderGuild(body: HTMLElement) {
    const g = snapshot!;
    if (!g.guild) {
      const intro = element("div", undefined, "guild-intro");
      intro.append(element("h3", "Find your Guild"));
      body.append(intro);
      renderCreate(body);
      if (social) renderReceivedGuildInvites(body, socialContext());
      heading(body, "Open guilds"); renderDirectory(body);
      return;
    }
    const own = g.guild;
    const identity = element("div", undefined, "guild-identity guild-preview-identity");
    const copy = element("div");
    copy.append(element("h3", own.name));
    copy.append(element("p", `${own.members.length} / ${GUILD_MEMBER_LIMIT} members`));
    const badge = element("div", undefined, "guild-badge-edit");
    badge.append(mark(own.name, "guild-mark", own.emblem));
    if (canStartBattles()) {
      const pencil = button("✎", () => { choosingEmblem = !choosingEmblem; render(); }, "icon", false, "edit-badge");
      pencil.classList.add("guild-badge-pencil"); pencil.setAttribute("aria-label", "Change guild badge");
      pencil.setAttribute("aria-expanded", String(choosingEmblem)); badge.append(pencil);
    }
    identity.append(badge, copy); body.append(identity);
    if (choosingEmblem && canStartBattles()) {
      const picker = element("div", undefined, "guild-badge-picker");
      picker.setAttribute("aria-label", "Choose guild badge");
      GUILD_EMBLEMS.forEach((name, emblem) => {
        const choice = button("", () => { choosingEmblem = false; act({ kind: "emblem", emblem }); }, "icon", false, `badge-${emblem}`);
        choice.setAttribute("aria-label", `${name} badge`); choice.setAttribute("aria-pressed", String(own.emblem === emblem));
        choice.append(mark(name, "guild-avatar", emblem)); picker.append(choice);
      }); body.append(picker);
    }
    const power = element("div", undefined, "guild-total-power");
    const amount = own.totalPower === undefined ? "—" : formatCompactNumber(own.totalPower);
    power.setAttribute("aria-label", `Guild power: ${amount}`);
    const icon = element("img", undefined, "power-icon");
    icon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp";
    icon.alt = ""; icon.setAttribute("aria-hidden", "true");
    power.append(element("span", "Power:"), element("span", amount, "power-value"), icon);
    body.append(power);
    renderMembers(body);
    const settings = element("details", undefined, "guild-disclosure"); settings.append(element("summary", "Guild options"));
    settings.append(button("Leave guild", () => ask("Leave this guild?", isLeader() ? own.members.length > 1 ? own.vicePresident ? "The Vice President becomes President." : "The longest-serving member becomes President." : "Leaving will disband the guild." : "You can join another guild immediately.", "Leave guild", { kind: "leave" }), "danger")); body.append(settings);
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
      if ((battle.result.version === 2 || battle.result.version === 3 || battle.result.version === 4)) {
        summary.append(button("Replay", () => { activeReplay = battle; replayFromChat = false; render(); }, "secondary", false, `replay-${battle.id}`));
      } else if ("rounds" in battle.result) {
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
    const view = battleView ?? (canStartBattles() ? "opponents" : "history");
    const tabs = element("div", undefined, "guild-battle-tabs");
    tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Guild battles");
    for (const [key, label] of [["opponents", "Find opponent"], ["history", "Battle history"]] as const) {
      const tab = button(label, () => { battleView = key; render(); }, "quiet", false, `battle-${key}`);
      tab.setAttribute("aria-pressed", String(view === key)); tabs.append(tab);
    }
    body.append(tabs);
    if (view === "history") renderReports(body);
    else {
      heading(body, "Choose an opponent", `${own.attacksRemaining} attacks left · Highest power first · Resets 00:00 UTC`);
      if (!canStartBattles()) body.append(element("p", "Only the President or Vice President can challenge.", "guild-callout"));
      else if (!own.attacksRemaining) body.append(element("p", "All attacks used. More at 00:00 UTC.", "guild-callout"));
      else {
        const readyAt = Math.max(...own.members.map(member => date(member.eligibleAt).getTime()));
        if (readyAt > now()) body.append(element("p", `Ready ${new Date(readyAt).toLocaleString()}.`, "guild-callout"));
      }
      renderDirectory(body, true);
    }
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
      item.append(element("span", String(index + 1).padStart(2, "0"), `guild-rank${index < 3 ? " guild-rank--top" : ""}`), mark(entry.name, "guild-avatar", entry.emblem));
      const copy = element("div", undefined, "guild-row-copy");
      copy.append(element("strong", entry.name), element("span", `${entry.wins} wins · ${entry.members} members${own ? " · Your guild" : ""}`));
      const score = element("div", undefined, "guild-score"); score.append(element("strong", number(entry.score)), element("span", "pts"));
      const preview = element('button', undefined, 'guild-member-profile'); preview.type = 'button';
      preview.setAttribute('aria-label', `View ${entry.name} guild`);
      preview.append(item.lastElementChild!, copy);
      preview.addEventListener('click', () => { if (own) { switchSection('guild'); } else void otherGuild.open(entry.id); });
      item.append(preview, score); list.append(item);
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
    root.classList.toggle("guild-overlay--replay", Boolean(activeReplay));
    const active = doc.activeElement as HTMLElement | null;
    const focusKey = active?.dataset?.focusKey;
    const wasInside = dialog.contains(active);
    const inviteExpanded = dialog.querySelector<HTMLDetailsElement>(".social-invite")?.open;
    const scroll = dialog.querySelector(".guild-content")?.scrollTop ?? 0;
    dialog.replaceChildren();
    if ((activeReplay?.result.version === 2 || activeReplay?.result.version === 3 || activeReplay?.result.version === 4)) {
      const battle = activeReplay;
      replay = createGuildBattleReplay(dialog, activeReplay.result, [battle.attacker, battle.defender], options.replayAssets, backFromReplay, options.lowPerformanceMode);
      dialog.querySelector("h3")!.id = "guildTitle";
      return;
    }
    const header = element("header", undefined, "guild-header");
    const title = element("div", undefined, "guild-heading");
    const h2 = element("h2", undefined, "window-banner"); h2.id = "guildTitle";
    h2.append(element("span", section === "friends" ? "Friends" : "Guilds")); dialog.append(h2);
    if (section === "friends") { title.append(element("span", "Your people")); header.append(title); }
    if (section !== "friends") {
      const inbox = social ? social.incomingRequests.length + social.guildInvitations.length : 0;
      header.append(button(inbox ? `Manage friends (${inbox})` : "Manage friends", openFriends, "quiet", false, "manage-friends"));
    }
    const refresh = button("↻", () => void load(), "icon", false, "refresh");
    refresh.setAttribute("aria-label", "Refresh"); refresh.title = "Refresh";
    header.append(refresh);
    const nav = element("nav", undefined, "guild-tabs"); nav.setAttribute("aria-label", "Guild sections");
    for (const [key, label] of [["guild", snapshot?.guild ? "My Guild" : "Find Guild"], ["battles", "Battles"], ["rankings", "Rankings"]] as const) {
      const tab = button(label, () => switchSection(key), "tab", false, `tab-${key}`); tab.setAttribute("aria-current", key === section ? "page" : "false"); nav.append(tab);
    }
    if (section !== "friends") dialog.append(nav);
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
    body.append(header);
    dialog.append(body);
    const inviteDisclosure = dialog.querySelector<HTMLDetailsElement>(".social-invite");
    if (inviteDisclosure && inviteExpanded) inviteDisclosure.open = true;
    body.scrollTop = scroll;
    const footer = element("footer", undefined, "window-back-footer");
    const back = button("Back", backFromWindow); back.className = "window-back-button"; back.disabled = false;
    footer.append(back); dialog.append(footer);
    if (wasInside && !root.hidden) {
      const restored = [...dialog.querySelectorAll<HTMLElement>("[data-focus-key]")].find(node => node.dataset.focusKey === focusKey && !(node as HTMLButtonElement).disabled);
      (restored ?? dialog).focus();
    }
  }
  function close() {
    otherGuild.close();
    if (root.hidden) return;
    replay?.dispose(); replay = undefined; activeReplay = null;
    serial++; root.hidden = true; busy = false; options.api()?.cancel(); clearInterval(timer); timer = undefined;
    confirmation = null; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "false");
    options.onClose(); previousFocus?.focus();
  }
  function open(next: Section = "guild") {
    if (!root.hidden) close();
    previousFocus = doc.activeElement as HTMLElement | null; options.beforeOpen();
    section = next; friendsReturn = null; battleView = null; session = options.sessionKey(); page = "0"; busy = false; snapshot = null; social = null; drafts.friend = ""; drafts.invite = "";
    error = ""; notice = ""; creating = false; choosingEmblem = false; draftName = ""; managedMember = null;
    root.hidden = false; doc.getElementById("guildBtn")?.setAttribute("aria-expanded", "true");
    render(); dialog.focus(); void load();
    // Session safety only: snapshots are fetched on opening, refresh or action.
    timer = setInterval(() => { if (session !== options.sessionKey()) close(); }, 1000);
  }
  function onKey(event: KeyboardEvent) {
    if (root.hidden || doc.querySelector("#playerProfile:not([hidden])")) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); if (activeReplay) backFromReplay(); else backFromWindow(); return; }
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
      if (!report || (report.result.version !== 2 && report.result.version !== 3 && report.result.version !== 4)) throw new Error("This replay is no longer available.");
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
    otherGuild.dispose();
    doc.defaultView?.removeEventListener("wildwood:open-guild-replay", openChatReplay);
    doc.defaultView?.removeEventListener("wildwood:open-friends", friendsClick);
    close(); root.remove(); doc.removeEventListener("keydown", onKey, true);
    doc.getElementById("guildBtn")?.removeEventListener("click", guildClick);
  } };
}
