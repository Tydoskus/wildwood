import { REWARD_DATA, rewardAmountLabel, type RewardType } from "../game/enemies";
import { formatCompactNumber } from "./number-format";
import type { EnemyIndexRow } from "../game/runtime/enemy-index-rows";

/** Short stat names: the reward's colour already says which stat. */
export const SHORT_STAT: Record<RewardType, string> = { damage: "Atk", health: "HP", armor: "Armor", regen: "Regen", speed: "Spd" };

/**
 * The Enemy Index table in the map window: one row per kind of enemy, weakest
 * first, then the boss with each of its attacks on a line under it, at a size
 * a phone can read. HP is green and Atk red; rewards wear their stat's colour.
 */
export function renderEnemyIndexRows(doc: Document, body: HTMLElement, rows: readonly EnemyIndexRow[]) {
  body.replaceChildren(...rows.flatMap(row => {
    const tr = doc.createElement("tr");
    const name = doc.createElement("th");
    name.scope = "row";
    name.textContent = `${row.elite ? "★ " : ""}${row.name}`;
    name.classList.toggle("is-elite", row.elite);
    const reward = doc.createElement("td");
    const rewards = row.boss ? row.boss.rewards : [row.reward];
    reward.replaceChildren(...rewards.map(paid => {
      const line = Object.assign(doc.createElement("span"), { className: "enemy-index-reward", textContent: `${rewardAmountLabel(paid)} ${SHORT_STAT[paid.type]}` });
      line.style.color = REWARD_DATA[paid.type].color;
      return line;
    }));
    if (!rewards.length) reward.textContent = "—";
    tr.append(name, ...[formatCompactNumber(row.hp), formatCompactNumber(row.hit)].map(value => Object.assign(doc.createElement("td"), { textContent: value })), reward);
    if (!row.boss) return [tr];
    tr.className = "is-boss";
    name.append(Object.assign(doc.createElement("small"), { className: "enemy-index-boss-tag", textContent: "Boss" }));
    if (row.boss.attacks.length < 2) return [tr];
    // Each attack on a line of its own under the boss, strongest first.
    const attacks = doc.createElement("tr");
    attacks.className = "enemy-index-attacks";
    const cell = Object.assign(doc.createElement("td"), { colSpan: 4 });
    cell.replaceChildren(...row.boss.attacks.map(attack => {
      const line = Object.assign(doc.createElement("span"), { className: "enemy-index-attack" });
      line.append(Object.assign(doc.createElement("span"), { textContent: attack.name }),
        Object.assign(doc.createElement("strong"), { textContent: formatCompactNumber(attack.hit) }));
      return line;
    }));
    attacks.append(cell);
    return [tr, attacks];
  }));
}
