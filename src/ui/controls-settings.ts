import {
  BINDABLE_PAD_BUTTONS, CONTROL_ACTIONS, RESERVED_KEYS, controlBindings, defaultBindings, keyLabel, onControlBindingsChange,
  padLabel, setControlBindings, withKey, withPadButton, type ControlAction,
} from "../game/runtime/control-bindings";
import { captureNextPadButton, connectedGamepad, onGamepadChange } from "./gamepad-controls";

/**
 * The Controls tab: each action with its key and controller button. Tap one, then press the new key or
 * button; Backspace clears a key, Escape or B cancels. Taking a key or button another action has swaps them.
 */
export function createControlsSettings(doc: Document) {
  const root = doc.createElement("div");
  root.id = "controlsSettings";
  root.className = "controls-settings";

  const status = doc.createElement("p");
  status.className = "controls-status";
  const header = doc.createElement("div");
  header.className = "controls-row controls-header";
  for (const text of ["Action", "Key", "Controller"]) {
    const cell = doc.createElement("span");
    cell.textContent = text;
    header.append(cell);
  }
  const list = doc.createElement("div");
  list.className = "controls-list";
  const help = doc.createElement("p");
  help.className = "controls-help";
  help.textContent = "Arrow keys always move. On a controller the left stick or D-pad moves you. In windows the D-pad moves between buttons, A selects, B goes back, LB/RB switch tabs and the right stick scrolls.";
  const reset = doc.createElement("button");
  reset.type = "button";
  reset.className = "setting-toggle controls-reset";
  reset.textContent = "Reset Controls";
  root.append(status, header, list, help, reset);

  let listening: { action: ControlAction; kind: "key" | "pad" } | null = null;
  let stopListening: (() => void) | null = null;

  const finish = () => {
    stopListening?.();
    stopListening = null;
    listening = null;
    render();
  };

  const listenForKey = (action: ControlAction) => {
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") { finish(); return; }
      if (event.code === "Backspace" || event.code === "Delete") { setControlBindings(withKey(controlBindings(), action, "")); finish(); return; }
      if (RESERVED_KEYS.includes(event.code)) return;
      setControlBindings(withKey(controlBindings(), action, event.code));
      finish();
    };
    // Capture on the window, before any shortcut or the game sees the key.
    doc.defaultView?.addEventListener("keydown", onKey, true);
    stopListening = () => doc.defaultView?.removeEventListener("keydown", onKey, true);
  };

  const listenForPad = (action: ControlAction) => {
    const take = (button: number) => {
      if (button === 1) { finish(); return; } // B cancels
      if (BINDABLE_PAD_BUTTONS.includes(button)) setControlBindings(withPadButton(controlBindings(), action, button));
      finish();
    };
    const stop = captureNextPadButton(take);
    // Escape on a keyboard cancels a controller rebinding too.
    const onKey = (event: KeyboardEvent) => { if (event.code === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finish(); } };
    doc.defaultView?.addEventListener("keydown", onKey, true);
    stopListening = () => { stop(); doc.defaultView?.removeEventListener("keydown", onKey, true); };
  };

  const bindButton = (action: ControlAction, kind: "key" | "pad", text: string, fixed = false) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "setting-toggle controls-bind";
    button.setAttribute("data-action", action);
    button.setAttribute("data-kind", kind);
    const waiting = listening?.action === action && listening.kind === kind;
    button.textContent = waiting ? (kind === "key" ? "Press a Key…" : "Press a Button…") : text;
    button.classList.toggle("is-listening", waiting);
    button.disabled = fixed;
    button.setAttribute("aria-label", `${CONTROL_ACTIONS.find(entry => entry.id === action)?.label} ${kind === "key" ? "Key" : "Controller Button"}: ${button.textContent}`);
    button.addEventListener("click", () => {
      const again = listening?.action === action && listening.kind === kind;
      stopListening?.();
      stopListening = null;
      listening = again ? null : { action, kind };
      if (listening) kind === "key" ? listenForKey(action) : listenForPad(action);
      render();
      if (listening) doc.querySelector<HTMLElement>(`.controls-bind[data-action="${action}"][data-kind="${kind}"]`)?.focus();
    });
    return button;
  };

  function render() {
    const bindings = controlBindings();
    const name = connectedGamepad();
    status.textContent = name ? `Controller Connected · ${name.replace(/\s*\(.*$/, "")}` : "No Controller Found · Press any button on one to connect it";
    list.textContent = "";
    list.append(...CONTROL_ACTIONS.map(action => {
      const row = doc.createElement("div");
      row.className = "controls-row";
      const label = doc.createElement("span");
      label.textContent = action.label;
      row.append(label,
        bindButton(action.id, "key", keyLabel(bindings.keys[action.id])),
        bindButton(action.id, "pad", action.movement ? "Left Stick" : padLabel(bindings.pad[action.id]), action.movement));
      return row;
    }));
  }

  reset.addEventListener("click", () => { finish(); setControlBindings(defaultBindings()); });
  onControlBindingsChange(render);
  onGamepadChange(render);
  render();
  return root;
}

/** Whether the Controls tab is worth showing: a keyboard and mouse, or a controller. */
export function controlsTabUseful(doc: Document) {
  const touchOnly = doc.defaultView?.matchMedia?.("(hover: none) and (pointer: coarse)").matches ?? false;
  return !touchOnly || Boolean(connectedGamepad());
}
