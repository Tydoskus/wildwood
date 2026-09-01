type StartupArtworkRevealOptions = {
  root: HTMLElement;
  source: string;
  image: HTMLImageElement;
  readyClass?: string;
};

/** Reveals the full sign-in artwork only after its pixels are loaded and decoded. */
export function createStartupArtworkReveal({
  root,
  source,
  image,
  readyClass = "signin-artwork-ready",
}: StartupArtworkRevealOptions) {
  let disposed = false;
  let decodeStarted = false;

  function revealAfterDecode() {
    if (disposed || decodeStarted) return;
    decodeStarted = true;
    let decoded: Promise<void>;
    try {
      decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
    } catch {
      decoded = Promise.resolve();
    }
    void decoded.catch(() => undefined).then(() => {
      if (!disposed) root.classList.add(readyClass);
    });
  }

  image.decoding = "async";
  image.addEventListener("load", revealAfterDecode, { once: true });
  image.src = source;
  if (image.complete && image.naturalWidth > 0) revealAfterDecode();

  return {
    dispose() {
      disposed = true;
      image.removeEventListener("load", revealAfterDecode);
    },
  };
}

export function startStartupArtworkReveal(documentValue = document) {
  const preload = documentValue.querySelector<HTMLLinkElement>("link[data-signin-artwork]");
  if (!preload?.href) return { dispose() {} };
  return createStartupArtworkReveal({
    root: documentValue.documentElement,
    source: preload.href,
    image: new Image(),
  });
}
