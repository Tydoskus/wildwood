type ReleaseNote = { version: string; notes: readonly string[] };

export function renderUpdateNotice(
  elements: { overlay: HTMLElement; title: HTMLElement; items: HTMLElement },
  version: string,
  releases: readonly ReleaseNote[],
) {
  elements.title.textContent = `v${version}`;
  elements.items.replaceChildren();
  for (const release of releases) {
    const group = document.createElement("li");
    group.className = "update-release";
    const releaseVersion = document.createElement("strong");
    releaseVersion.textContent = `v${release.version}`;
    const notes = document.createElement("ul");
    for (const note of release.notes) {
      const item = document.createElement("li");
      item.textContent = note;
      notes.appendChild(item);
    }
    group.append(releaseVersion, notes);
    elements.items.appendChild(group);
  }
  elements.overlay.hidden = false;
}
