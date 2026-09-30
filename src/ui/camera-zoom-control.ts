import { CAMERA_ZOOM_LEVELS, canZoomCamera, cameraZoomPreference, stepCameraZoom } from "../game/runtime/camera-zoom-preference";

/**
 * The − 100% + row under the minimap. The mouse wheel over the game zooms
 * too, one step a notch, except with Ctrl held (the browser's own zoom).
 */
export function installCameraZoomControl(doc: Document, canvas: HTMLElement | null) {
  const meta = doc.querySelector(".minimap-meta");
  if (!meta || doc.getElementById("cameraZoomControl")) return;
  const row = doc.createElement("div");
  row.id = "cameraZoomControl"; row.className = "camera-zoom-control";
  row.innerHTML = `<button type="button" class="camera-zoom-button" data-zoom="-1" aria-label="Zoom out">−</button>`
    + `<span class="camera-zoom-level" aria-live="polite"></span>`
    + `<button type="button" class="camera-zoom-button" data-zoom="1" aria-label="Zoom in">+</button>`;
  meta.append(row);
  const level = row.querySelector<HTMLElement>(".camera-zoom-level")!;
  const out = row.querySelector<HTMLButtonElement>('[data-zoom="-1"]')!;
  const inward = row.querySelector<HTMLButtonElement>('[data-zoom="1"]')!;
  const render = () => {
    level.textContent = `${Math.round(cameraZoomPreference() * 100)}%`;
    out.disabled = !canZoomCamera(-1);
    inward.disabled = !canZoomCamera(1);
  };
  const step = (direction: 1 | -1) => { stepCameraZoom(direction); render(); };
  out.addEventListener("click", () => step(-1));
  inward.addEventListener("click", () => step(1));
  // A trackpad sends a burst of small wheel events for one flick: one step per burst.
  let lastWheelAt = 0;
  canvas?.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.deltaY === 0) return;
    event.preventDefault();
    if (event.timeStamp - lastWheelAt < 150) return;
    lastWheelAt = event.timeStamp;
    step(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  render();
  return { levels: CAMERA_ZOOM_LEVELS.length, render };
}
