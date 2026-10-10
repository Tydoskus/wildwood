import { PROFILE_ICON_BACKGROUND_COLORS, PROFILE_ICON_GRID, PROFILE_ICON_SHEETS, profileIconLocation } from "../../shared/profile-icons";
import { OBJECT_ATLAS_SIZE, containedIconRect, objectIconCrop } from "./profile-icon-crops";
import { onProfileSnapshotsChanged, profileSnapshotPortrait, watchProfileSnapshotElement, type ProfileSnapshotPortrait } from "./profile-snapshot-portraits";
import { keepCanvasMoving } from "./moving-canvases";

const ZOOM = 1.03;
const POSITION_STEP = ZOOM / (PROFILE_ICON_GRID * ZOOM - 1) * 100;
const POSITION_START = (ZOOM - 1) / 2 / (PROFILE_ICON_GRID * ZOOM - 1) * 100;

const appliedSnapshots = new WeakMap<HTMLElement, string>();

/** Draws a moving snapshot into its canvas at the canvas's own size on screen. */
function paintMovingPortrait(canvas: HTMLCanvasElement, portrait: ProfileSnapshotPortrait) {
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio)), height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  portrait.paint?.(context, width, height);
}

/**
 * A snapshot wearing a galaxy piece is drawn live into a canvas laid over the
 * portrait, since a picture drawn once would freeze the finish. The element's
 * own backdrop colour still shows through it.
 */
function showMovingPortrait(element: HTMLElement, portrait: ProfileSnapshotPortrait) {
  let canvas = element.querySelector<HTMLCanvasElement>(":scope > canvas.profile-icon-live");
  if (!canvas) {
    canvas = element.ownerDocument.createElement("canvas");
    canvas.className = "profile-icon-live";
    canvas.setAttribute("aria-hidden", "true");
    element.prepend(canvas);
    const view = element.ownerDocument.defaultView;
    if (view?.getComputedStyle?.(element).position === "static") element.style.position = "relative";
  }
  element.style.backgroundImage = "none";
  const live = canvas;
  if (appliedSnapshots.get(element) !== portrait.key) {
    appliedSnapshots.set(element, portrait.key);
    paintMovingPortrait(live, portrait);
  }
  keepCanvasMoving(live, () => paintMovingPortrait(live, portrait));
}

function removeMovingPortrait(element: HTMLElement) {
  const canvas = element.querySelector<HTMLCanvasElement>(":scope > canvas.profile-icon-live");
  if (!canvas) return;
  keepCanvasMoving(canvas, null);
  canvas.remove();
}

/**
 * Paints a saved profile icon (picture and backdrop) into any portrait element.
 * The backdrop is set here, inline, because the sheets are transparent and the
 * portraits' own stylesheets (chat, guild, shop, leaderboard) differ.
 *
 * A snapshot picture needs whose it is: `identity`. Until that player's look
 * has arrived (or without an identity) it draws the default silhouette, and
 * the element repaints itself when the look comes in.
 */
