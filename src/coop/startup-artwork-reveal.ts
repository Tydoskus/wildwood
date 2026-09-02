type StartupArtworkRevealOptions = {
  root: HTMLElement;
  source: string;
  image: HTMLImageElement;
  readyClass?: string;
  waitClass?: string;
  deferred?: boolean;
};

/** Reveals the full sign-in artwork only after its pixels are loaded and decoded. */
export function createStartupArtworkReveal({
  root,
  source,
  image,
  readyClass = "signin-artwork-ready",
  waitClass = "signin-auth-return",
  deferred = false,
}: StartupArtworkRevealOptions) {
  let disposed = false;
  let started = false;
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

  function start() {
    if (disposed || started) return;
    started = true;
    image.decoding = "async";
    image.addEventListener("load", revealAfterDecode, { once: true });
    image.src = source;
    root.classList.remove(waitClass);
    if (image.complete && image.naturalWidth > 0) revealAfterDecode();
  }

  if (!deferred) start();

  return {
    start,
    dispose() {
      disposed = true;
      image.removeEventListener("load", revealAfterDecode);
    },
  };
}

export function startStartupArtworkReveal(documentValue = document) {
  const descriptor = documentValue.querySelector<HTMLMetaElement>("meta[data-signin-artwork]");
  const source = descriptor?.content;
  if (!source) return { start() {}, dispose() {} };
  const root = documentValue.documentElement;
  return createStartupArtworkReveal({
    root,
    source: new URL(source, documentValue.baseURI).href,
    image: new Image(),
    deferred: root.classList.contains("signin-auth-return"),
  });
}
