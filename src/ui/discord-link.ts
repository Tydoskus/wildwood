/** The one invite, and the one icon, both screens that offer it share. */
export const DISCORD_INVITE_URL = "https://discord.gg/mcS226NbG4";

export const DISCORD_ICON_MARKUP = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.3 4.4a19.8 19.8 0 0 0-4.9-1.5l-.6 1.2a18.3 18.3 0 0 0-5.5 0l-.6-1.2a19.9 19.9 0 0 0-4.9 1.5C.7 9 .0 13.5.3 17.9a19.8 19.8 0 0 0 6 3l1.2-2a12.7 12.7 0 0 1-1.9-.9l.5-.4a14.1 14.1 0 0 0 11.8 0l.5.4a13.2 13.2 0 0 1-1.9.9l1.2 2a19.7 19.7 0 0 0 6-3c.5-5.1-.8-9.5-3.4-13.5ZM8 15.2c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z"/></svg>`;

/**
 * Built in script rather than written into index.html: the icon's path alone
 * is most of a kilobyte, and the startup shell is size-bounded.
 */
export function createDiscordLink(documentValue: Document, className: string) {
  const link = documentValue.createElement("a");
  link.className = className;
  link.href = DISCORD_INVITE_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "Join Discord";
  link.setAttribute("aria-label", "Join the WildStat Discord (opens in a new tab)");
  link.innerHTML = DISCORD_ICON_MARKUP;
  return link;
}