export function applyProfileIcon(element: HTMLElement, iconIndex: number, identity?: string) {
  const icon = profileIconLocation(iconIndex);
  element.dataset.profileIcon = String(icon.index);
  element.dataset.profileBackground = icon.background;
  element.style.backgroundColor = PROFILE_ICON_BACKGROUND_COLORS[icon.background];
  watchProfileSnapshotElement(element, icon.snapshot && identity ? () => applyProfileIcon(element, iconIndex, identity) : null);
  const portrait = icon.snapshot ? profileSnapshotPortrait(identity) : undefined;
  element.classList.toggle("profile-icon-is-snapshot", Boolean(portrait));
  if (portrait) {
    element.querySelector(":scope > .profile-icon-art")?.remove();
    element.classList.remove("profile-icon-cropped");
    if (portrait.paint) { showMovingPortrait(element, portrait); return; }
    if (element.querySelector(":scope > canvas.profile-icon-live")) { removeMovingPortrait(element); appliedSnapshots.delete(element); }
    // The HUD repaints its own portrait often; a data URL is only set again when it changed.
    if (appliedSnapshots.get(element) === portrait.key && element.style.backgroundImage !== "none") return;
    appliedSnapshots.set(element, portrait.key);
    Object.assign(element.style, {
      backgroundImage: `url("${portrait.url}")`, backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", backgroundPosition: "50% 50%",
    });
    return;
  }
  appliedSnapshots.delete(element);
  removeMovingPortrait(element);
  const crop = icon.category === "objects" ? objectIconCrop(icon.path, icon.cell) : undefined;
  let art = element.querySelector<HTMLElement>(":scope > .profile-icon-art");
  element.classList.toggle("profile-icon-cropped", Boolean(crop));
  if (crop) {
    // Isolate the source rectangle before fitting it. Merely zooming out a
    // sheet background exposes the adjacent icons around wide objects.
    if (!art) {
      art = element.ownerDocument.createElement("span"); art.className = "profile-icon-art";
      art.setAttribute("aria-hidden", "true"); element.prepend(art);
    }
    const target = containedIconRect(crop);
    Object.assign(art.style, {
      left: `${target.x * 100}%`, top: `${target.y * 100}%`, width: `${target.width * 100}%`, height: `${target.height * 100}%`,
      backgroundImage: `url("${icon.path}")`,
      backgroundSize: `${OBJECT_ATLAS_SIZE / crop.width * 100}% ${OBJECT_ATLAS_SIZE / crop.height * 100}%`,
      backgroundPosition: `${crop.x / (OBJECT_ATLAS_SIZE - crop.width) * 100}% ${crop.y / (OBJECT_ATLAS_SIZE - crop.height) * 100}%`,
    });
    element.style.backgroundImage = "none";
    return;
  }
  art?.remove();
  element.style.backgroundImage = `url("${icon.path}")`;
  element.style.backgroundRepeat = "no-repeat";
  element.style.backgroundSize = `${PROFILE_ICON_GRID * ZOOM * 100}% ${PROFILE_ICON_GRID * ZOOM * 100}%`;
  element.style.backgroundPosition = `${POSITION_START + icon.column * POSITION_STEP}% ${POSITION_START + icon.row * POSITION_STEP}%`;
}

/** Canvas portraits use the same atlas coordinates as DOM portraits. Load each sheet once, on demand. */
/** A snapshot arriving calls `onSheetLoaded` too, so the caller redraws the same way. */
export function createProfileIconCanvasPainter(onSheetLoaded: () => void) {
  const sheets = new Map<number, HTMLImageElement>();
  onProfileSnapshotsChanged(onSheetLoaded);
  const paint = (canvas: HTMLCanvasElement, iconIndex: number, identity?: string) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    const icon = profileIconLocation(iconIndex);
    // The backdrop is painted even before the sheet loads, as the DOM portraits' is.
    context.fillStyle = PROFILE_ICON_BACKGROUND_COLORS[icon.background];
    context.fillRect(0, 0, canvas.width, canvas.height);
    const portrait = icon.snapshot ? profileSnapshotPortrait(identity) : undefined;
    // A galaxy piece keeps its canvas moving; anything else is drawn once.
    keepCanvasMoving(canvas, portrait?.paint ? () => paint(canvas, iconIndex, identity) : null);
    if (portrait) {
      context.imageSmoothingEnabled = true;
      if (portrait.paint) portrait.paint(context, canvas.width, canvas.height);
      else context.drawImage(portrait.canvas, 0, 0, canvas.width, canvas.height);
      return;
    }
    let sheet = sheets.get(icon.sheetIndex);
    if (!sheet) {
      sheet = new Image(); sheets.set(icon.sheetIndex, sheet);
      sheet.addEventListener("load", onSheetLoaded);
      sheet.src = PROFILE_ICON_SHEETS[icon.sheetIndex].path;
    }
    if (!sheet.complete || !sheet.naturalWidth) return;
    const crop = icon.category === "objects" ? objectIconCrop(icon.path, icon.cell) : undefined;
    if (crop) {
      const target = containedIconRect(crop);
      const sx = sheet.naturalWidth / OBJECT_ATLAS_SIZE, sy = sheet.naturalHeight / OBJECT_ATLAS_SIZE;
      context.imageSmoothingEnabled = true;
      context.drawImage(sheet, crop.x * sx, crop.y * sy, crop.width * sx, crop.height * sy,
        target.x * canvas.width, target.y * canvas.height, target.width * canvas.width, target.height * canvas.height);
      return;
    }
    const width = sheet.naturalWidth / PROFILE_ICON_GRID, height = sheet.naturalHeight / PROFILE_ICON_GRID;
    const insetX = width * (1 - 1 / ZOOM) / 2, insetY = height * (1 - 1 / ZOOM) / 2;
    context.imageSmoothingEnabled = true;
    context.drawImage(sheet, icon.column * width + insetX, icon.row * height + insetY, width / ZOOM, height / ZOOM, 0, 0, canvas.width, canvas.height);
  };
  return paint;
}
