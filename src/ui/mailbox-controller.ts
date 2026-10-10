import { itemDisplayName } from "../../shared/items";
import { itemArtImage, itemInventoryRotation } from "../game/item-presentation";
import type { MailboxMessage } from "../../shared/mailbox";
import { createReleaseNotesIndicator } from "./release-notes-unread";
import { renderUpdateNotice } from "./overlays";

export const MAIL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>`;
type Result = { ok: boolean; error?: string } | undefined;
export type MailboxCard = MailboxMessage & { rewardLabel?: string; actionLabel?: string; action?: () => Promise<Result> };
type Hooks = {
  identity: () => string;
  canOpen: () => boolean;
  connected: () => boolean;
  messages: () => MailboxCard[];
  releases: () => Parameters<typeof renderUpdateNotice>[1];
  read: (id: string) => Promise<Result>;
  claim: (id: string) => Promise<Result>;
};

/** No pause hook: mail arrival, reading and claiming all leave combat/autofarm running. */
export function createMailboxController(button: HTMLButtonElement, versionButton: HTMLElement, hooks: Hooks) {
  button.classList.add("player-visibility-toggle", "mailbox-toggle");
  button.innerHTML = `${MAIL_ICON}<span class="mailbox-unread-dot" hidden></span>`;
  const badge = button.querySelector<HTMLElement>(".mailbox-unread-dot")!;
  const notesState = document.createElement("span");
  const notesIndicator = createReleaseNotesIndicator(notesState, hooks.releases);
  const dialog = document.createElement("dialog");
  dialog.id = "gameMailbox";
  dialog.className = "game-mailbox";
  dialog.tabIndex = -1;
  dialog.setAttribute("aria-labelledby", "mailboxTitle");
  dialog.innerHTML = `<header class="mailbox-header"><h2 id="mailboxTitle" class="window-banner window-banner--gray"><span>Mailbox</span></h2></header>
    <nav class="mailbox-tabs" aria-label="Mailbox sections"><button type="button" data-tab="mail">Mail<span class="mailbox-tab-dot" hidden></span></button><button type="button" data-tab="updates">Updates<span class="mailbox-tab-dot" hidden></span></button></nav>
    <div class="mailbox-scroll" tabindex="0" aria-label="Mailbox content"></div><p class="mailbox-status" role="status" aria-live="polite"></p>
    <footer class="window-back-footer"><button class="window-back-button" type="button">Back</button></footer>`;
  document.body.append(dialog);
  const scroll = dialog.querySelector<HTMLElement>(".mailbox-scroll")!;
  const status = dialog.querySelector<HTMLElement>(".mailbox-status")!;
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  let tab = "mail", selected = "", owner = hooks.identity(), generation = 0;
  let pending = false, readPending = new Set<string>(), rendered = "";
  const read = new Set<string>(), claimed = new Set<string>();
  // Retain a claimed daily/legacy reward in the open inbox even when its pending view disappears.
  const completed = new Map<string, MailboxCard>();
  const cards = () => {
    const rows = new Map(completed);
    for (const row of hooks.messages()) rows.set(row.id, row);
    return [...rows.values()].map(row => ({ ...row, read: row.read || read.has(row.id), claimed: row.claimed || claimed.has(row.id) }));
  };
  const hasNewNotes = () => notesState.getAttribute("data-unread-notes") === "true";

  function make<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = "") {
    const element = document.createElement(tag); element.textContent = text; element.className = className; return element;
  }
  function refresh() {
    if (owner !== hooks.identity()) {
      owner = hooks.identity(); generation++; pending = false; selected = "";
      read.clear(); claimed.clear(); completed.clear(); readPending.clear(); rendered = "";
      if (dialog.open) dialog.close();
    }
    if (!hooks.canOpen() && dialog.open) dialog.close();
    button.hidden = !hooks.canOpen();
    const entries = cards();
    notesIndicator.refresh();
    const unread = entries.some(row => !row.read || (row.gems > 0n || Boolean(row.itemIds?.length)) && !row.claimed);
    badge.hidden = !(unread || hasNewNotes());
    button.setAttribute("aria-label", badge.hidden ? "Mailbox" : "Mailbox — new mail or unclaimed rewards");
    for (const item of tabs) {
      item.setAttribute("aria-current", String(item.dataset.tab === tab));
      item.querySelector<HTMLElement>(".mailbox-tab-dot")!.hidden = item.dataset.tab === "mail" ? !unread : !hasNewNotes();
    }
    if (!dialog.open) return;
    const signature = JSON.stringify([tab, selected, pending, hooks.connected(), entries], (_key, value) => typeof value === "bigint" ? value.toString() : value);
    if (signature === rendered) return;
    rendered = signature;
    const oldScroll = scroll.scrollTop;
    scroll.replaceChildren();
    if (tab === "updates") {
      const list = make("ul", "", "signin-update-history");
      renderUpdateNotice({ items: list }, hooks.releases()); scroll.append(list);
    } else if (selected) {
      const entry = entries.find(row => row.id === selected);
      if (!entry) { selected = ""; rendered = ""; refresh(); return; }
      const article = make("article", "", "mailbox-letter");
      article.append(make("div", "WildStat", "mailbox-sender"), make("h3", entry.title));
      if (entry.createdAtMs) article.append(make("time", new Date(entry.createdAtMs).toLocaleDateString(), "mailbox-date"));
      if (entry.gems > 0n || entry.rewardLabel || entry.itemIds?.length) {
        const reward = make("div", "", "mailbox-reward");
        if (entry.itemIds?.length) {
          const gear = make("div", "", "mailbox-equipment");
          for (const id of entry.itemIds) {
            const item = make("figure", "", "mailbox-equipment-item");
            const name = itemDisplayName(id).toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
            const icon = make("div", "", "mailbox-equipment-icon");
            const image = itemArtImage(id);
            if (image.tagName === "IMG") image.setAttribute("alt", name);
            image.style.transform = `rotate(${itemInventoryRotation(id)}deg)`;
            icon.append(image, make("span", `+${entry.upgradeLevel ?? 9}`, "mailbox-equipment-level"));
            item.append(icon, make("figcaption", name)); gear.append(item);
          }
          reward.append(gear);
        } else {
        const art = make("div", "", "daily-gem-bonus-art");
        const gems = document.createElement("img"); gems.src = "assets/wildstat/gems/gem-icon-v2.webp"; gems.alt = "";
        art.append(gems);
        reward.append(art, make("strong", entry.rewardLabel ?? `${entry.gems} Gems`, "mailbox-gem-amount"));
        }
        const action = make("button", entry.claimed ? "Claimed" : pending ? "Claiming…" : entry.actionLabel ?? "Claim", "daily-gem-claim-button mailbox-claim-button");
        action.type = "button"; action.disabled = entry.claimed || pending || !hooks.connected();
        action.addEventListener("click", () => { void claim(entry); }); reward.append(action);
        article.append(reward);
      }
      for (const paragraph of entry.body.split("\n\n")) article.append(make("p", paragraph));
      scroll.append(article);
    } else {
      if (!entries.length) scroll.append(make("p", hooks.connected() ? "You're all caught up." : "Connect to load your mail.", "mailbox-empty"));
      for (const entry of entries) {
        const row = make("button", "", "mailbox-row"); row.type = "button";
        row.dataset.read = String(entry.read); row.innerHTML = MAIL_ICON;
        const copy = make("span", "", "mailbox-row-copy"); copy.append(make("strong", entry.title));
        const detail = entry.claimed ? "Claimed" : entry.createdAtMs ? `WildStat · ${new Date(entry.createdAtMs).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "WildStat";
        copy.append(make("span", detail, "mailbox-row-detail")); row.append(copy);
        if (entry.gems > 0n && !entry.claimed) {
          const reward = make("span", "", "mailbox-row-reward");
          const gem = document.createElement("img"); gem.src = "assets/wildstat/gems/gem-icon-v2.webp"; gem.alt = "gems";
          reward.append(gem, make("span", entry.gems.toString())); row.append(reward);
        }
        if (entry.itemIds?.length && !entry.claimed) row.append(make("span", `+${entry.upgradeLevel ?? 9} Gear`, "mailbox-row-reward"));
        if (!entry.read) row.append(make("span", "", "mailbox-row-dot"));
        row.addEventListener("click", () => { selected = entry.id; status.textContent = ""; scroll.scrollTop = 0; rendered = ""; refresh(); void markRead(entry); });
        scroll.append(row);
      }
    }
    scroll.scrollTop = oldScroll;
  }
  async function markRead(entry: MailboxCard) {
    if (entry.read || readPending.has(entry.id) || !hooks.connected()) return;
    if (entry.action) { read.add(entry.id); refresh(); return; }
    const started = generation; readPending.add(entry.id);
    try {
      const result = await hooks.read(entry.id);
      if (started !== generation || owner !== hooks.identity()) return;
      if (result?.ok) read.add(entry.id);
    } catch { /* Unread persists, and opening it again retries. */ }
    finally { if (started === generation) { readPending.delete(entry.id); refresh(); } }
  }
  async function claim(entry: MailboxCard) {
    if (pending || entry.claimed || !hooks.connected()) return;
    const started = generation;
    // A claim can remove a legacy/daily subscription row before its promise settles.
    // Keep the letter visible through that ordering, including a failed/retried claim.
    completed.set(entry.id, entry);
    pending = true; status.textContent = ""; refresh();
    try {
      const result = await (entry.action ? entry.action() : hooks.claim(entry.id));
      if (started !== generation || owner !== hooks.identity()) return;
      if (result?.ok) {
        read.add(entry.id); claimed.add(entry.id); completed.set(entry.id, { ...entry, read: true, claimed: true });
        status.textContent = entry.itemIds?.length ? "Gear added to your inventory." : entry.actionLabel === "Got it" ? "Already added to your balance." : `${entry.gems} gems claimed!`;
      } else status.textContent = result?.error ?? "Couldn't claim. Please try again.";
    } catch { if (started === generation) status.textContent = "Couldn't claim. Please try again."; }
    finally { if (started === generation) { pending = false; refresh(); } }
  }
  function open(section = "mail") {
    if (!hooks.canOpen()) return;
    tab = section; selected = ""; rendered = ""; status.textContent = "";
    if (!dialog.open) { dialog.showModal(); dialog.focus({ preventScroll: true }); }
    if (tab === "updates") notesIndicator.markRead();
    button.setAttribute("aria-expanded", "true"); refresh(); scroll.scrollTop = 0;
  }
  tabs.forEach(item => item.addEventListener("click", () => open(item.dataset.tab)));
  button.addEventListener("click", () => open());
  versionButton.addEventListener("click", () => open("updates"));
  versionButton.removeAttribute("data-unread-notes");
  versionButton.setAttribute("aria-label", "Open updates in mailbox");
  for (const trigger of [button, versionButton]) { trigger.setAttribute("aria-controls", dialog.id); trigger.setAttribute("aria-haspopup", "dialog"); }
  function goBack() { if (selected) { selected = ""; rendered = ""; status.textContent = ""; refresh(); scroll.scrollTop = 0; } else dialog.close(); }
  back.addEventListener("click", goBack);
  dialog.addEventListener("cancel", event => { event.preventDefault(); goBack(); });
  dialog.addEventListener("close", () => { button.setAttribute("aria-expanded", "false"); if (!button.hidden) button.focus({ preventScroll: true }); });
  refresh();
  return { refresh, open, close: () => { if (dialog.open) dialog.close(); }, isOpen: () => dialog.open };
}
