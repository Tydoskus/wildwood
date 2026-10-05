import { REWARD_DATA, rewardAmountLabel, type RewardType } from "../game/enemies";
import { formatCompactNumber } from "./number-format";
import type { MapSignRow } from "../game/runtime/map-enemy-sign";

/** Short stat names: the reward's colour already says which stat. */
export const SHORT_STAT: Record<RewardType, string> = { damage: "Atk", health: "HP", armor: "Armor", regen: "Regen", speed: "Spd" };

/**
 * The window a map's enemy sign opens: one row per kind of enemy, weakest
 * first, at a size a phone can read. Back (or Escape, which presses the top
 * window's Back) closes it.
 */
export function createMapEnemyIndex(doc: Document = document) {
  let overlay: HTMLElement | null = null;
  let body: HTMLElement, mapLabel: HTMLElement;

  function build() {
    overlay = doc.createElement("div");
    overlay.className = "enemy-index-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="enemy-index-window" role="dialog" aria-modal="true" aria-labelledby="enemyIndexTitle">
        <h2 id="enemyIndexTitle" class="window-banner window-banner--gray"><span>Enemy Index</span></h2>
        <p class="enemy-index-map"></p>
        <table class="enemy-index-table">
          <thead><tr><th scope="col">Enemy</th><th scope="col">HP</th><th scope="col">Atk</th><th scope="col">Reward</th></tr></thead>
          <tbody></tbody>
        </table>
        <p class="enemy-index-note">Atk is one hit, before your armor. Rewards are per kill.</p>
        <footer class="window-back-footer"><button type="button" class="window-back-button">Back</button></footer>
      </section>`;
    doc.body.append(overlay);
    body = overlay.querySelector("tbody")!;
    mapLabel = overlay.querySelector(".enemy-index-map")!;
    overlay.querySelector(".window-back-button")!.addEventListener("click", close);
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  }

  function open(mapName: string, rows: readonly MapSignRow[]) {
    if (!rows.length) return;
    if (!overlay) build();
    mapLabel.textContent = mapName;
    body.replaceChildren(...rows.map(row => {
      const tr = doc.createElement("tr");
      const name = doc.createElement("th");
      name.scope = "row";
      name.textContent = `${row.elite ? "★ " : ""}${row.name}`;
      name.classList.toggle("is-elite", row.elite);
      const reward = doc.createElement("td");
      const rewards = row.boss ? row.boss.rewards : [row.reward];
      reward.replaceChildren(...rewards.map(paid => Object.assign(doc.createElement("span"), {
        className: "enemy-index-reward", textContent: `${rewardAmountLabel(paid)} ${SHORT_STAT[paid.type]}` })));
      reward.querySelectorAll<HTMLElement>("span").forEach((span, index) => { span.style.color = REWARD_DATA[rewards[index].type].color; });
      if (!rewards.length) reward.textContent = "—";
      if (row.boss) {
        tr.className = "is-boss";
        name.append(Object.assign(doc.createElement("small"), { className: "enemy-index-boss-tag", textContent: "Boss" }));
      }
      // A boss's attacks each on a line of their own under it, strongest first.
      if (row.boss && row.boss.attacks.length > 1) {
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
        tr.append(name, ...[formatCompactNumber(row.hp), formatCompactNumber(row.hit)].map(value => Object.assign(doc.createElement("td"), { textContent: value })), reward);
        return [tr, attacks];
      }
      tr.append(name, ...[formatCompactNumber(row.hp), formatCompactNumber(row.hit)].map(value => Object.assign(doc.createElement("td"), { textContent: value })), reward);
      return [tr];
    }).flat());
    overlay!.hidden = false;
    overlay!.querySelector<HTMLButtonElement>(".window-back-button")!.focus();
  }

  function close() { if (overlay) overlay.hidden = true; }

  return { open, close, isOpen: () => Boolean(overlay && !overlay.hidden) };
}
