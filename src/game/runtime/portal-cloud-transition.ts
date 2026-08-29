export const PORTAL_CLOUD_SOURCE = "assets/wildwood/portal-cloud-v1.png";

const CLOUD_ROWS = [
  { y: "0%", scale: ".9", delay: "0ms" },
  { y: "17%", scale: "1.04", delay: "35ms" },
  { y: "34%", scale: ".94", delay: "70ms" },
  { y: "51%", scale: "1.06", delay: "45ms" },
  { y: "68%", scale: ".92", delay: "75ms" },
  { y: "85%", scale: "1.02", delay: "30ms" },
  { y: "102%", scale: ".9", delay: "0ms" },
] as const;

const COVER_DURATION_MS = 580;
const REVEAL_DURATION_MS = 660;

type PortalCloudTransition = {
  cover: () => Promise<void>;
  reveal: () => Promise<void>;
  cancel: () => void;
};

/** Repeats one mobile-friendly cloud sprite into a full-screen portal curtain. */
export function createPortalCloudTransition(
  root: HTMLElement,
  options: {
    document?: Document;
    wait?: (durationMs: number) => Promise<void>;
    nextFrame?: () => Promise<void>;
    reduceMotion?: boolean;
  } = {},
): PortalCloudTransition {
  const documentValue = options.document ?? document;
  const wait = options.wait ?? ((durationMs) => new Promise<void>((resolve) => window.setTimeout(resolve, durationMs)));
  const nextFrame = options.nextFrame ?? (() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const reduceMotion = options.reduceMotion ?? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let generation = 0;

  if (!root.childElementCount) {
    const fragment = documentValue.createDocumentFragment();
    for (const side of ["left", "right"] as const) {
      CLOUD_ROWS.forEach((row, index) => {
        const cloud = documentValue.createElement("img");
        cloud.className = `portal-transition-cloud is-${side}`;
        cloud.src = PORTAL_CLOUD_SOURCE;
        cloud.alt = "";
        cloud.draggable = false;
        cloud.decoding = "async";
        cloud.style.setProperty("--cloud-y", row.y);
        cloud.style.setProperty("--cloud-scale", row.scale);
        cloud.style.setProperty("--cloud-delay", row.delay);
        cloud.style.setProperty("--cloud-layer", String(index));
        fragment.append(cloud);
      });
    }
    root.append(fragment);
  }

  async function cover() {
    const activeGeneration = ++generation;
    root.classList.remove("is-covered", "is-revealing");
    root.hidden = false;
    void root.offsetWidth;
    await nextFrame();
    if (activeGeneration !== generation) return;
    root.classList.add("is-covered");
    await wait(reduceMotion ? 0 : COVER_DURATION_MS);
  }

  async function reveal() {
    const activeGeneration = ++generation;
    root.classList.add("is-revealing");
    await nextFrame();
    if (activeGeneration !== generation) return;
    root.classList.remove("is-covered");
    await wait(reduceMotion ? 0 : REVEAL_DURATION_MS);
    if (activeGeneration !== generation) return;
    root.hidden = true;
    root.classList.remove("is-revealing");
  }

  function cancel() {
    generation += 1;
    root.hidden = true;
    root.classList.remove("is-covered", "is-revealing");
  }

  return { cover, reveal, cancel };
}
