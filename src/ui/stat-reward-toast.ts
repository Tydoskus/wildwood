import { formatCompactNumber } from "./number-format";

type StatRewardPresentation = {
  icon: string;
  label: string;
};

export type StatRewardToastModel = StatRewardPresentation & {
  stat: string;
  amount: string;
  value: number;
};

const STAT_REWARD_PRESENTATION: Readonly<Record<string, StatRewardPresentation>> = {
  DAMAGE: { icon: "⚔️", label: "Damage" },
  "MAX HEALTH": { icon: "♥", label: "Max Health" },
  ARMOR: { icon: "🛡️", label: "Armor" },
  "ATK/SEC": { icon: "⚡", label: "Attack Speed" },
  "HP/SEC": { icon: "✚", label: "Regeneration" },
};

const COMPACT_MULTIPLIERS: Readonly<Record<string, number>> = {
  "": 1,
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
  qd: 1e15,
  qn: 1e18,
  sx: 1e21,
  sp: 1e24,
  oc: 1e27,
  no: 1e30,
  dc: 1e33,
  ud: 1e36,
};

function statRewardValue(amount: string) {
  const match = /^\+([0-9]+(?:\.[0-9]+)?)([a-z]*)$/i.exec(amount);
  if (!match) return null;
  const multiplier = COMPACT_MULTIPLIERS[match[2].toLowerCase()];
  if (multiplier === undefined) return null;
  const value = Number(match[1]) * multiplier;
  return Number.isFinite(value) ? value : null;
}

export function formatStatRewardToastAmount(stat: string, value: number) {
  if (stat === "ATK/SEC" || (Math.abs(value) < 1_000 && !Number.isInteger(value))) {
    return `+${value.toFixed(2)}`;
  }
  return `+${formatCompactNumber(value)}`;
}

export function statRewardToastModel(text: string): StatRewardToastModel | null {
  const match = /^(\+\S+)\s+(.+)$/.exec(text.trim());
  if (!match) return null;
  const stat = match[2];
  const presentation = STAT_REWARD_PRESENTATION[stat];
  const value = statRewardValue(match[1]);
  if (!presentation || value === null) return null;
  return { stat, amount: match[1], value, ...presentation };
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
