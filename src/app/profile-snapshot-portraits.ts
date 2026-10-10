import { profileSnapshotKey, type ProfileSnapshotLook } from "../../shared/profile-snapshot";

/**
 * A drawn snapshot: the canvas for canvas portraits, a URL for DOM ones. A look
 * wearing a galaxy piece also has `paint`, which draws it afresh, because that
 * finish moves and a picture drawn once would freeze it.
 */
export type ProfileSnapshotPortrait = {
  key: string; canvas: CanvasImageSource; url: string;
  paint?: (context: CanvasRenderingContext2D, width: number, height: number) => void;
};
type Renderer = (look: ProfileSnapshotLook) => ProfileSnapshotPortrait | null;
type Source = { look: (identity: string) => ProfileSnapshotLook | undefined; revision: () => number };

/** Distinct looks kept drawn. A chat page or a leaderboard page is well under it. */
export const PROFILE_SNAPSHOT_PORTRAIT_LIMIT = 192;
const WATCH_SWEEP_AT = 512;

let source: Source | null = null;
let renderer: Renderer | null = null;
let seenRevision = 0;
let poll: ReturnType<typeof setInterval> | undefined;
const portraits = new Map<string, ProfileSnapshotPortrait>();
const watched = new Map<HTMLElement, () => void>();
const listeners = new Set<() => void>();

function changed() {
  for (const [element, repaint] of [...watched]) {
    if (!element.isConnected) watched.delete(element);
    else repaint();
  }
  for (const listener of [...listeners]) listener();
}

/** Where looks come from (the coop session), and how to tell that one moved. */
export function setProfileSnapshotSource(next: Source | null) {
  source = next;
  seenRevision = next?.revision() ?? 0;
  clearInterval(poll); poll = undefined;
  // Fetched rows arrive outside any render; one number compared each second
  // is how portraits already on screen hear about them.
  if (next && typeof setInterval === "function") poll = setInterval(checkProfileSnapshots, 1_000);
}

/** Set once the character art has loaded; drawing earlier would leave parts out. */
export function setProfileSnapshotRenderer(next: Renderer | null) {
  renderer = next;
  portraits.clear();
  changed();
}

/** Redraws watched portraits if a fetched look changed since last asked. */
export function checkProfileSnapshots() {
  const revision = source?.revision() ?? 0;
  if (revision === seenRevision) return;
  seenRevision = revision;
  changed();
}

/**
 * The drawn snapshot for a player, or undefined while their look is unknown or
 * the art is loading (the caller draws the default silhouette meanwhile). Each
 * look is drawn once and kept; players who look alike share it.
 */
export function profileSnapshotPortrait(identity: string | undefined) {
  if (!identity || !source || !renderer) return undefined;
  const look = source.look(identity);
  if (!look) return undefined;
  const key = profileSnapshotKey(look);
  const cached = portraits.get(key);
  if (cached) { portraits.delete(key); portraits.set(key, cached); return cached; }
  const drawn = renderer(look);
  if (!drawn) return undefined;
  portraits.set(key, drawn);
  while (portraits.size > PROFILE_SNAPSHOT_PORTRAIT_LIMIT) portraits.delete(portraits.keys().next().value!);
  return drawn;
}

/** Repaint this element when looks or the art change; forget it once it leaves the page. */
export function watchProfileSnapshotElement(element: HTMLElement, repaint: (() => void) | null) {
  if (!repaint) { watched.delete(element); return; }
  watched.set(element, repaint);
  if (watched.size > WATCH_SWEEP_AT) for (const key of [...watched.keys()]) if (key !== element && !key.isConnected) watched.delete(key);
}

export function onProfileSnapshotsChanged(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tests only: back to a fresh page. */
export function resetProfileSnapshotPortraits() {
  setProfileSnapshotSource(null);
  renderer = null;
  portraits.clear(); watched.clear(); listeners.clear();
}
