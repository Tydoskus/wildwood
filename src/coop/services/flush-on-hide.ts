/**
 * Kill rewards are only real once the server has the report, and until then
 * they live in one browser tab. A hidden tab stops driving the report timer
 * (browsers throttle it) and may never come back, so send what is already
 * earned while the page is still alive to do it. `pagehide` is best effort:
 * the socket may not get the frame out before the page goes.
 */
export function bindProgressFlushOnHide(
  doc: Pick<Document, "addEventListener"> & { readonly hidden: boolean },
  win: Pick<Window, "addEventListener">,
  flush: (force: true) => void,
) {
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) flush(true); });
  win.addEventListener("pagehide", () => flush(true));
}
