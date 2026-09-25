import { formatCompactNumber } from "./number-format";
import { createGuildEmblem } from './guild-emblems';
import { guildMemberPresence } from './guild-presence';
import { GUILD_MEMBER_LIMIT, type GuildPreview } from '../../shared/guilds';
import { applyProfileIcon } from '../app/profile-icons';

/** A separate overlay keeps the fullscreen guild page and its scroll position intact. */
export function createGuildPreview(options: {
  document: Document;
  load: (id: string) => Promise<GuildPreview>;
  openPlayer: (identity: string, name: string) => void;
}) {
  const doc = options.document;
  const root = doc.createElement('div'); root.className = 'guild-overlay guild-overlay--overview'; root.hidden = true;
  const panel = doc.createElement('section'); panel.className = 'guild-window guild-window--overview'; panel.tabIndex = -1;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'guildPreviewTitle');
  root.append(panel); doc.body.append(root);
  let revision = 0, previous: HTMLElement | null = null;
  function node(tag: string, text: string, className = '') {
    const el = doc.createElement(tag); el.textContent = text; el.className = className; return el;
  }
  function close() { revision++; if (root.hidden) return; root.hidden = true; previous?.focus(); }
  function show(title: string, content: HTMLElement) {
    panel.replaceChildren();
    const heading = node('h2', '', 'window-banner'); heading.id = 'guildPreviewTitle'; heading.append(node('span', title));
    const footer = node('footer', '', 'window-back-footer');
    const back = node('button', 'Back', 'window-back-button'); back.addEventListener('click', close); footer.append(back);
    panel.append(heading, content, footer);
  }
  function profile(member: GuildPreview['members'][number], role: string) {
    const button = node('button', '', 'guild-preview-president guild-member-profile');
    button.setAttribute('aria-label', `View ${member.name}'s profile`);
    const icon = node('span', '', 'guild-avatar'); applyProfileIcon(icon, member.profileIcon ?? 0);
    const text = node('span', '', 'guild-row-copy'); text.append(node('strong', member.name), node('span', role || guildMemberPresence(member, Date.now()), role ? '' : member.online ? 'guild-presence--online' : 'guild-presence--offline'));
    text.append(node("span", `Power: ${member.power === undefined ? "—" : formatCompactNumber(member.power)}`, "guild-member-power"));
    button.append(icon, text); button.addEventListener('click', () => { options.openPlayer(member.identity, member.name); });
    return button;
  }
  async function open(id: string) {
    const request = ++revision; previous = doc.activeElement as HTMLElement | null; root.hidden = false;
    const body = node('div', 'Loading guild…', 'guild-content'); body.setAttribute('role', 'status');
    show('Guild', body); panel.focus();
    try {
      const guild = await options.load(id);
      if (request !== revision || root.hidden) return;
      body.textContent = ''; body.removeAttribute('role');
      const identity = node('div', '', 'guild-identity guild-preview-identity');
      identity.append(createGuildEmblem(doc, guild.name, "guild-mark", guild.emblem), node('h3', guild.name)); body.append(identity);
      body.append(node('p', `${guild.members.length}/${GUILD_MEMBER_LIMIT} members · ${guild.score} weekly points`));
      for (const [role, identity] of [['President', guild.leader], ['Vice President', guild.vicePresident]]) {
        const member = guild.members.find(row => row.identity === identity);
        if (member) body.append(profile(member, role!));
      }
      const members = node('details', '', 'guild-disclosure'); members.append(node('summary', 'Members'));
      for (const member of guild.members.filter(row => row.identity !== guild.leader && row.identity !== guild.vicePresident)) members.append(profile(member, ''));
      body.append(members);
    } catch (error) {
      if (request === revision && !root.hidden) body.textContent = error instanceof Error ? error.message : 'Could not load guild.';
    }
  }
  const onKey = (event: KeyboardEvent) => {
    if (root.hidden || doc.querySelector("#playerProfile:not([hidden])")) return;
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')]
        .filter(el => !el.closest('details:not([open])') || el.tagName === 'SUMMARY');
      const index = focusable.indexOf(doc.activeElement as HTMLElement);
      if (index < 0 || (event.shiftKey ? index === 0 : index === focusable.length - 1)) {
        event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus();
      }
    }
  };
  doc.addEventListener('keydown', onKey, true);
  root.addEventListener('click', event => { if (event.target === root) close(); });
  return { open, close, dispose() { close(); root.remove(); doc.removeEventListener('keydown', onKey, true); } };
}
