import { BOSS_HITBOX_VISIBLE_KEY } from "../game/runtime/game-settings";

type BossHitboxOverlayDependencies = {
  allowed: () => boolean;
  storage?: Pick<Storage, "getItem" | "setItem">;
};

/**
 * A developer switch that draws each boss's collision shape over its artwork.
 *
 * The radius lives in the server module and the artwork's size is derived in
 * the client, so nothing compares the two while the game is running. This is
 * how you see that a boss is hit before an arrow reaches it.
 *
 * Built here rather than in index.html: the startup shell is size-bounded and
 * a developer-only row does not belong in the bytes every player downloads.
 */
export function createBossHitboxOverlayControl(parent: HTMLElement, dependencies: BossHitboxOverlayDependencies) {
  const storage = dependencies.storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const read = () => {
    try { return storage?.getItem(BOSS_HITBOX_VISIBLE_KEY) === "true"; } catch { return false; }
  };
  let enabled = read();

  const row = document.createElement("div");
  row.className = "dev-control-row";
  const label = document.createElement("span");
  label.className = "dev-control-label";
  label.textContent = "Boss hitboxes";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dev-control-button";
  row.append(label, button);
  parent.append(row);

  function paint() {
    button.textContent = enabled ? "Shown" : "Hidden";
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `Boss collision shapes: ${enabled ? "shown" : "hidden"}. Toggle`);
    row.hidden = !dependencies.allowed();
  }

  button.addEventListener("click", () => {
    enabled = !enabled;
    try { storage?.setItem(BOSS_HITBOX_VISIBLE_KEY, String(enabled)); } catch { /* private browsing */ }
    paint();
  });

  paint();
  return { visible: () => enabled && dependencies.allowed(), refresh: paint };
}
