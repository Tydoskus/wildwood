/**
 * Builds an element's new children off-page and swaps them in only when the
 * markup differs: rebuilding identical <img> children makes iOS decode them
 * again and blink them, so unchanged ones are left alone.
 * Returns whether anything was replaced.
 */
export function replaceChildrenIfChanged(element: HTMLElement, build: (target: HTMLElement) => void) {
  const scratch = element.ownerDocument.createElement(element.tagName);
  build(scratch);
  if (scratch.innerHTML === element.innerHTML) return false;
  element.replaceChildren(...scratch.childNodes);
  return true;
}
