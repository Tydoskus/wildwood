import { formatCompactNumber } from "./number-format";
import { renderGuildMemberName } from "./guild-member-name";
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
    const button = node('button', '', 'guild-member-profile');
    button.setAttribute('aria-label', `View ${member.name}'s profile`);
    const icon = node('span', '', 'guild-avatar'); applyProfileIcon(icon, member.profileIcon ?? 0);
    const text = node('span', '', 'guild-row-copy'); text.append(node('strong', member.name), node('span', role || guildMemberPresence(member, Date.now()), role ? '' : member.online ? 'guild-presence--online' : 'guild-presence--offline'));
    renderGuildMemberName(text.querySelector<HTMLElement>("strong")!, member);
    button.append(icon, text); button.addEventListener('click', () => { options.openPlayer(member.identity, member.name); });
    if (!role) {
      const chevron = node('span', '', 'guild-profile-chevron'); chevron.setAttribute('aria-hidden', 'true'); button.append(chevron);
    }
    const row = node('div', '', role ? `guild-row guild-officer guild-officer--${role === 'President' ? 'president' : 'vice'}` : 'guild-row');
    row.append(button); return row;
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
      const copy = node('div', '');
      copy.append(node('h3', guild.name));
      identity.append(createGuildEmblem(doc, guild.name, "guild-mark", guild.emblem), copy); body.append(identity);
      const power = node('div', '', 'guild-total-power');
      const amount = formatCompactNumber(guild.members.reduce((total, member) => total + (member.power ?? 0), 0));
      power.setAttribute('aria-label', `Guild power: ${amount}`);
      const powerIcon = doc.createElement('img'); powerIcon.className = 'power-icon';
      powerIcon.src = 'assets/wildstat/icons/Icon_Battle_Candy_v2.webp'; powerIcon.alt = '';
      power.append(node('span', 'Power:'), node('span', amount, 'power-value'), powerIcon); body.append(power);
      const leadership = node('section', '', 'guild-leadership'); leadership.setAttribute('aria-label', 'Guild leadership');
      const offices = node('div', '', 'guild-offices');
      for (const [role, identity] of [['President', guild.leader], ['Vice President', guild.vicePresident]]) {
        const member = guild.members.find(row => row.identity === identity);
        if (member) offices.append(profile(member, role!));
        else if (role === 'Vice President') {
          const vacant = node('div', '', 'guild-office-vacancy');
          vacant.append(node('span', '+', 'guild-office-placeholder'), node('strong', role), node('span', 'Vacant')); offices.append(vacant);
        }
      }
      leadership.append(offices); body.append(leadership);
      const heading = node('div', '', 'guild-section-heading');
      const memberHeading = node('h3', 'Members'); memberHeading.id = 'guildPreviewMembersTitle';
      heading.append(memberHeading, node('p', `${guild.members.length}/${GUILD_MEMBER_LIMIT}`)); body.append(heading);
      const memberList = node('div', '', 'guild-list guild-roster guild-preview-member-list');
      memberList.setAttribute('role', 'region'); memberList.setAttribute('aria-labelledby', memberHeading.id); memberList.tabIndex = 0;
      for (const member of guild.members.filter(row => row.identity !== guild.leader && row.identity !== guild.vicePresident).sort((a, b) => a.name.localeCompare(b.name))) memberList.append(profile(member, ''));
      body.append(memberList);
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
