import { renderUpdateNotice } from "../ui/overlays";

type StartupReleaseNote = {
  version: string;
  notes: readonly string[];
  date?: string;
};

export type StartupReleaseNotesElements = {
  overlay: HTMLElement;
  title: HTMLElement;
  items: HTMLElement;
  close: HTMLElement;
};

type StartupReleaseNotesHooks = {
  version: string;
  releases: () => readonly StartupReleaseNote[];
  seenVersion: () => string;
  markSeen: () => void;
  render?: typeof renderUpdateNotice;
};

function startupReleaseNotesElements(documentValue: Document): StartupReleaseNotesElements {
  function requireElement(id: string) {
    const element = documentValue.getElementById(id);
    if (!element) throw new Error(`Missing startup release-notes element #${id}`);
    return element;
  }
  return {
    overlay: requireElement("updateNotice"),
    title: requireElement("updateNoticeTitle"),
    items: requireElement("updateNoticeItems"),
    close: requireElement("closeUpdateNoticeBtn"),
  };
}

/** Owns release notes while the deferred game bundle has not loaded yet. */
export function createStartupReleaseNotes(
  hooks: StartupReleaseNotesHooks,
  elements = startupReleaseNotesElements(document),
) {
  const render = hooks.render ?? renderUpdateNotice;

  function hide() {
    elements.overlay.hidden = true;
  }

  function show() {
    if (hooks.seenVersion() === hooks.version) {
      hide();
      return;
    }
    const releases = hooks.releases();
    if (!releases.length) {
      hide();
      return;
    }
    render(
      { overlay: elements.overlay, title: elements.title, items: elements.items },
      hooks.version,
      releases,
    );
  }

  function close() {
    hide();
    hooks.markSeen();
  }

  function dispose() {
    elements.close.removeEventListener("click", close);
  }

  elements.close.addEventListener("click", close);
  return { dispose, hide, show };
}
