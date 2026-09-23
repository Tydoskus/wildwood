/**
 * The badge is built here rather than in the startup HTML, which has a byte
 * budget covering first paint. Mirrors the home teleport cooldown element.
 */
export function createInventoryNotice(button: HTMLElement) {
  const dot = button.ownerDocument.createElement("span");
  dot.className = "inventory-notice";
  dot.hidden = true;
  dot.setAttribute("aria-hidden", "true");
  button.append(dot);
  const baseLabel = button.getAttribute("aria-label") ?? "Open inventory";
  let shown = false;
  return {
    set(visible: boolean) {
      if (visible === shown) return;
      shown = visible;
      dot.hidden = !visible;
      button.setAttribute("aria-label", visible ? `${baseLabel} — slot upgrade finished` : baseLabel);
    },
  };
}
