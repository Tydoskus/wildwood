import { PROFILE_ICON_GRID, PROFILE_ICON_SHEETS, profileIconLocation } from "../../shared/profile-icons";
import { OBJECT_ATLAS_SIZE, containedIconRect, objectIconCrop } from "./profile-icon-crops";

const ZOOM = 1.03;
const POSITION_STEP = ZOOM / (PROFILE_ICON_GRID * ZOOM - 1) * 100;
const POSITION_START = (ZOOM - 1) / 2 / (PROFILE_ICON_GRID * ZOOM - 1) * 100;

export function applyProfileIcon(element: HTMLElement, iconIndex: number) {
  const icon = profileIconLocation(iconIndex);
  element.dataset.profileIcon = String(icon.index);
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
export function createProfileIconCanvasPainter(onSheetLoaded: () => void) {
  const sheets = new Map<number, HTMLImageElement>();
  return (canvas: HTMLCanvasElement, iconIndex: number) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const icon = profileIconLocation(iconIndex);
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
}
