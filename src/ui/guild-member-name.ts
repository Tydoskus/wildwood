import { appendPlayerIdentity } from "./player-identity";

/** Guild layout uses the same name, badges, and power formatting as chat. */
export function renderGuildMemberName(target: HTMLElement, member: {
  identity: string; name: string; power?: number; prestige?: number;
}) {
  target.replaceChildren(); target.classList.add("guild-member-name");
  appendPlayerIdentity(target, member, { showGuildTag: false });
}
