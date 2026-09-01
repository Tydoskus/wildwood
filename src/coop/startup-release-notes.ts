import { renderUpdateNotice } from "../ui/overlays";

type StartupReleaseNote = {
  version: string;
  notes: readonly string[];
  date?: string;
};

export type StartupReleaseNotesElements = {
  overlay: HTMLElement;
  items: HTMLElement;
  toggle: HTMLElement;
};

type StartupReleaseNotesHooks = {
  releases: () => readonly StartupReleaseNote[];
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
    items: requireElement("updateNoticeItems"),
    toggle: requireElement("signinVersion"),
  };
}

/** Owns release notes while the deferred game bundle has not loaded yet. */
export function createStartupReleaseNotes(
  hooks: StartupReleaseNotesHooks,
  elements = startupReleaseNotesElements(document),
) {
  const render = hooks.render ?? renderUpdateNotice;
  let hasNotes = false;

  function setOpen(open: boolean) {
    const expanded = open && hasNotes;
    elements.overlay.hidden = !expanded;
    elements.toggle.setAttribute("aria-expanded", String(expanded));
  }

  function hide() {
    setOpen(false);
  }

  function show() {
    const releases = hooks.releases();
    hasNotes = releases.length > 0;
    if (!hasNotes) {
      hide();
      return;
    }
    render({ items: elements.items }, releases);
  }

  function toggle() {
    if (!hasNotes) show();
    setOpen(elements.overlay.hidden);
  }

  function dispose() {
    elements.toggle.removeEventListener("click", toggle);
  }

  setOpen(false);
  elements.toggle.addEventListener("click", toggle);
  return { dispose, hide, show };
}
