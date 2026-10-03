/**
 * Firefox cannot draw -webkit-text-stroke on the GPU. Every outlined label is
 * rasterized on the CPU instead, and redrawn, with the icons beside it, each
 * time anything near it changes: a player profile showed the HUD and toolbar
 * repainted that way about seventeen times a second. With this class set,
 * game.css draws the outline as a ring of text shadows, which the GPU draws.
 *
 * Firefox on iOS is WebKit underneath and reports "FxiOS", so it keeps the stroke.
 */
export const TEXT_OUTLINE_SHADOW_CLASS = "text-outline-shadow";

export function strokeIsDrawnOnCpu(userAgent: string) {
  return /\bFirefox\/\d/.test(userAgent);
}

export function applyTextOutlineMode(doc: Document, userAgent: string) {
  doc.documentElement.classList.toggle(TEXT_OUTLINE_SHADOW_CLASS, strokeIsDrawnOnCpu(userAgent));
}
