export const CHAT_INPUT_MAX_HEIGHT = 54;

type SizedInput = Pick<HTMLTextAreaElement, "value" | "scrollHeight" | "clientHeight" | "clientWidth"> & {
  style: Pick<CSSStyleDeclaration, "height">;
};

/** Grows the composer with its text. Measuring the natural height needs
 * `height: auto`, which lays the page out once to read and again to paint,
 * on every typed frame. Typed text is almost always appended, and appending
 * can only keep or grow the natural height: when the box it was sized for
 * still fits (or is already at its cap), one read settles it and the
 * frame's own layout has nothing left to do. */
export function createChatInputSizer(input: SizedInput) {
  let sizedValue: string | null = null, sizedHeight = "", sizedWidth = -1;
  return function size() {
    const value = input.value;
    if (sizedValue !== null && value.startsWith(sizedValue) && input.style.height === sizedHeight
      && input.clientWidth === sizedWidth
      && (sizedHeight === `${CHAT_INPUT_MAX_HEIGHT}px` || input.scrollHeight <= input.clientHeight)) {
      sizedValue = value;
      return;
    }
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, CHAT_INPUT_MAX_HEIGHT)}px`;
    sizedValue = value; sizedHeight = input.style.height; sizedWidth = input.clientWidth;
  };
}
