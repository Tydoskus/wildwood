import type { renderUpdateNotice } from "./overlays";

type Releases = Parameters<typeof renderUpdateNotice>[1];
const READ_KEY = "wildstat-release-notes-read-v1";
// The sign-in shell and the game are separate bundles, each with its own copy
// of this module: the read mark and the indicators live on the page instead.
type SharedNotes = { sessionRead: string; indicators: Set<() => void> };
const page = globalThis as { __wildstatReleaseNotes?: SharedNotes };
const shared = (page.__wildstatReleaseNotes ??= { sessionRead: "", indicators: new Set() });

// Release objects are cached by the changelog, so each one is stringified once.
const signatures = new WeakMap<object, string>();
function signature(releases: Releases) {
  const latest = releases[0];
  if (!latest) return "";
  let text = signatures.get(latest);
  if (text === undefined) signatures.set(latest, text = JSON.stringify([latest.version, latest.notes]));
  return text;
}

function lastRead() {
  try { return localStorage.getItem(READ_KEY) ?? shared.sessionRead; } catch { return shared.sessionRead; }
}

/** Shared by sign-in and in-game notes; preparing hidden notes never marks them read. */
export function createReleaseNotesIndicator(toggle: Pick<HTMLElement, "setAttribute">, releases: () => Releases) {
  function refresh() {
    const latest = signature(releases());
    const unread = Boolean(latest && latest !== lastRead());
    toggle.setAttribute("data-unread-notes", String(unread));
    toggle.setAttribute("aria-description", unread ? "Unread release notes" : "");
  }
  function markRead() {
    const latest = signature(releases());
    if (!latest) return;
    shared.sessionRead = latest;
    try { localStorage.setItem(READ_KEY, latest); } catch {}
    for (const update of shared.indicators) update();
  }
  function storageChanged(event: StorageEvent) {
    if (event.key === READ_KEY || event.key === null) refresh();
  }
  shared.indicators.add(refresh);
  if (typeof window !== "undefined") window.addEventListener("storage", storageChanged);
  refresh();
  return {
    refresh,
    markRead,
    dispose() {
      shared.indicators.delete(refresh);
      if (typeof window !== "undefined") window.removeEventListener("storage", storageChanged);
    },
  };
}
