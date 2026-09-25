import { appendPlayerNameTags, appendPrestigeBadge } from "../app/player-name-tags";
import { appendPlayerGenderIcon } from "./player-gender";
import type { PlayerGender } from "../../shared/player-gender";
import { formatCompactNumber } from "./number-format";

const NAME_COLORS = ["#ffc3dd", "#bce7ff", "#c9f5c2", "#ffe7a8", "#e1c7ff", "#bff3e7", "#ffd1aa", "#d0d9ff"];

function nameColor(identity: string) {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return NAME_COLORS[(hash >>> 0) % NAME_COLORS.length];
}

/** One identity line for chat and guild rosters; layouts only control placement. */
export function appendPlayerIdentity(target: HTMLElement, player: {
  identity: string; name: string; power?: number; prestige?: number; gender?: PlayerGender; guest?: boolean;
}, { chat = false, showGuildTag = true }: { chat?: boolean; showGuildTag?: boolean } = {}) {
  const doc = target.ownerDocument;
  target.classList.add("player-identity"); target.title = player.name;
  target.style.color = nameColor(player.identity);
  const core = doc.createElement("span"); core.className = `player-identity-core${chat ? " chat-name-core" : ""}`;
  appendPlayerNameTags(core, player.identity, undefined, showGuildTag);
  const name = doc.createElement("span"); name.className = `player-identity-name${chat ? " chat-name-text" : ""}`;
  name.textContent = player.name; core.append(name);
  appendPrestigeBadge(core, player.identity, player.prestige);
  if (player.gender !== undefined) appendPlayerGenderIcon(core, player.gender);
  if (player.guest) core.append(doc.createTextNode(" (guest)"));
  target.append(core);
  if (player.power !== undefined && player.power > 0) {
    const power = doc.createElement("span"); power.className = `player-identity-power${chat ? " chat-power" : " guild-member-power"}`;
    const amount = formatCompactNumber(player.power); power.setAttribute("aria-label", `Power ${amount}`);
    const icon = doc.createElement("img"); icon.className = `power-icon player-identity-power-icon${chat ? " chat-power-icon" : ""}`;
    icon.src = "assets/wildstat/icons/Icon_Battle_Candy_v2.webp"; icon.alt = ""; icon.setAttribute("aria-hidden", "true");
    const value = doc.createElement("span"); value.textContent = amount;
    power.append(value, icon); target.append(power);
  }
}
