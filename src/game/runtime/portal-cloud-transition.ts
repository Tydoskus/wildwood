export const PORTAL_CLOUD_SOURCE = "assets/wildwood/portal-cloud-v1.png";

const CLOUD_ROWS = [
  { y: "-4%", scale: ".9", entryY: -22, rotation: -7, coverDelay: 0, revealDelay: 100 },
  { y: "7%", scale: "1.03", entryY: -19, rotation: -6, coverDelay: 25, revealDelay: 85 },
  { y: "18%", scale: ".94", entryY: -16, rotation: -5, coverDelay: 55, revealDelay: 65 },
  { y: "29%", scale: "1.07", entryY: -13, rotation: -4, coverDelay: 95, revealDelay: 45 },
  { y: "40%", scale: ".96", entryY: -10, rotation: -3, coverDelay: 155, revealDelay: 20 },
  { y: "50%", scale: "1.1", entryY: -8, rotation: -2, coverDelay: 220, revealDelay: 0 },
  { y: "60%", scale: ".97", entryY: 10, rotation: 3, coverDelay: 155, revealDelay: 20 },
  { y: "71%", scale: "1.05", entryY: 13, rotation: 4, coverDelay: 95, revealDelay: 45 },
  { y: "82%", scale: ".92", entryY: 16, rotation: 5, coverDelay: 55, revealDelay: 65 },
  { y: "93%", scale: "1.02", entryY: 19, rotation: 6, coverDelay: 25, revealDelay: 85 },
  { y: "104%", scale: ".9", entryY: 22, rotation: 7, coverDelay: 0, revealDelay: 100 },
] as const;

const COVER_DURATION_MS = 970;
const REVEAL_DURATION_MS = 880;

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
        cloud.style.setProperty("--cloud-entry-y", `${side === "left" ? row.entryY : -row.entryY}vh`);
        cloud.style.setProperty("--cloud-entry-rotation", `${side === "left" ? row.rotation : -row.rotation}deg`);
        cloud.style.setProperty("--cloud-rest-rotation", `${side === "left" ? row.rotation * .12 : row.rotation * -.12}deg`);
        cloud.style.setProperty("--cloud-cover-delay", `${row.coverDelay}ms`);
        cloud.style.setProperty("--cloud-reveal-delay", `${row.revealDelay}ms`);
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
