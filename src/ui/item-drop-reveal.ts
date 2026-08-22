export const ITEM_DROP_REVEAL_DURATION_MS = 3_400;

export type ItemDropRevealDetails = {
  artSource: string;
  color: string;
  name: string;
  stats: readonly string[];
};

export function itemDropRevealName(name: string) {
  return name;
}

export function createItemDropReveal(details: ItemDropRevealDetails) {
  const entry = document.createElement("div");
  entry.className = "item-drop-reveal";
  entry.style.setProperty("--item-drop-color", details.color);

  const art = document.createElement("span");
  art.className = "item-drop-art";
  art.setAttribute("aria-hidden", "true");
  const sprite = document.createElement("span");
  sprite.className = "item-drop-sprite";
  if (details.artSource) sprite.style.backgroundImage = `url(${details.artSource})`;
  art.appendChild(sprite);

  const displayName = itemDropRevealName(details.name);
  const name = document.createElement("strong");
  name.className = "item-drop-name";
  name.textContent = displayName;

  const stats = document.createElement("span");
  stats.className = "item-drop-stats";
  for (const statText of details.stats) {
    const stat = document.createElement("span");
    stat.textContent = statText;
    stats.appendChild(stat);
  }

  entry.setAttribute("aria-label", [displayName, ...details.stats].join(". "));
  entry.append(art, name, stats);
  return entry;
}
