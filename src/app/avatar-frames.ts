import { avatarFrameAsset, type AvatarFrameState } from "../../shared/avatar-frames";
import { createAvatarFrameGlow } from "./avatar-frame-glow";
import { preloadImages } from "./image-preload";

type Entry = AvatarFrameState & { fetchedAt: number };
const cache = new Map<string, Entry>();
const queued = new Set<string>();
const inFlight = new Set<string>();
let fetchFrames: ((identities: string[]) => Promise<AvatarFrameState[]>) | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let maintenance: ReturnType<typeof setInterval> | undefined;
let running = false, generation = 0;
let portraitProvider: typeof applyAvatarFrame | undefined;
/** The game bundle delegates to the network bundle, which owns membership state. */
export function bindAvatarFrames(provider: typeof applyAvatarFrame) { portraitProvider = provider; }
const trimCache = () => { while (cache.size > 2048) cache.delete(cache.keys().next().value!); };

function paint(element: HTMLElement) {
  const identity = element.dataset.avatarOwner ?? "";
  const state = cache.get(identity);
  const frame = state && state.validUntilMs > Date.now() ? state.frame : "none";
  if (element.dataset.avatarFrame === frame) return;
  element.dataset.avatarFrame = frame;
  let overlay = element.querySelector<HTMLImageElement>(":scope > .avatar-frame-art");
  let glow = element.querySelector<HTMLElement>(":scope > .avatar-frame-glow");
  if (frame === "none") { overlay?.remove(); glow?.remove(); return; }
  const asset = avatarFrameAsset(frame);
  void preloadImages([asset]);
  if (!overlay) {
    overlay = document.createElement("img"); overlay.className = "avatar-frame-art";
    overlay.alt = ""; overlay.setAttribute("aria-hidden", "true");
    element.append(overlay);
  }
  // Each tier has its own artwork, so a silver-to-gold change swaps the image;
  // setting src only on create would leave the old tier's frame painted.
  if (overlay.getAttribute("src") !== asset) overlay.src = asset;
  if (!glow) {
    glow = createAvatarFrameGlow(); element.append(glow);
  }
}

function mounted() { return typeof document === "undefined" ? [] : [...document.querySelectorAll<HTMLElement>("[data-avatar-owner]")]; }
function request(identity: string) {
  if (!/^[a-f0-9]{64}$/.test(identity) || inFlight.has(identity) || Date.now() - (cache.get(identity)?.fetchedAt ?? 0) < 5 * 60_000) return;
  queued.add(identity);
  while (queued.size > 2048) queued.delete(queued.values().next().value!);
  if (!running && !timer && fetchFrames) timer = setTimeout(() => { timer = undefined; void flush(); }, 40);
}
async function flush() {
  if (!fetchFrames || running || !queued.size) return;
  running = true;
  const batch = [...queued].slice(0, 50), version = generation;
  batch.forEach(id => { queued.delete(id); inFlight.add(id); });
  try {
    const rows = await fetchFrames(batch);
    if (version !== generation) return;
    for (const row of rows) if (batch.includes(row.identity)) cache.set(row.identity, { ...row, fetchedAt: Date.now() });
    trimCache();
    mounted().filter(el => batch.includes(el.dataset.avatarOwner!)).forEach(paint);
  } catch {
    if (version === generation) for (const identity of batch) {
      const previous = cache.get(identity);
      // Retry after 30 seconds, retaining only an unexpired verified appearance.
      cache.set(identity, { identity, tier: "none", frame: "none", validUntilMs: 0, ...previous, fetchedAt: Date.now() - 270_000 });
    }
    trimCache();
  } finally {
    if (version === generation) { batch.forEach(id => inFlight.delete(id)); running = false; if (queued.size) timer = setTimeout(() => { timer = undefined; void flush(); }, 40); }
  }
}

export function configureAvatarFrames(fetcher: (identities: string[]) => Promise<AvatarFrameState[]>) { fetchFrames = fetcher; }
export function clearAvatarFrames() {
  generation++; running = false; clearTimeout(timer); timer = undefined; queued.clear(); inFlight.clear(); cache.clear(); mounted().forEach(paint);
}
export function updateAvatarFrame(state: AvatarFrameState) {
  cache.set(state.identity, { ...state, fetchedAt: Date.now() });
  trimCache();
  mounted().filter(el => el.dataset.avatarOwner === state.identity).forEach(paint);
}
/** Overlay artwork never occupies layout space or intercepts portrait clicks. */
export function applyAvatarFrame(element: HTMLElement, identity: string | undefined) {
  if (portraitProvider) { portraitProvider(element, identity); return; }
  if (element.dataset.avatarOwner !== (identity ?? "")) element.dataset.avatarOwner = identity ?? "";
  element.classList.add("avatar-frame-portrait"); paint(element); request(identity ?? "");
  if (!maintenance && typeof window !== "undefined") maintenance = setInterval(() => {
    for (const el of mounted()) { paint(el); request(el.dataset.avatarOwner ?? ""); }
  }, 30_000);
}
