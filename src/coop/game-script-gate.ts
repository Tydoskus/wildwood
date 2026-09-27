/**
 * Who may claim the game bridge, the only way to report a kill: the game
 * bundle itself, while it runs. The coop bundle inserts that script
 * (loadDeferredGameBundle) and remembers the element; the game claims the
 * bridge synchronously as it starts, when the browser's document.currentScript
 * is that element. A console call, or a script some page code inserted, runs
 * as something else. The getter is captured when this bundle loads, so
 * redefining document.currentScript afterwards cannot answer for the game.
 *
 * This stops the direct console call. Someone who reads the bundle can still
 * hook a builtin game.js calls before it claims and take the bridge from
 * inside it; what that buys is bounded on the server, where a report that
 * claims no game time is paid only from the combat bank.
 */
type CurrentScriptGetter = (this: Document) => HTMLOrSVGScriptElement | null;

const currentScriptGetter: CurrentScriptGetter | undefined = typeof Document === "undefined" ? undefined
  : Object.getOwnPropertyDescriptor(Document.prototype, "currentScript")?.get as CurrentScriptGetter | undefined;

let gameScript: HTMLScriptElement | null = null;

/** Called by the loader with the element it inserted for game.js. */
export function markGameScript(element: HTMLScriptElement) {
  gameScript ??= element;
}

/** True only while game.js, as inserted by the loader, is the script running. */
export function runningAsGameScript(documentValue: Document | undefined = typeof document === "undefined" ? undefined : document) {
  if (!gameScript || !documentValue || !currentScriptGetter) return false;
  try { return currentScriptGetter.call(documentValue) === gameScript; }
  catch { return false; }
}
