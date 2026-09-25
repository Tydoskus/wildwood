/**
 * Builds an element's new children off-page and swaps them in only when the
 * markup differs. Rebuilding identical <img> children on every refresh made
 * iOS decode them again and blink them; unchanged ones are now left alone.
 * Returns whether anything was replaced.
 */
export function replaceChildrenIfChanged(element: HTMLElement, build: (target: HTMLElement) => void) {
  const scratch = element.ownerDocument.createElement(element.tagName);
  build(scratch);
  if (scratch.innerHTML === element.innerHTML) return false;
  element.replaceChildren(...scratch.childNodes);
  return true;
}
