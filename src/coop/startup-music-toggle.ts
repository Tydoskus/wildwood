type StartupMusicStorage = Pick<Storage, "getItem" | "setItem">;

export type StartupMusicToggleElements = {
  toggle: HTMLButtonElement;
};

type StartupMusicToggleHooks = {
  storageKey: string;
  storage?: StartupMusicStorage;
  defaultVolume?: number;
};

function startupMusicToggleElements(documentValue: Document): StartupMusicToggleElements {
  const toggle = documentValue.getElementById("signInMuteButton");
  if (!toggle) throw new Error("Missing startup music toggle #signInMuteButton");
  return { toggle: toggle as HTMLButtonElement };
}

function normalizedVolume(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

function browserStorage(storage?: StartupMusicStorage) {
  if (storage) return storage;
  try { return localStorage; } catch { return undefined; }
}

/** Owns the sign-in music preference until the deferred game audio controller loads. */
export function createStartupMusicToggle(
  hooks: StartupMusicToggleHooks,
  elements = startupMusicToggleElements(document),
) {
  const fallbackVolume = normalizedVolume(hooks.defaultVolume ?? .35, .35);
  const storage = browserStorage(hooks.storage);
  let volume = fallbackVolume;
  try {
    const storedVolume = storage?.getItem(hooks.storageKey);
    if (storedVolume !== null && storedVolume !== undefined) {
      volume = normalizedVolume(storedVolume, fallbackVolume);
    }
  } catch {}
  let lastAudibleVolume = volume > 0 ? volume : fallbackVolume;

  function render() {
    const muted = volume <= 0;
    const label = muted ? "Unmute music" : "Mute music";
    elements.toggle.setAttribute("aria-pressed", String(muted));
    elements.toggle.setAttribute("aria-label", label);
    elements.toggle.title = label;
  }

  function toggle() {
    if (volume > 0) {
      lastAudibleVolume = volume;
      volume = 0;
    } else {
      volume = lastAudibleVolume;
    }
    try { storage?.setItem(hooks.storageKey, String(volume)); } catch {}
    render();
  }

  function dispose() {
    elements.toggle.removeEventListener("click", toggle);
  }

  render();
  elements.toggle.addEventListener("click", toggle);
  return { dispose, volume: () => volume };
}
