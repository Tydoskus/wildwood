/** Marks the body while any guild overlay shows (guild.css lifts the profile over it); a :has() rule restyled on every DOM change. */
export function syncGuildOverlayOpen(doc: Document) {
  doc.body.classList.toggle("guild-overlay-open", doc.querySelector(".guild-overlay:not([hidden])") !== null);
}
