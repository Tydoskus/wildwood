type ReleaseNote = { version: string; notes: readonly string[]; date?: string };

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
    const heading = document.createElement("div");
    heading.className = "update-release-heading";
    const releaseVersion = document.createElement("strong");
    releaseVersion.textContent = `v${release.version}`;
    heading.appendChild(releaseVersion);
    if (release.date) {
      const releaseDate = document.createElement("time");
      releaseDate.textContent = release.date;
      heading.appendChild(releaseDate);
    }
    const notes = document.createElement("ul");
    for (const note of release.notes) {
      const item = document.createElement("li");
      item.textContent = note;
      notes.appendChild(item);
    }
    group.append(heading, notes);
    elements.items.appendChild(group);
  }
  elements.overlay.hidden = false;
}
