import { formatCompactNumber } from "./number-format";

export type DuelResultStatSummary = {
  attacks: number;
  damage: number;
  regen: number;
  blocked: number;
};

export function duelResultStatLines(stats: DuelResultStatSummary) {
  return [
    `ATTACKED ${formatCompactNumber(stats.attacks)} TIMES`,
    `DID ${formatCompactNumber(stats.damage)} DMG`,
    `REGENERATED ${formatCompactNumber(stats.regen)} HP`,
    `BLOCKED ${formatCompactNumber(stats.blocked)} DMG`,
  ];
}

/** Builds duel summary DOM without interpolating player names into HTML. */
export function createDuelResultStatRow(subject: string, stats: DuelResultStatSummary) {
  const row = document.createElement("div");
  row.className = "duel-stat-row";
  const name = document.createElement("span");
  name.className = "duel-stat-name";
  name.textContent = subject;
  row.append(name, document.createElement("br"));
  const lines = duelResultStatLines(stats);
  lines.forEach((line, index) => {
    row.append(document.createTextNode(line));
    if (index < lines.length - 1) row.append(document.createElement("br"));
  });
  return row;
}
