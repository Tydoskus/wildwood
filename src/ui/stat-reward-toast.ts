type StatRewardPresentation = {
  icon: string;
  label: string;
};

export type StatRewardToastModel = StatRewardPresentation & {
  amount: string;
};

const STAT_REWARD_PRESENTATION: Readonly<Record<string, StatRewardPresentation>> = {
  DAMAGE: { icon: "⚔️", label: "Damage" },
  "MAX HEALTH": { icon: "♥", label: "Max Health" },
  ARMOR: { icon: "🛡️", label: "Armor" },
  "ATK/SEC": { icon: "⚡", label: "Attack Speed" },
  "HP/SEC": { icon: "✚", label: "Regeneration" },
};

export function statRewardToastModel(text: string): StatRewardToastModel | null {
  const match = /^(\+\S+)\s+(.+)$/.exec(text.trim());
  if (!match) return null;
  const presentation = STAT_REWARD_PRESENTATION[match[2]];
  if (!presentation) return null;
  return { amount: match[1], ...presentation };
}

export function createStatRewardToast(text: string, color: string) {
  const entry = document.createElement("div");
  entry.className = "pickup";

  const model = statRewardToastModel(text);
  if (!model) {
    entry.textContent = text;
    entry.style.color = color;
    return entry;
  }

  entry.classList.add("stat-reward-toast");
  entry.style.setProperty("--stat-reward-accent", color);
  entry.setAttribute("role", "status");
  entry.setAttribute("aria-label", `${model.label} ${model.amount}`);

  const icon = document.createElement("span");
  icon.className = "stat-reward-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = model.icon;

  const label = document.createElement("span");
  label.className = "stat-reward-label";
  label.textContent = model.label;

  const amount = document.createElement("strong");
  amount.className = "stat-reward-value";
  amount.textContent = model.amount;

  const arrow = document.createElement("span");
  arrow.className = "stat-reward-arrow";
  arrow.setAttribute("aria-hidden", "true");

  entry.append(icon, label, amount, arrow);
  return entry;
}
