import { activeRelease, type ReleaseWindow } from "../../shared/release-window";

type UpdateView = { text: string; blocking: boolean; urgent: boolean };
export function createScheduledUpdateController(d: {
  now: () => number;
  release: () => ReleaseWindow | null;
  playing: () => boolean;
  forcedUpdateRequired?: () => boolean;
  pause: (paused: boolean) => void;
  save: () => void;
  drain: () => Promise<boolean>;
  acknowledge: (id: string) => Promise<unknown>;
  rememberSession: (version: string) => boolean;
  render: (view: UpdateView) => void;
  checkVersion: () => void;
}) {
  let busy = false, acknowledged = "", retryAt = 0, paused = false, seen = "";
  let generation = 0;
  function pause(value: boolean) { if (paused !== value) { paused = value; d.pause(value); } }
  async function drain() {
    d.save();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([d.drain(), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 10_000); })]);
    } catch { return false; }
    finally { clearTimeout(timer); }
  }
  async function prepareReload(version: string) {
    if (!d.playing()) return true;
    if (activeRelease(d.release(), d.now()) || busy) return false;
    busy = true;
    const currentGeneration = generation;
    pause(true);
    d.render({ text: "Saving progress…", blocking: true, urgent: false });
    const saved = await drain();
    // An already-enforced protocol change cannot acknowledge old reducers.
    // Its persisted reward queue must resume in the new client instead of
    // trapping the account on the old build indefinitely.
    const ready = (saved || d.forcedUpdateRequired?.() === true) && currentGeneration === generation && !activeRelease(d.release(), d.now()) && d.rememberSession(version);
    busy = false;
    if (!ready) {
      pause(false);
      d.render({ text: "Update waiting for progress to sync", blocking: false, urgent: false });
    }
    return ready;
  }
  function tick() {
    const release = d.release(), now = d.now();
    const active = activeRelease(release, now);
    const key = active ? `${active.id}:${active.phase}` : "";
    if (key !== seen) {
      generation++;
      seen = key;
      if (!active) {
        pause(false);
        if (release?.phase === "complete" && release.reload) d.checkVersion();
      }
    }
    if (!active) {
      if (!busy) d.render({ text: "", blocking: false, urgent: false });
      return;
    }
    if (active.phase === "scheduled") {
      pause(false);
      const seconds = Math.max(0, Math.ceil((active.startsAt - now) / 1000));
      d.render({ text: seconds ? `Update in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Update preparing…",
        blocking: false, urgent: seconds <= 30 });
      return;
    }
    if (!d.playing()) return;
    pause(true);
    d.render({ text: active.phase === "draining" && acknowledged !== active.id ? "Saving progress…" : "Updating… You’ll reconnect automatically.", blocking: true, urgent: false });
    if (active.phase !== "draining" || acknowledged === active.id || busy || now < retryAt) return;
    busy = true;
    const currentGeneration = generation;
    void drain().then(async saved => {
      if (!saved || currentGeneration !== generation || !activeRelease(d.release(), d.now())) return;
      await d.acknowledge(active.id);
      if (currentGeneration === generation) acknowledged = active.id;
    }).catch(() => {}).finally(() => { busy = false; retryAt = d.now() + 2_000; });
  }
  return { tick, prepareReload, canReload: () => !activeRelease(d.release(), d.now()) };
}

export function createScheduledUpdateView(documentValue = document) {
  const element = documentValue.createElement("div");
  element.className = "scheduled-update";
  element.hidden = true;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  const text = documentValue.createElement("span");
  element.append(text);
  documentValue.body.append(element);
  const updateGate = documentValue.getElementById("gameUpdateGate");
  let previous = "";
  return (view: UpdateView) => {
    const key = JSON.stringify(view);
    if (key === previous) return;
    previous = key;
    // Share the standard update screen without taking ownership of its hidden
    // state: protocol updates may still need it after this release is cancelled.
    updateGate?.toggleAttribute("data-scheduled-update", view.blocking);
    element.hidden = !view.text || view.blocking;
    element.classList.toggle("scheduled-update--urgent", view.urgent);
    text.textContent = view.text;
  };
}
