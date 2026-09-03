import { FOREST_REWARD_PROTOTYPE as rules, type ForestPrototypeAttack, type ForestPrototypeState } from "../../shared/forest-reward-prototype";

export type ForestPrototypePanelDependencies = {
  state: () => ForestPrototypeState | null;
  send: (action?: ForestPrototypeAttack) => Promise<{ ok?: boolean; error?: string } | undefined> | undefined;
};

/** A manual, fixed-target server experiment. Never mutates the real player or enemy runtime. */
export function createForestRewardPrototypePanel(parent: HTMLElement, dependencies: ForestPrototypePanelDependencies) {
  const section = document.createElement("section");
  section.className = "dev-forest-prototype";
  const title = document.createElement("strong");
  title.textContent = "FOREST REWARD PROTOTYPE";
  const explanation = document.createElement("p");
  explanation.textContent = `${rules.enemy} · ${rules.enemyHp} HP · +${rules.damageReward} test damage per kill. Fixed starter weapon, no bonuses. Forest only. Real saves are never changed. This tests attack/reward accounting, not movement or projectile collisions.`;
  const status = document.createElement("p");
  status.setAttribute("aria-live", "polite");
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "dev-forest-prototype-actions";
  const buttons = ["Start / Respawn", "Attack", "Batch 3", "Replay request", "Invalid batch"].map((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = label;
    actions.append(button);
    return button;
  });
  section.append(title, explanation, status, actions, feedback);
  parent.append(section);
  let pending = false;
  let generation = 0;
  let lastRequest: ForestPrototypeAttack | undefined;
  let calls = 0;

  function render() {
    const state = dependencies.state();
    status.textContent = state
      ? `Encounter ${state.encounter} · HP ${state.enemyHp}/${rules.enemyHp} · Test damage ${state.damage} · Confirmed kills ${state.kills} · Attack sequence ${state.lastAttack}`
      : "Not started. Enter the forest, then start the test.";
    buttons.forEach((button, index) => {
      button.disabled = pending || (index > 0 && !state) || (index === 3 && !lastRequest);
    });
  }

  async function send(action?: ForestPrototypeAttack) {
    if (pending) return;
    const revision = generation;
    pending = true;
    calls += 1;
    if (action) lastRequest = { ...action };
    const started = performance.now();
    feedback.textContent = "Waiting for the server…";
    render();
    try {
      const result = await dependencies.send(action);
      if (revision !== generation) return;
      feedback.textContent = `${result?.ok ? "Accepted (replays are no-ops)" : result?.error || "Prototype server unavailable"} · ${Math.round(performance.now() - started)} ms round trip · ${calls} calls this session. Cooldown 1.56s, respawn 5s; Batch 3 needs three earned attack slots.`;
    } catch {
      if (revision === generation) feedback.textContent = "Request failed. Replay the same request after reconnecting.";
    } finally {
      if (revision === generation) { pending = false; render(); }
    }
  }
  buttons.forEach((button, index) => button.addEventListener("click", () => {
    if (index === 0) { void send(); return; }
    if (index === 3) { if (lastRequest) void send(lastRequest); return; }
    const state = dependencies.state();
    if (!state) return;
    void send({ encounter: state.encounter, firstAttack: state.lastAttack + 1n, count: index === 2 ? 3 : index === 4 ? 4 : 1 });
  }));
  render();
  return {
    render,
    clear() { generation += 1; pending = false; lastRequest = undefined; calls = 0; feedback.textContent = ""; render(); },
  };
}
