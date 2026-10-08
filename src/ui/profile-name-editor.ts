import type { NameChangeStatus } from "../../shared/name-change";

export function createProfileNameEditor(elements: {
  overlay: HTMLElement; form: HTMLFormElement; input: HTMLInputElement; save: HTMLButtonElement;
}, api: {
  localDisplayName: () => string | undefined;
  getNameChangeStatus: () => Promise<NameChangeStatus | undefined>;
  isNameTaken: (name: string) => boolean;
  setDisplayName: (name: string, expectedCost: number) => Promise<{ ok?: boolean; error?: string } | undefined>;
  showMessage: (text: string, color: string) => void;
}) {
  const note = document.createElement("p");
  note.className = "profile-name-editor-note";
  note.setAttribute("role", "status");
  elements.form.append(note);
  let status: NameChangeStatus | undefined, receivedAt = 0, generation = 0, saving = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function render() {
    elements.save.disabled = true;
    if (saving) { elements.save.textContent = "Saving…"; return; }
    if (!status) { elements.save.textContent = "Save"; return; }
    elements.save.textContent = status.cost ? `Save · ${status.cost} Gems` : "Save · Free";
    const remaining = status.availableAtMs - status.serverNowMs - (Date.now() - receivedAt);
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60_000);
      note.textContent = `Available in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    } else if (status.balance < status.cost) {
      note.textContent = `You need ${status.cost} Gems to change your name.`;
    } else {
      note.textContent = status.cost ? "Once every 24 hours" : "First change free · Then 50 Gems, once every 24 hours";
      elements.save.disabled = false;
    }
  }

  async function loadStatus() {
    const request = ++generation;
    status = undefined;
    note.textContent = "Checking…";
    render();
    try {
      const loaded = await api.getNameChangeStatus();
      if (request !== generation || elements.overlay.hidden) return;
      if (!loaded) throw new Error("Unavailable");
      status = loaded;
      receivedAt = Date.now();
      render();
    } catch {
      if (request === generation && !elements.overlay.hidden) note.textContent = "Couldn't check. Close and try again.";
    }
  }

  function close() {
    generation++;
    clearInterval(timer);
    timer = undefined;
    elements.overlay.hidden = true;
  }

  async function open() {
    if (saving) return;
    elements.input.value = api.localDisplayName() || "";
    elements.overlay.hidden = false;
    clearInterval(timer);
    timer = setInterval(render, 1000);
    requestAnimationFrame(() => { if (!elements.overlay.hidden) { elements.input.focus(); elements.input.select(); } });
    await loadStatus();
  }

  async function save(event: Event) {
    event.preventDefault();
    render();
    if (elements.overlay.hidden || saving || elements.save.disabled || !status) return;
    const name = elements.input.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9 _-]{2,20}$/.test(name)) { note.textContent = "Use 2–20 letters, numbers, spaces, - or _."; return; }
    if (name === api.localDisplayName()) { note.textContent = "Name already set"; return; }
    if (api.isNameTaken(name)) { note.textContent = "Name taken · Try another"; return; }
    const request = generation;
    saving = true;
    render();
    try {
      const result = await api.setDisplayName(name, status.cost);
      if (request !== generation) return;
      if (!result?.ok) throw new Error(result?.error || "Name update failed");
      close();
      api.showMessage("NAME UPDATED", "#c9f5c2");
    } catch (error) {
      if (request !== generation) return;
      api.showMessage(error instanceof Error ? error.message : "NAME UPDATE FAILED", "#ff9b91");
    } finally {
      saving = false;
      if (!elements.overlay.hidden && request === generation) await loadStatus();
    }
  }
  elements.form.addEventListener("submit", event => void save(event));
  elements.overlay.addEventListener("click", event => { if (event.target === elements.overlay) close(); });
  return { open, close };
}
