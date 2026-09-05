const WORLD = { width: 4800, height: 4800 };
const LIVE_MAP_IDS = new Set([
  "tutorial_forest", "beginner_desert", "intermediate_snowlands", "advanced_lava_wastes",
  "infernal_depths", "water_reach", "samurai_garden", "cloudspire", "moonfen",
]);
const SCALABLE_DECOR = new Set([
  "tree", "cactus", "rock", "snowPine", "upgradeBench", "lavaPool", "lavaRock",
  "charredTree", "coral", "shell", "cloud", "skyShard", "gear", "pumpkin", "glowMushroom", "lilyPad",
]);
const VARIANT_DECOR = new Set([
  "tree", "grass", "petal", "cherryPetal", "cactus", "rock", "desertGrass", "snowTuft",
  "lavaPool", "lavaRock", "charredTree", "coral", "shell", "cloud", "skyShard", "gear", "pumpkin",
  "glowMushroom", "lilyPad",
]);
const COLORABLE_DECOR = new Set([
  "grass", "petal", "cherryPetal", "cactus", "rock", "desertGrass", "snowTuft",
  "coral", "shell", "cloud", "skyShard", "gear", "pumpkin", "glowMushroom", "lilyPad", "tree",
]);
const ADD_ITEMS = [
  { kind: "path", label: "Path", icon: "▭", wide: true },
  { kind: "camp", label: "Enemy camp", icon: "◎", wide: true },
  { kind: "portal", label: "Portal", icon: "⌂", wide: true },
  { kind: "decor", type: "tree", label: "Tree", icon: "♣" },
  { kind: "decor", type: "grass", label: "Grass", icon: "⌇" },
  { kind: "decor", type: "petal", label: "Petal", icon: "✣" },
  { kind: "decor", type: "cherryPetal", label: "Cherry petal", icon: "✿" },
  { kind: "decor", type: "cactus", label: "Cactus", icon: "Ψ" },
  { kind: "decor", type: "rock", label: "Rock", icon: "◆" },
  { kind: "decor", type: "desertGrass", label: "Desert grass", icon: "⌇" },
  { kind: "decor", type: "snowPine", label: "Snow pine", icon: "▲" },
  { kind: "decor", type: "snowTuft", label: "Snow tuft", icon: "✦" },
  { kind: "decor", type: "upgradeBench", label: "Upgrade bench", icon: "▰" },
  { kind: "decor", type: "lavaPool", label: "Lava pool", icon: "⬭" },
  { kind: "decor", type: "lavaRock", label: "Lava rock", icon: "◈" },
  { kind: "decor", type: "charredTree", label: "Charred tree", icon: "Y" },
  { kind: "decor", type: "coral", label: "Coral", icon: "Ψ" },
  { kind: "decor", type: "shell", label: "Shell", icon: "◒" },
  { kind: "decor", type: "cloud", label: "Cloud", icon: "☁" },
  { kind: "decor", type: "skyShard", label: "Sky shard", icon: "♦" },
  { kind: "decor", type: "gear", label: "Gear", icon: "⚙" },
  { kind: "decor", type: "pumpkin", label: "Pumpkin", icon: "●" },
  { kind: "decor", type: "glowMushroom", label: "Glow mushroom", icon: "♠" },
  { kind: "decor", type: "lilyPad", label: "Lily pad", icon: "●" },
];
const LABELS = Object.fromEntries(ADD_ITEMS.filter((item) => item.type).map((item) => [item.type, item.label]));

const elements = {
  canvas: document.querySelector("#map-canvas"),
  stage: document.querySelector("#stage"),
  mapSelect: document.querySelector("#map-select"),
  saveState: document.querySelector("#save-state"),
  saveButton: document.querySelector("#save-map"),
  newMap: document.querySelector("#new-map"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomLabel: document.querySelector("#zoom-label"),
  assetSearch: document.querySelector("#asset-search"),
  assetList: document.querySelector("#asset-list"),
  inspector: document.querySelector("#inspector"),
  coordinates: document.querySelector("#coordinates"),
  placementHint: document.querySelector("#placement-hint"),
  decorCount: document.querySelector("#decor-count"),
  pathCount: document.querySelector("#path-count"),
  campCount: document.querySelector("#camp-count"),
  showDecor: document.querySelector("#show-decor"),
  showPaths: document.querySelector("#show-paths"),
  showCamps: document.querySelector("#show-camps"),
  showMarkers: document.querySelector("#show-markers"),
  showGrid: document.querySelector("#show-grid"),
  snapGrid: document.querySelector("#snap-grid"),
  gridSize: document.querySelector("#grid-size"),
  dialog: document.querySelector("#new-map-dialog"),
  newMapForm: document.querySelector("#new-map-form"),
  newMapName: document.querySelector("#new-map-name"),
  newMapId: document.querySelector("#new-map-id"),
  newMapTemplate: document.querySelector("#new-map-template"),
  closeNewMap: document.querySelector("#close-new-map"),
  cancelNewMap: document.querySelector("#cancel-new-map"),
  importFile: document.querySelector("#import-file"),
  toast: document.querySelector("#toast"),
};
const context = elements.canvas.getContext("2d");

let catalog = null;
let maps = [];
let currentMap = null;
let originalMapId = "";
let baseline = "";
let selection = null;
let clipboard = null;
let history = [];
let future = [];
let dirty = false;
let currentTool = "select";
let addMode = null;
let spaceHeld = false;
let drag = null;
let renderQueued = false;
let toastTimer = 0;
const view = { x: 0, y: 0, zoom: .15 };

function clone(value) {
  return structuredClone(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function canonical(value) {
  return JSON.stringify(value);
}

function titleCase(value) {
  return String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", error);
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, error ? 6500 : 3800);
}

function updateDirtyState() {
  dirty = Boolean(currentMap) && canonical(currentMap) !== baseline;
  elements.saveButton.disabled = !currentMap || !dirty;
  elements.saveState.textContent = dirty ? "Unsaved changes" : currentMap ? "Saved" : "Loading…";
  elements.saveState.classList.toggle("is-dirty", dirty);
  elements.saveState.classList.remove("is-error");
}

function setErrorState(message) {
  elements.saveState.textContent = message;
  elements.saveState.classList.add("is-error");
}

function updateHistoryButtons() {
  elements.undo.disabled = history.length === 0;
  elements.redo.disabled = future.length === 0;
}

function commit(before) {
  history.push(before);
  if (history.length > 100) history.shift();
  future = [];
  updateHistoryButtons();
  updateDirtyState();
  refreshPanels();
  queueRender();
}

function mutate(action) {
  if (!currentMap) return;
  const before = clone(currentMap);
  action();
  commit(before);
}

function undo() {
  if (!history.length || !currentMap) return;
  future.push(clone(currentMap));
  currentMap = history.pop();
  selection = null;
  updateHistoryButtons();
  updateDirtyState();
  refreshPanels();
  queueRender();
}

function redo() {
  if (!future.length || !currentMap) return;
  history.push(clone(currentMap));
  currentMap = future.pop();
  selection = null;
  updateHistoryButtons();
  updateDirtyState();
  refreshPanels();
  queueRender();
}

function mapOptionLabel(map) {
  return map.status === "draft" ? `${map.name} — Draft` : map.name;
}

function refreshMapPicker() {
  const live = maps.filter((map) => map.status === "live");
  const drafts = maps.filter((map) => map.status === "draft");
  const group = (label, list) => list.length
    ? `<optgroup label="${label}">${list.map((map) => `<option value="${escapeHtml(map.id)}">${escapeHtml(mapOptionLabel(map))}</option>`).join("")}</optgroup>`
    : "";
  elements.mapSelect.innerHTML = group("Game maps", live) + group("Draft maps", drafts);
  if (currentMap) elements.mapSelect.value = currentMap.id;
  elements.newMapTemplate.innerHTML = `<option value="blank">Blank canvas</option><optgroup label="Copy a game map">${live.map((map) => `<option value="${escapeHtml(map.id)}">${escapeHtml(map.name)}</option>`).join("")}</optgroup>`;
}

function selectMap(id, force = false) {
  if (!force && dirty && !window.confirm("Discard the unsaved changes to this map?")) {
    elements.mapSelect.value = currentMap.id;
    return;
  }
  const source = maps.find((map) => map.id === id);
  if (!source) return;
  currentMap = clone(source);
  originalMapId = source.id;
  baseline = canonical(currentMap);
  selection = null;
  history = [];
  future = [];
  cancelAddMode();
  updateHistoryButtons();
  updateDirtyState();
  refreshMapPicker();
  refreshPanels();
  fitMap();
}

function refreshPanels() {
  if (!currentMap) return;
  elements.decorCount.textContent = currentMap.decor.length.toLocaleString();
  elements.pathCount.textContent = currentMap.paths.length.toLocaleString();
  elements.campCount.textContent = currentMap.spawnCamps.length.toLocaleString();
  renderInspector();
  renderAssets();
}

function setTool(tool) {
  currentTool = tool;
  addMode = null;
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === tool));
  elements.stage.dataset.tool = tool;
  elements.placementHint.hidden = true;
  renderAssets();
}

function setAddMode(item) {
  addMode = item;
  currentTool = "add";
  document.querySelectorAll("[data-tool]").forEach((button) => button.classList.remove("is-active"));
  elements.stage.dataset.tool = "add";
  elements.placementHint.textContent = `Click to add ${item.label.toLowerCase()} · Esc to finish`;
  elements.placementHint.hidden = false;
  renderAssets();
}

function cancelAddMode() {
  if (!addMode) return;
  setTool("select");
}

function renderAssets() {
  const query = elements.assetSearch.value.trim().toLowerCase();
  elements.assetList.innerHTML = ADD_ITEMS.filter((item) => item.label.toLowerCase().includes(query)).map((item) => {
    const active = addMode?.kind === item.kind && addMode?.type === item.type;
    const portalDisabled = item.kind === "portal" && (currentMap?.status === "live" || currentMap?.gameplay.portals.length >= 2);
    const benchDisabled = item.type === "upgradeBench" && (currentMap?.templateId !== "intermediate_snowlands" || currentMap?.decor.some((decor) => decor.type === "upgradeBench"));
    const disabled = portalDisabled || benchDisabled;
    const disabledTitle = portalDisabled ? "Live-map portal connections are protected." : benchDisabled ? "A Snowlands-based map can have one Upgrade Bench." : "";
    return `<button class="asset-button${item.wide ? " is-wide" : ""}${active ? " is-active" : ""}" type="button" data-add-kind="${item.kind}"${item.type ? ` data-add-type="${item.type}"` : ""}${disabled ? ` disabled title="${disabledTitle}"` : ""}>
      <span class="asset-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span>
    </button>`;
  }).join("");
  elements.assetList.querySelectorAll("[data-add-kind]").forEach((button) => button.addEventListener("click", () => {
    const item = ADD_ITEMS.find((candidate) => candidate.kind === button.dataset.addKind && candidate.type === button.dataset.addType)
      ?? ADD_ITEMS.find((candidate) => candidate.kind === button.dataset.addKind && !candidate.type);
    if (item) setAddMode(item);
  }));
}

function colorToHex(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7);
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((part) => part + part).join("")}`;
  const parts = value.match(/[\d.]+/g)?.map(Number);
  if (parts?.length >= 3) return `#${parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("")}`;
  return "#808080";
}

function colorField(label, field, value) {
  return `<label class="field"><span>${escapeHtml(label)}</span><span class="color-field"><input type="color" value="${colorToHex(value)}" data-theme-color="${field}"><input type="text" value="${escapeHtml(value)}" data-theme-text="${field}" spellcheck="false"></span></label>`;
}

function numberField(label, field, value, options = {}) {
  const { min = 0, max = 4800, step = 1 } = options;
  return `<label class="field"><span>${escapeHtml(label)}</span><input type="number" value="${Number(value.toFixed?.(3) ?? value)}" min="${min}" max="${max}" step="${step}" data-selection-field="${field}"></label>`;
}

function mapInspectorHtml() {
  const palettes = Object.entries(currentMap.theme.decorColors ?? {}).map(([type, colors]) => `
    <div class="palette-row"><span title="${escapeHtml(LABELS[type] ?? titleCase(type))}">${escapeHtml(LABELS[type] ?? titleCase(type))}</span>
      ${colors.map((entry, index) => `<input type="color" value="${colorToHex(entry)}" data-palette-type="${type}" data-palette-index="${index}" aria-label="${escapeHtml(type)} color ${index + 1}">`).join("")}
    </div>`).join("");
  const saved = Boolean(currentMap.updatedAt);
  return `
    <section>
      <h2>Map settings</h2>
      <p class="status-note ${currentMap.status}">${currentMap.status === "live"
        ? "Saves apply to this game map's source for the next build or release. Gameplay marker changes also become server source changes."
        : "Draft maps are saved in the repository but are not added to live progression automatically."}</p>
      <label class="field"><span>Name</span><input type="text" maxlength="60" value="${escapeHtml(currentMap.name)}" data-map-field="name"></label>
      <label class="field"><span>Map ID</span><input type="text" value="${escapeHtml(currentMap.id)}" readonly></label>
    </section>
    <section>
      <h2>Map colors</h2>
      ${colorField("Ground", "ground", currentMap.theme.ground)}
      ${colorField("Paths", "path", currentMap.theme.path)}
      ${colorField("Path detail", "pathDetail", currentMap.theme.pathDetail)}
      ${palettes || '<p class="hint">This map has no editable decoration palette yet. Individual vector decorations can still use a color override.</p>'}
    </section>
    <section>
      <h2>File actions</h2>
      <div class="button-row">
        <button type="button" data-action="export">Export JSON</button>
        <button type="button" data-action="import">Import JSON</button>
      </div>
      <div class="button-row" style="margin-top:6px">
        <button type="button" class="danger" data-action="revert" ${!saved && currentMap.status === "live" ? "disabled" : ""}>${currentMap.status === "live" ? "Revert saved edits" : "Delete draft"}</button>
      </div>
      <p class="hint">Every repository save creates a recovery copy in <code>art-source/map-editor-backups</code>.</p>
    </section>`;
}

function selectedEntity() {
  if (!selection || !currentMap) return null;
  if (selection.kind === "path") return currentMap.paths[selection.index] ?? null;
  if (selection.kind === "decor") return currentMap.decor[selection.index] ?? null;
  if (selection.kind === "camp") return currentMap.spawnCamps[selection.index] ?? null;
  if (selection.kind === "portal") return currentMap.gameplay.portals[selection.index] ?? null;
  if (selection.kind === "arrival") return currentMap.gameplay.arrival;
  if (selection.kind === "boss") return currentMap.gameplay.boss;
  if (selection.kind === "pickup") return currentMap.gameplay.bootsPickup ?? null;
  return null;
}

function selectionName() {
  const entity = selectedEntity();
  if (!entity) return "Selection";
  if (selection.kind === "decor") return LABELS[entity.type] ?? titleCase(entity.type);
  if (selection.kind === "camp") return entity.name;
  if (selection.kind === "portal") return `Portal ${selection.index + 1}`;
  return titleCase(selection.kind);
}

function selectionInspectorHtml() {
  const entity = selectedEntity();
  if (!entity) return mapInspectorHtml();
  let fields = `<div class="field-row">${numberField("X", "x", entity.x)}${numberField("Y", "y", entity.y)}</div>`;
  let canDuplicate = false;
  let canDelete = false;
  if (selection.kind === "path") {
    fields += `<div class="field-row">${numberField("Width", "w", entity.w, { min: 10 })}${numberField("Height", "h", entity.h, { min: 10 })}</div>`;
    canDuplicate = canDelete = true;
  } else if (selection.kind === "decor") {
    if (SCALABLE_DECOR.has(entity.type)) fields += numberField("Scale", "s", entity.s ?? 1, { min: .1, max: 5, step: .05 });
    if (VARIANT_DECOR.has(entity.type)) fields += numberField("Variant", "variant", entity.variant ?? 0, { min: 0, max: 999 });
    const colorable = COLORABLE_DECOR.has(entity.type) && (entity.type !== "tree" || currentMap.templateId === "samurai_garden");
    if (colorable) {
      fields += `<label class="check-row"><input type="checkbox" data-color-override ${entity.color ? "checked" : ""}> Use individual color</label>`;
      if (entity.color) fields += `<label class="field"><span>Color</span><input type="color" value="${colorToHex(entity.color)}" data-selection-field="color"></label>`;
    } else {
      fields += `<p class="hint">This item uses image art, so its original asset colors are preserved.</p>`;
    }
    canDuplicate = entity.type !== "upgradeBench";
    canDelete = entity.type !== "upgradeBench" || currentMap.status === "draft";
  } else if (selection.kind === "camp") {
    const enemyKinds = catalog.enemyKinds.map((kind) => typeof kind === "string" ? kind : kind.id);
    const enemyOptions = (selected) => enemyKinds.map((kind) => `<option${selected === kind ? " selected" : ""}>${escapeHtml(kind)}</option>`).join("");
    fields += `<label class="field"><span>Name</span><input value="${escapeHtml(entity.name)}" maxlength="60" data-selection-field="name"></label>`;
    fields += `<div class="field"><span>Enemy mix</span><div class="enemy-mix">${entity.types.map((kind, index) => `<div class="enemy-row"><select data-camp-enemy="${index}">${enemyOptions(kind)}</select><button type="button" data-remove-enemy="${index}" aria-label="Remove ${escapeHtml(kind)}" ${entity.types.length === 1 ? "disabled" : ""}>−</button></div>`).join("")}</div><button type="button" data-action="add-enemy" ${entity.types.length >= 20 ? "disabled" : ""}>Add enemy to mix</button><p class="hint">The list repeats across the camp, so duplicate rows act as weights. Mixed enemies must award the same stat.</p></div>`;
    fields += `<div class="field-row">${numberField("Count", "count", entity.count, { min: 1, max: 100 })}${numberField("Radius", "radius", entity.radius, { min: 0, max: 1400 })}</div>`;
    fields += `<div class="field-row">${numberField("Inner radius", "minRadius", entity.minRadius, { min: 0, max: 1200 })}<label class="field"><span>Formation</span><select data-selection-field="formation">${["scatter", "crescent", "shoal", "ranks"].map((value) => `<option value="${value}"${(entity.formation ?? "scatter") === value ? " selected" : ""}>${titleCase(value)}</option>`).join("")}</select></label></div>`;
    fields += numberField("Rotation (degrees)", "rotationDegrees", (entity.rotation ?? 0) * 180 / Math.PI, { min: -360, max: 360, step: 1 });
    canDuplicate = canDelete = true;
  } else if (selection.kind === "portal") {
    const destinations = maps.filter((map) => map.status === "live" && map.id !== currentMap.id).map((map) => `<option value="${map.id}"${entity.destination === map.id ? " selected" : ""}>${escapeHtml(map.name)}</option>`).join("");
    fields += currentMap.status === "live"
      ? `<label class="field"><span>Destination</span><input value="${escapeHtml(maps.find((map) => map.id === entity.destination)?.name ?? entity.destination)}" readonly></label>`
      : `<label class="field"><span>Destination</span><select data-selection-field="destination">${destinations}</select></label>`;
    fields += `<div class="field-row">${numberField("Width", "width", entity.width, { min: 40, max: 600 })}${numberField("Height", "height", entity.height, { min: 40, max: 600 })}</div>`;
    fields += numberField("Depth", "depth", entity.depth, { min: 0, max: 4800 });
    canDuplicate = currentMap.status === "draft" && currentMap.gameplay.portals.length < 2;
    canDelete = currentMap.status === "draft" && currentMap.gameplay.portals.length > 1;
  } else if (selection.kind === "arrival") {
    fields += `<p class="hint">Players appear here after entering this map.</p>`;
  } else if (selection.kind === "boss") {
    fields += `<p class="hint">Moving the boss updates both client and server source coordinates.</p>`;
  } else if (selection.kind === "pickup") {
    fields += `<p class="hint">Players collect the Trailblazer Boots at this point in Tutorial Forest.</p>`;
    canDelete = currentMap.status === "draft";
  }
  return `<section>
    <h2 class="selection-title"><span>${escapeHtml(selectionName())}</span><span class="kind">${escapeHtml(selection.kind)}</span></h2>
    ${fields}
    ${(canDuplicate || canDelete) ? `<div class="button-row">${canDuplicate ? '<button type="button" data-action="duplicate">Duplicate</button>' : ""}${canDelete ? '<button type="button" class="danger" data-action="delete">Delete</button>' : ""}</div>` : ""}
  </section>
  <section><button type="button" data-action="clear-selection">Back to map settings</button></section>`;
}

function renderInspector() {
  elements.inspector.innerHTML = selection ? selectionInspectorHtml() : mapInspectorHtml();
  bindInspector();
}

function bindInspector() {
  elements.inspector.querySelectorAll("[data-map-field]").forEach((input) => input.addEventListener("change", () => mutate(() => {
    currentMap[input.dataset.mapField] = input.value.trim() || currentMap[input.dataset.mapField];
    refreshMapPicker();
  })));
  elements.inspector.querySelectorAll("[data-theme-color]").forEach((input) => input.addEventListener("change", () => mutate(() => {
    currentMap.theme[input.dataset.themeColor] = input.value;
  })));
  elements.inspector.querySelectorAll("[data-theme-text]").forEach((input) => input.addEventListener("change", () => {
    if (!CSS.supports("color", input.value)) return showToast("That color value is not valid.", true);
    mutate(() => { currentMap.theme[input.dataset.themeText] = input.value.trim(); });
  }));
  elements.inspector.querySelectorAll("[data-palette-type]").forEach((input) => input.addEventListener("change", () => mutate(() => {
    currentMap.theme.decorColors[input.dataset.paletteType][Number(input.dataset.paletteIndex)] = input.value;
  })));
  elements.inspector.querySelectorAll("[data-selection-field]").forEach((input) => input.addEventListener("change", () => {
    const field = input.dataset.selectionField;
    const value = input.type === "number" ? Number(input.value) : input.value;
    mutate(() => updateSelectedField(field, value));
  }));
  elements.inspector.querySelectorAll("[data-camp-enemy]").forEach((input) => input.addEventListener("change", () => mutate(() => {
    const camp = selectedEntity();
    if (selection?.kind === "camp" && camp) camp.types[Number(input.dataset.campEnemy)] = input.value;
  })));
  elements.inspector.querySelectorAll("[data-remove-enemy]").forEach((button) => button.addEventListener("click", () => mutate(() => {
    const camp = selectedEntity();
    if (selection?.kind === "camp" && camp?.types.length > 1) camp.types.splice(Number(button.dataset.removeEnemy), 1);
  })));
  elements.inspector.querySelector("[data-color-override]")?.addEventListener("change", (event) => mutate(() => {
    const entity = selectedEntity();
    if (!entity) return;
    if (event.currentTarget.checked) entity.color = currentMap.theme.decorColors[entity.type]?.[0] ?? "#ffffff";
    else delete entity.color;
  }));
  elements.inspector.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
}

function updateSelectedField(field, value) {
  const entity = selectedEntity();
  if (!entity) return;
  if (["x", "y", "w", "h", "s", "variant", "count", "radius", "minRadius", "width", "height", "depth"].includes(field)) {
    entity[field] = Number(value);
    if (field === "x" || field === "y") entity[field] = Math.max(0, Math.min(4800, entity[field]));
    if (selection.kind === "portal" && field === "y") entity.depth = entity.y;
  } else if (field === "rotationDegrees") {
    entity.rotation = Number(value) * Math.PI / 180;
  } else if (field === "formation") {
    if (value === "scatter") delete entity.formation;
    else entity.formation = value;
  } else {
    entity[field] = value;
  }
}

function handleAction(action) {
  if (action === "clear-selection") {
    selection = null;
    refreshPanels();
    queueRender();
  } else if (action === "duplicate") duplicateSelection();
  else if (action === "delete") deleteSelection();
  else if (action === "add-enemy") mutate(() => {
    const camp = selectedEntity();
    if (selection?.kind === "camp" && camp && camp.types.length < 20) camp.types.push(camp.types.at(-1));
  });
  else if (action === "export") exportMap();
  else if (action === "import") elements.importFile.click();
  else if (action === "revert") void revertMap();
}

function deleteSelection() {
  if (!selection) return;
  const entity = selectedEntity();
  if (selection.kind === "portal" && currentMap.status === "live") {
    showToast("Live-map portals can be moved and resized, but not removed.", true);
    return;
  }
  if (selection.kind === "decor" && entity?.type === "upgradeBench" && currentMap.status === "live") {
    showToast("Snowlands must keep its functional Upgrade Bench.", true);
    return;
  }
  if (["arrival", "boss"].includes(selection.kind) || (selection.kind === "pickup" && currentMap.status === "live")) {
    showToast("This gameplay marker is required, but you can move it anywhere on the map.", true);
    return;
  }
  mutate(() => {
    if (selection.kind === "path") currentMap.paths.splice(selection.index, 1);
    else if (selection.kind === "decor") currentMap.decor.splice(selection.index, 1);
    else if (selection.kind === "camp") currentMap.spawnCamps.splice(selection.index, 1);
    else if (selection.kind === "portal" && currentMap.gameplay.portals.length > 1) currentMap.gameplay.portals.splice(selection.index, 1);
    else if (selection.kind === "pickup") delete currentMap.gameplay.bootsPickup;
    selection = null;
  });
}

function duplicateSelection() {
  const entity = selectedEntity();
  if (!entity || ["arrival", "boss", "pickup"].includes(selection.kind)) return;
  if (selection.kind === "portal" && currentMap.status === "live") {
    showToast("Live-map portal connections are protected.", true);
    return;
  }
  if (selection.kind === "decor" && entity.type === "upgradeBench") {
    showToast("A Snowlands-based map can have one Upgrade Bench.", true);
    return;
  }
  mutate(() => {
    const copy = clone(entity);
    copy.x = Math.min(WORLD.width, copy.x + 25);
    copy.y = Math.min(WORLD.height, copy.y + 25);
    if (selection.kind === "path") {
      currentMap.paths.push(copy); selection = { kind: "path", index: currentMap.paths.length - 1 };
    } else if (selection.kind === "decor") {
      currentMap.decor.push(copy); selection = { kind: "decor", index: currentMap.decor.length - 1 };
    } else if (selection.kind === "camp") {
      copy.name = `${copy.name} Copy`; currentMap.spawnCamps.push(copy); selection = { kind: "camp", index: currentMap.spawnCamps.length - 1 };
    } else if (selection.kind === "portal" && currentMap.gameplay.portals.length < 2) {
      copy.depth = copy.y; currentMap.gameplay.portals.push(copy); selection = { kind: "portal", index: currentMap.gameplay.portals.length - 1 };
    }
  });
}

function nudgeSelection(dx, dy) {
  const entity = selectedEntity();
  if (!entity) return;
  mutate(() => {
    entity.x = Math.max(0, Math.min(WORLD.width, entity.x + dx));
    entity.y = Math.max(0, Math.min(WORLD.height, entity.y + dy));
    if (selection.kind === "portal") entity.depth = entity.y;
  });
}

function exportMap() {
  const blob = new Blob([`${JSON.stringify(currentMap, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${currentMap.id}.wildstat-map.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importMap(file) {
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || !Array.isArray(imported.paths) || !Array.isArray(imported.decor) || !imported.gameplay) throw new Error("This is not a WildStat map file.");
    const existing = maps.find((map) => map.id === imported.id);
    if (existing && existing.id !== currentMap.id && !window.confirm(`Replace the editor copy of ${existing.name}?`)) return;
    if (dirty && !window.confirm("Replace the current unsaved map with the imported map?")) return;
    imported.status = LIVE_MAP_IDS.has(imported.id) ? "live" : "draft";
    const index = maps.findIndex((map) => map.id === imported.id);
    if (index >= 0) maps[index] = clone(imported); else maps.push(clone(imported));
    currentMap = clone(imported);
    originalMapId = imported.id;
    baseline = "";
    selection = null;
    history = [];
    future = [];
    refreshMapPicker();
    updateDirtyState();
    refreshPanels();
    fitMap();
    showToast("Map imported. Save to apply it to the repository.");
  } catch (error) {
    showToast(error.message || "Could not import that map.", true);
  } finally {
    elements.importFile.value = "";
  }
}

async function saveMap() {
  if (!currentMap || !dirty) return;
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "Saving…";
  try {
    const response = await fetch("/api/maps/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ map: currentMap, originalId: originalMapId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Map save failed.");
    currentMap = clone(result.map);
    originalMapId = currentMap.id;
    const index = maps.findIndex((map) => map.id === currentMap.id || map.id === originalMapId);
    if (index >= 0) maps[index] = clone(currentMap); else maps.push(clone(currentMap));
    baseline = canonical(currentMap);
    history = [];
    future = [];
    updateHistoryButtons();
    updateDirtyState();
    refreshMapPicker();
    refreshPanels();
    showToast(currentMap.status === "draft"
      ? result.message
      : result.serverPublishNeeded
        ? `${result.message} Release the client and game server to publish it.`
        : `${result.message} Release the client to publish it.`);
  } catch (error) {
    setErrorState("Save failed");
    showToast(error.message || "Map save failed.", true);
  } finally {
    elements.saveButton.textContent = "Save map";
    elements.saveButton.disabled = !dirty;
  }
}

async function reloadCatalog(preferredId) {
  const response = await fetch("/api/maps", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load maps.");
  catalog = result;
  maps = [...result.maps, ...result.drafts];
  refreshMapPicker();
  selectMap(maps.find((map) => map.id === preferredId)?.id ?? maps[0].id, true);
}

async function revertMap() {
  if (!currentMap) return;
  if (!currentMap.updatedAt && currentMap.status === "draft") {
    maps = maps.filter((map) => map.id !== currentMap.id);
    return selectMap(currentMap.templateId, true);
  }
  const verb = currentMap.status === "live" ? "revert this map to its generated source layout" : "delete this draft";
  if (!window.confirm(`Are you sure you want to ${verb}? A backup will be kept.`)) return;
  try {
    const id = currentMap.id;
    const response = await fetch(`/api/maps/${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not revert the map.");
    await reloadCatalog(currentMap.status === "live" ? id : currentMap.templateId);
    showToast(currentMap.status === "live" ? "Saved edits reverted." : "Draft deleted.");
  } catch (error) {
    showToast(error.message || "Could not revert the map.", true);
  }
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 64);
}

function createDraft(name, id, templateId) {
  if (maps.some((map) => map.id === id)) return showToast("That map ID is already in use.", true);
  const template = maps.find((map) => map.id === templateId && map.status === "live");
  if (templateId !== "blank" && !template) return showToast("Choose a valid game-map template.", true);
  if (dirty && !window.confirm("Discard the current unsaved changes and create the new draft?")) return;
  const draft = templateId === "blank" ? {
    id,
    name,
    templateId: "blank",
    status: "draft",
    updatedAt: "",
    theme: { ground: "#31945b", path: "#8b6551", pathDetail: "rgba(68,38,29,.12)", decorColors: {} },
    paths: [],
    decor: [],
    spawnCamps: [],
    gameplay: {
      arrival: { x: 360, y: 360 },
      boss: { x: 4050, y: 4050 },
      portals: [{ x: 360, y: 680, width: 198, height: 198, depth: 680, destination: "tutorial_forest" }],
    },
  } : { ...clone(template), id, name, templateId, status: "draft", updatedAt: "" };
  maps.push(draft);
  currentMap = clone(draft);
  originalMapId = id;
  baseline = "";
  selection = null;
  history = [];
  future = [];
  cancelAddMode();
  refreshMapPicker();
  updateHistoryButtons();
  updateDirtyState();
  refreshPanels();
  fitMap();
  elements.dialog.close();
  showToast("Draft created. Save it to write the new map into the repository.");
}

function gridSize() {
  return Number(elements.gridSize.value) || 25;
}

function snap(value) {
  return elements.snapGrid.checked ? Math.round(value / gridSize()) * gridSize() : Math.round(value);
}

function canvasPoint(event) {
  const bounds = elements.canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function screenToWorld(point) {
  return { x: point.x / view.zoom + view.x, y: point.y / view.zoom + view.y };
}

function worldToScreen(point) {
  return { x: (point.x - view.x) * view.zoom, y: (point.y - view.y) * view.zoom };
}

function keepViewNearWorld() {
  const width = elements.canvas.clientWidth / view.zoom;
  const height = elements.canvas.clientHeight / view.zoom;
  const marginX = Math.min(width * .45, 900);
  const marginY = Math.min(height * .45, 900);
  view.x = Math.max(-marginX, Math.min(WORLD.width - width + marginX, view.x));
  view.y = Math.max(-marginY, Math.min(WORLD.height - height + marginY, view.y));
}

function setZoom(nextZoom, anchor = { x: elements.canvas.clientWidth / 2, y: elements.canvas.clientHeight / 2 }) {
  const worldBefore = screenToWorld(anchor);
  view.zoom = Math.max(.06, Math.min(2.5, nextZoom));
  view.x = worldBefore.x - anchor.x / view.zoom;
  view.y = worldBefore.y - anchor.y / view.zoom;
  keepViewNearWorld();
  elements.zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`;
  queueRender();
}

function fitMap() {
  const width = Math.max(1, elements.canvas.clientWidth);
  const height = Math.max(1, elements.canvas.clientHeight - 24);
  view.zoom = Math.max(.06, Math.min(1, Math.min((width - 38) / WORLD.width, (height - 38) / WORLD.height)));
  view.x = (WORLD.width - width / view.zoom) / 2;
  view.y = (WORLD.height - height / view.zoom) / 2;
  elements.zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`;
  queueRender();
}

function addAt(worldPoint) {
  if (!addMode || !currentMap) return;
  const x = Math.max(0, Math.min(WORLD.width, snap(worldPoint.x)));
  const y = Math.max(0, Math.min(WORLD.height, snap(worldPoint.y)));
  mutate(() => {
    if (addMode.kind === "path") {
      currentMap.paths.push({ x: Math.max(0, x - 150), y: Math.max(0, y - 75), w: 300, h: 150 });
      selection = { kind: "path", index: currentMap.paths.length - 1 };
    } else if (addMode.kind === "decor") {
      const item = { type: addMode.type, x, y };
      if (SCALABLE_DECOR.has(item.type)) item.s = 1;
      if (VARIANT_DECOR.has(item.type)) item.variant = 0;
      if (item.type === "upgradeBench") item.label = "Upgrade Bench";
      currentMap.decor.push(item);
      selection = { kind: "decor", index: currentMap.decor.length - 1 };
    } else if (addMode.kind === "camp") {
      const type = currentMap.spawnCamps[0]?.types[0] ?? (typeof catalog.enemyKinds[0] === "string" ? catalog.enemyKinds[0] : catalog.enemyKinds[0].id);
      currentMap.spawnCamps.push({ name: "New Camp", x, y, minRadius: 120, radius: 320, count: 5, types: [type] });
      selection = { kind: "camp", index: currentMap.spawnCamps.length - 1 };
    } else if (addMode.kind === "portal" && currentMap.gameplay.portals.length < 2) {
      const destination = maps.find((map) => map.status === "live" && map.id !== currentMap.id)?.id ?? "tutorial_forest";
      currentMap.gameplay.portals.push({ x, y, width: 198, height: 198, depth: y, destination });
      selection = { kind: "portal", index: currentMap.gameplay.portals.length - 1 };
      cancelAddMode();
    }
  });
}

function decorBounds(item) {
  const scale = item.s ?? 1;
  const small = ["grass", "petal", "cherryPetal", "desertGrass", "snowTuft"].includes(item.type);
  if (small) return { x: item.x - 14, y: item.y - 14, w: 28, h: 28 };
  if (item.type === "lavaPool") return { x: item.x - 150 * scale, y: item.y - 75 * scale, w: 300 * scale, h: 150 * scale };
  if (["tree", "snowPine", "charredTree"].includes(item.type)) return { x: item.x - 75 * scale, y: item.y - 170 * scale, w: 150 * scale, h: 180 * scale };
  return { x: item.x - 45 * scale, y: item.y - 75 * scale, w: 90 * scale, h: 85 * scale };
}

function hitTest(worldPoint) {
  const tolerance = 9 / view.zoom;
  if (elements.showMarkers.checked) {
    for (let index = currentMap.gameplay.portals.length - 1; index >= 0; index -= 1) {
      const portal = currentMap.gameplay.portals[index];
      if (Math.abs(worldPoint.x - portal.x) <= portal.width / 2 + tolerance && worldPoint.y >= portal.y - portal.height - tolerance && worldPoint.y <= portal.y + tolerance) return { kind: "portal", index };
    }
    if (Math.hypot(worldPoint.x - currentMap.gameplay.boss.x, worldPoint.y - currentMap.gameplay.boss.y) <= 42 + tolerance) return { kind: "boss" };
    const pickup = currentMap.gameplay.bootsPickup;
    if (pickup && Math.hypot(worldPoint.x - pickup.x, worldPoint.y - pickup.y) <= 30 + tolerance) return { kind: "pickup" };
    if (Math.hypot(worldPoint.x - currentMap.gameplay.arrival.x, worldPoint.y - currentMap.gameplay.arrival.y) <= 30 + tolerance) return { kind: "arrival" };
  }
  if (elements.showDecor.checked) {
    for (let index = currentMap.decor.length - 1; index >= 0; index -= 1) {
      const bounds = decorBounds(currentMap.decor[index]);
      if (worldPoint.x >= bounds.x - tolerance && worldPoint.x <= bounds.x + bounds.w + tolerance && worldPoint.y >= bounds.y - tolerance && worldPoint.y <= bounds.y + bounds.h + tolerance) return { kind: "decor", index };
    }
  }
  if (elements.showCamps.checked) {
    for (let index = currentMap.spawnCamps.length - 1; index >= 0; index -= 1) {
      const camp = currentMap.spawnCamps[index];
      if (Math.hypot(worldPoint.x - camp.x, worldPoint.y - camp.y) <= camp.radius + tolerance) return { kind: "camp", index };
    }
  }
  if (elements.showPaths.checked) {
    for (let index = currentMap.paths.length - 1; index >= 0; index -= 1) {
      const path = currentMap.paths[index];
      if (worldPoint.x >= path.x - tolerance && worldPoint.x <= path.x + path.w + tolerance && worldPoint.y >= path.y - tolerance && worldPoint.y <= path.y + path.h + tolerance) return { kind: "path", index };
    }
  }
  return null;
}

function pathResizeHandleHit(worldPoint) {
  if (selection?.kind !== "path") return false;
  const path = selectedEntity();
  const tolerance = 11 / view.zoom;
  return Math.abs(worldPoint.x - (path.x + path.w)) <= tolerance && Math.abs(worldPoint.y - (path.y + path.h)) <= tolerance;
}

function beginPointer(event) {
  if (!currentMap) return;
  const screen = canvasPoint(event);
  const world = screenToWorld(screen);
  if (addMode && event.button === 0 && !spaceHeld) {
    addAt(world);
    return;
  }
  if (currentTool === "pan" || spaceHeld || event.button === 1) {
    event.preventDefault();
    elements.canvas.setPointerCapture(event.pointerId);
    drag = { mode: "pan", screen, view: { ...view } };
    elements.stage.classList.add("is-panning");
    return;
  }
  if (event.button !== 0) return;
  const resizing = pathResizeHandleHit(world);
  const hit = resizing ? selection : hitTest(world);
  selection = hit;
  refreshPanels();
  queueRender();
  if (!hit) return;
  const entity = selectedEntity();
  elements.canvas.setPointerCapture(event.pointerId);
  drag = {
    mode: resizing ? "resize-path" : "move",
    screen,
    world,
    before: clone(currentMap),
    start: clone(entity),
  };
}

function movePointer(event) {
  const screen = canvasPoint(event);
  const world = screenToWorld(screen);
  elements.coordinates.textContent = `x ${Math.round(world.x)} · y ${Math.round(world.y)}`;
  if (!drag) return;
  if (drag.mode === "pan") {
    view.x = drag.view.x - (screen.x - drag.screen.x) / view.zoom;
    view.y = drag.view.y - (screen.y - drag.screen.y) / view.zoom;
    keepViewNearWorld();
  } else {
    const entity = selectedEntity();
    if (!entity) return;
    const dx = world.x - drag.world.x;
    const dy = world.y - drag.world.y;
    if (drag.mode === "resize-path") {
      entity.w = Math.max(10, snap(drag.start.w + dx));
      entity.h = Math.max(10, snap(drag.start.h + dy));
    } else {
      entity.x = Math.max(0, Math.min(WORLD.width, snap(drag.start.x + dx)));
      entity.y = Math.max(0, Math.min(WORLD.height, snap(drag.start.y + dy)));
      if (selection.kind === "portal") entity.depth = entity.y;
    }
  }
  queueRender();
}

function endPointer(event) {
  if (!drag) return;
  if (elements.canvas.hasPointerCapture(event.pointerId)) elements.canvas.releasePointerCapture(event.pointerId);
  elements.stage.classList.remove("is-panning");
  const completed = drag;
  drag = null;
  if (completed.before && canonical(completed.before) !== canonical(currentMap)) commit(completed.before);
}

function paletteColor(item, fallbacks) {
  if (item.color) return item.color;
  const configured = currentMap.theme.decorColors?.[item.type];
  const colors = configured?.length ? configured : fallbacks;
  return colors[Math.abs(Math.trunc(item.variant ?? 0)) % colors.length];
}

function visibleBounds(bounds) {
  const right = view.x + elements.canvas.clientWidth / view.zoom;
  const bottom = view.y + elements.canvas.clientHeight / view.zoom;
  return bounds.x + bounds.w >= view.x && bounds.x <= right && bounds.y + bounds.h >= view.y && bounds.y <= bottom;
}

function drawDecoration(item) {
  const bounds = decorBounds(item);
  if (!visibleBounds(bounds)) return;
  const x = item.x;
  const y = item.y;
  const scale = item.s ?? 1;
  context.save();
  context.lineWidth = Math.max(2, 3 / view.zoom);
  context.lineJoin = "round";
  context.lineCap = "round";
  if (item.type === "tree") {
    context.fillStyle = "#614532"; context.fillRect(x - 10 * scale, y - 78 * scale, 20 * scale, 78 * scale);
    context.fillStyle = paletteColor(item, ["#388552", "#4b9a5d", "#2e7148"]);
    for (const [dx, dy, radius] of [[-32, -92, 38], [15, -116, 46], [45, -83, 34], [0, -72, 48]]) { context.beginPath(); context.arc(x + dx * scale, y + dy * scale, radius * scale, 0, Math.PI * 2); context.fill(); }
  } else if (["grass", "desertGrass"].includes(item.type)) {
    context.strokeStyle = paletteColor(item, item.type === "grass" ? ["#267f4c", "#237b49"] : ["#a28a43", "#8b7b3d"]);
    context.beginPath(); context.moveTo(x, y); context.lineTo(x - 7, y - 15); context.moveTo(x, y); context.lineTo(x + 2, y - 19); context.moveTo(x + 2, y); context.lineTo(x + 10, y - 12); context.stroke();
  } else if (["petal", "cherryPetal", "snowTuft"].includes(item.type)) {
    const fallback = item.type === "petal" ? ["#d9f4df", "#f3f0c6", "#ccebea"] : item.type === "cherryPetal" ? ["#ffd0e5", "#ff9fc9", "#f477ad", "#fff0f7"] : ["#ddf2ff", "#ffffff"];
    context.fillStyle = paletteColor(item, fallback); context.fillRect(x - 7, y - 2, 14, 4); context.fillRect(x - 2, y - 7, 4, 14);
  } else if (item.type === "cactus") {
    context.fillStyle = paletteColor(item, ["#3f8050", "#245a36", "#70a961"]); context.fillRect(x - 10 * scale, y - 70 * scale, 20 * scale, 70 * scale); context.fillRect(x + 7 * scale, y - 45 * scale, 25 * scale, 12 * scale); context.fillRect(x + 22 * scale, y - 60 * scale, 10 * scale, 27 * scale);
  } else if (["rock", "lavaRock"].includes(item.type)) {
    context.fillStyle = paletteColor(item, item.type === "rock" ? ["#79543d", "#b77b4b"] : ["#4b302b", "#7b4331"]); context.beginPath(); context.moveTo(x - 36 * scale, y); context.lineTo(x - 24 * scale, y - 35 * scale); context.lineTo(x + 8 * scale, y - 52 * scale); context.lineTo(x + 38 * scale, y - 10 * scale); context.closePath(); context.fill();
  } else if (item.type === "snowPine") {
    context.fillStyle = "#6b5744"; context.fillRect(x - 6 * scale, y - 45 * scale, 12 * scale, 45 * scale); context.fillStyle = "#e7f5fb"; for (const [dy, width] of [[-145, 44], [-112, 62], [-75, 78]]) { context.beginPath(); context.moveTo(x, y + dy * scale); context.lineTo(x - width * scale, y + (dy + 72) * scale); context.lineTo(x + width * scale, y + (dy + 72) * scale); context.closePath(); context.fill(); }
  } else if (item.type === "upgradeBench") {
    context.fillStyle = "#73513c"; context.fillRect(x - 62 * scale, y - 62 * scale, 124 * scale, 45 * scale); context.fillStyle = "#92979b"; context.fillRect(x - 55 * scale, y - 70 * scale, 110 * scale, 15 * scale); context.fillStyle = "#4a3329"; context.fillRect(x - 45 * scale, y - 18 * scale, 12 * scale, 18 * scale); context.fillRect(x + 33 * scale, y - 18 * scale, 12 * scale, 18 * scale);
  } else if (item.type === "lavaPool") {
    context.fillStyle = "#b93824"; context.beginPath(); context.ellipse(x, y, 145 * scale, 64 * scale, 0, 0, Math.PI * 2); context.fill(); context.fillStyle = "#ffb238"; context.beginPath(); context.ellipse(x, y - 3 * scale, 110 * scale, 42 * scale, 0, 0, Math.PI * 2); context.fill();
  } else if (item.type === "charredTree") {
    context.strokeStyle = "#3a2725"; context.lineWidth = 14 * scale; context.beginPath(); context.moveTo(x, y); context.lineTo(x, y - 120 * scale); context.moveTo(x, y - 70 * scale); context.lineTo(x - 38 * scale, y - 105 * scale); context.moveTo(x, y - 90 * scale); context.lineTo(x + 36 * scale, y - 130 * scale); context.stroke();
  } else if (item.type === "coral") {
    context.strokeStyle = paletteColor(item, ["#ff7f87", "#f2a15f", "#b47be8"]); context.lineWidth = 10 * scale; context.beginPath(); context.moveTo(x, y); context.lineTo(x, y - 55 * scale); context.moveTo(x, y - 30 * scale); context.lineTo(x - 25 * scale, y - 48 * scale); context.moveTo(x, y - 22 * scale); context.lineTo(x + 25 * scale, y - 42 * scale); context.stroke();
  } else if (item.type === "shell") {
    context.fillStyle = paletteColor(item, ["#f0bed0", "#f6d9b8"]); context.beginPath(); context.arc(x, y, 24 * scale, Math.PI, Math.PI * 2); context.lineTo(x - 24 * scale, y); context.fill();
  } else if (item.type === "cloud") {
    context.fillStyle = paletteColor(item, ["#d6efff", "#ebf8ff"]); for (const [dx, dy, rx, ry] of [[-25, 0, 32, 20], [5, -10, 42, 27], [38, 2, 30, 19]]) { context.beginPath(); context.ellipse(x + dx * scale, y + dy * scale, rx * scale, ry * scale, 0, 0, Math.PI * 2); context.fill(); }
  } else if (item.type === "gear") {
    context.strokeStyle = paletteColor(item, ["#b58b47", "#839695", "#cfad63"]);
    context.lineWidth = 10 * scale; context.beginPath(); context.ellipse(x, y, 20 * scale, 14 * scale, 0, 0, Math.PI * 2); context.stroke();
    for (let tooth = 0; tooth < 10; tooth++) { const a = tooth * Math.PI / 5; context.beginPath(); context.moveTo(x + Math.cos(a) * 18 * scale, y + Math.sin(a) * 12 * scale); context.lineTo(x + Math.cos(a) * 29 * scale, y + Math.sin(a) * 19 * scale); context.stroke(); }
  } else if (item.type === "pumpkin") {
    context.fillStyle = paletteColor(item, ["#df8139", "#b95935", "#e5a855"]); context.beginPath(); context.ellipse(x, y - 8 * scale, 17 * scale, 14 * scale, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#879952"; context.fillRect(x - 2 * scale, y - 27 * scale, 5 * scale, 9 * scale);
  } else if (item.type === "skyShard") {
    context.fillStyle = paletteColor(item, ["#8de5ff", "#f3d778", "#c9b8ff"]); context.beginPath(); context.moveTo(x, y - 62 * scale); context.lineTo(x + 23 * scale, y - 18 * scale); context.lineTo(x + 13 * scale, y); context.lineTo(x - 17 * scale, y); context.lineTo(x - 24 * scale, y - 20 * scale); context.closePath(); context.fill();
  } else if (item.type === "glowMushroom") {
    context.fillStyle = "#b9e7d4"; context.fillRect(x - 6 * scale, y - 38 * scale, 12 * scale, 38 * scale); context.fillStyle = paletteColor(item, ["#7b54c7", "#9b68e3", "#5f46ad", "#b174df"]); context.beginPath(); context.ellipse(x, y - 40 * scale, 34 * scale, 17 * scale, 0, Math.PI, Math.PI * 2); context.fill();
  } else if (item.type === "lilyPad") {
    context.fillStyle = paletteColor(item, ["#3a8e68", "#45a66f"]); context.beginPath(); context.ellipse(x, y, 34 * scale, 18 * scale, 0, .2, Math.PI * 2 - .2); context.lineTo(x, y); context.fill();
  }
  context.restore();
}

function drawGrid() {
  if (!elements.showGrid.checked || view.zoom < .1) return;
  const size = gridSize();
  const left = Math.max(0, Math.floor(view.x / size) * size);
  const top = Math.max(0, Math.floor(view.y / size) * size);
  const right = Math.min(WORLD.width, view.x + elements.canvas.clientWidth / view.zoom);
  const bottom = Math.min(WORLD.height, view.y + elements.canvas.clientHeight / view.zoom);
  context.strokeStyle = "rgba(0,0,0,.1)";
  context.lineWidth = 1 / view.zoom;
  context.beginPath();
  for (let x = left; x <= right; x += size) { context.moveTo(x, top); context.lineTo(x, bottom); }
  for (let y = top; y <= bottom; y += size) { context.moveTo(left, y); context.lineTo(right, y); }
  context.stroke();
}

function drawMarkers() {
  if (!elements.showMarkers.checked) return;
  const line = Math.max(3, 3 / view.zoom);
  for (let index = 0; index < currentMap.gameplay.portals.length; index += 1) {
    const portal = currentMap.gameplay.portals[index];
    context.strokeStyle = "#087ea4"; context.lineWidth = line; context.strokeRect(portal.x - portal.width / 2, portal.y - portal.height, portal.width, portal.height);
    context.fillStyle = "rgba(8,126,164,.18)"; context.fillRect(portal.x - portal.width / 2, portal.y - portal.height, portal.width, portal.height);
    drawWorldLabel(`Portal → ${portal.destination}`, portal.x, portal.y - portal.height - 12, "#075873");
  }
  const boss = currentMap.gameplay.boss;
  context.fillStyle = "rgba(196,47,47,.22)"; context.strokeStyle = "#bd2f2f"; context.lineWidth = line; context.beginPath(); context.arc(boss.x, boss.y, 42, 0, Math.PI * 2); context.fill(); context.stroke(); drawWorldLabel("Boss", boss.x, boss.y - 58, "#851f1f");
  const pickup = currentMap.gameplay.bootsPickup;
  if (pickup) {
    context.fillStyle = "rgba(205,137,24,.2)"; context.strokeStyle = "#a9680c"; context.lineWidth = line;
    context.beginPath(); context.moveTo(pickup.x, pickup.y - 24); context.lineTo(pickup.x + 24, pickup.y); context.lineTo(pickup.x, pickup.y + 24); context.lineTo(pickup.x - 24, pickup.y); context.closePath(); context.fill(); context.stroke();
    drawWorldLabel("Trailblazer Boots", pickup.x, pickup.y - 36, "#825009");
  }
  const arrival = currentMap.gameplay.arrival;
  context.strokeStyle = "#1769d2"; context.lineWidth = line; context.beginPath(); context.moveTo(arrival.x - 24, arrival.y); context.lineTo(arrival.x + 24, arrival.y); context.moveTo(arrival.x, arrival.y - 24); context.lineTo(arrival.x, arrival.y + 24); context.stroke(); drawWorldLabel("Arrival", arrival.x, arrival.y - 38, "#0e55b2");
}

function drawWorldLabel(label, x, y, color) {
  if (view.zoom < .13) return;
  context.save();
  context.font = `${Math.max(11 / view.zoom, 28)}px ui-sans-serif, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.lineWidth = 4 / view.zoom;
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.strokeText(label, x, y);
  context.fillStyle = color;
  context.fillText(label, x, y);
  context.restore();
}

function selectionBounds() {
  const entity = selectedEntity();
  if (!entity) return null;
  if (selection.kind === "path") return { x: entity.x, y: entity.y, w: entity.w, h: entity.h };
  if (selection.kind === "decor") return decorBounds(entity);
  if (selection.kind === "camp") return { x: entity.x - entity.radius, y: entity.y - entity.radius, w: entity.radius * 2, h: entity.radius * 2 };
  if (selection.kind === "portal") return { x: entity.x - entity.width / 2, y: entity.y - entity.height, w: entity.width, h: entity.height };
  return { x: entity.x - 34, y: entity.y - 34, w: 68, h: 68 };
}

function drawSelection() {
  const bounds = selectionBounds();
  if (!bounds) return;
  context.save();
  context.strokeStyle = "#1769d2";
  context.lineWidth = 2 / view.zoom;
  context.setLineDash([8 / view.zoom, 5 / view.zoom]);
  if (selection.kind === "camp") { context.beginPath(); context.arc(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w / 2, 0, Math.PI * 2); context.stroke(); }
  else context.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  context.setLineDash([]);
  if (selection.kind === "path") {
    const size = 10 / view.zoom;
    context.fillStyle = "#fff"; context.strokeStyle = "#1769d2"; context.lineWidth = 2 / view.zoom;
    context.fillRect(bounds.x + bounds.w - size / 2, bounds.y + bounds.h - size / 2, size, size);
    context.strokeRect(bounds.x + bounds.w - size / 2, bounds.y + bounds.h - size / 2, size, size);
  }
  context.restore();
}

function render() {
  renderQueued = false;
  if (!currentMap) return;
  const canvas = elements.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#cbd1d5";
  context.fillRect(0, 0, width, height);
  const topLeft = worldToScreen({ x: 0, y: 0 });
  context.save();
  context.shadowColor = "rgba(0,0,0,.24)";
  context.shadowBlur = 16;
  context.fillStyle = currentMap.theme.ground;
  context.fillRect(topLeft.x, topLeft.y, WORLD.width * view.zoom, WORLD.height * view.zoom);
  context.restore();
  context.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, -view.x * dpr * view.zoom, -view.y * dpr * view.zoom);
  context.save();
  context.beginPath(); context.rect(0, 0, WORLD.width, WORLD.height); context.clip();
  context.fillStyle = currentMap.theme.ground; context.fillRect(0, 0, WORLD.width, WORLD.height);
  if (elements.showPaths.checked) {
    context.fillStyle = currentMap.theme.path;
    for (const path of currentMap.paths) {
      context.fillRect(path.x, path.y, path.w, path.h);
      if (view.zoom >= .22) {
        context.fillStyle = currentMap.theme.pathDetail;
        for (let y = path.y + 12; y < path.y + path.h; y += 36) {
          for (let x = path.x + 12; x < path.x + path.w; x += 48) context.fillRect(x, y, 5, 5);
        }
        context.fillStyle = currentMap.theme.path;
      }
    }
  }
  drawGrid();
  if (elements.showDecor.checked) for (const item of currentMap.decor) drawDecoration(item);
  if (elements.showCamps.checked) {
    for (const camp of currentMap.spawnCamps) {
      if (!visibleBounds({ x: camp.x - camp.radius, y: camp.y - camp.radius, w: camp.radius * 2, h: camp.radius * 2 })) continue;
      context.fillStyle = "rgba(218,77,68,.08)"; context.strokeStyle = "rgba(170,45,39,.58)"; context.lineWidth = 2 / view.zoom; context.setLineDash([12 / view.zoom, 7 / view.zoom]); context.beginPath(); context.arc(camp.x, camp.y, camp.radius, 0, Math.PI * 2); context.fill(); context.stroke(); context.setLineDash([]); drawWorldLabel(`${camp.name} · ${camp.count}`, camp.x, camp.y - camp.radius - 10, "#7f2924");
    }
  }
  drawMarkers();
  drawSelection();
  context.restore();
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
elements.mapSelect.addEventListener("change", () => selectMap(elements.mapSelect.value));
elements.assetSearch.addEventListener("input", renderAssets);
elements.undo.addEventListener("click", undo);
elements.redo.addEventListener("click", redo);
elements.saveButton.addEventListener("click", () => void saveMap());
elements.zoomOut.addEventListener("click", () => setZoom(view.zoom / 1.25));
elements.zoomIn.addEventListener("click", () => setZoom(view.zoom * 1.25));
elements.zoomLabel.addEventListener("click", fitMap);
elements.canvas.addEventListener("pointerdown", beginPointer);
elements.canvas.addEventListener("pointermove", movePointer);
elements.canvas.addEventListener("pointerup", endPointer);
elements.canvas.addEventListener("pointercancel", endPointer);
elements.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  setZoom(view.zoom * Math.exp(-event.deltaY * .0014), canvasPoint(event));
}, { passive: false });
[elements.showDecor, elements.showPaths, elements.showCamps, elements.showMarkers, elements.showGrid].forEach((input) => input.addEventListener("change", queueRender));
elements.gridSize.addEventListener("change", queueRender);
window.addEventListener("resize", queueRender);
window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

window.addEventListener("keydown", (event) => {
  const editingText = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (event.code === "Space" && !editingText) { spaceHeld = true; event.preventDefault(); }
  if (editingText) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); void saveMap(); }
  else if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); redo(); }
  else if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
  else if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  else if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); }
  else if (modifier && event.key.toLowerCase() === "c" && selectedEntity()) { clipboard = { kind: selection.kind, value: clone(selectedEntity()) }; }
  else if (modifier && event.key.toLowerCase() === "v" && clipboard) { event.preventDefault(); pasteClipboard(); }
  else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); }
  else if (event.key === "Escape") { if (addMode) cancelAddMode(); else { selection = null; refreshPanels(); queueRender(); } }
  else if (event.key.toLowerCase() === "v") setTool("select");
  else if (event.key.toLowerCase() === "h") setTool("pan");
  else if (event.key.startsWith("Arrow") && selection) {
    event.preventDefault();
    const amount = (elements.snapGrid.checked ? gridSize() : 1) * (event.shiftKey ? 10 : 1);
    nudgeSelection(event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0);
  }
});
window.addEventListener("keyup", (event) => { if (event.code === "Space") spaceHeld = false; });

function pasteClipboard() {
  if (!clipboard || !currentMap || ["arrival", "boss", "pickup"].includes(clipboard.kind)) return;
  if (clipboard.kind === "portal" && currentMap.status === "live") {
    showToast("Live-map portal connections are protected.", true);
    return;
  }
  if (clipboard.kind === "decor" && clipboard.value.type === "upgradeBench" && (
    currentMap.templateId !== "intermediate_snowlands" ||
    currentMap.decor.some((decor) => decor.type === "upgradeBench")
  )) {
    showToast("A Snowlands-based map can have one Upgrade Bench.", true);
    return;
  }
  mutate(() => {
    const copy = clone(clipboard.value); copy.x = Math.min(4800, copy.x + 25); copy.y = Math.min(4800, copy.y + 25);
    if (clipboard.kind === "path") { currentMap.paths.push(copy); selection = { kind: "path", index: currentMap.paths.length - 1 }; }
    else if (clipboard.kind === "decor") { currentMap.decor.push(copy); selection = { kind: "decor", index: currentMap.decor.length - 1 }; }
    else if (clipboard.kind === "camp") { copy.name = `${copy.name} Copy`; currentMap.spawnCamps.push(copy); selection = { kind: "camp", index: currentMap.spawnCamps.length - 1 }; }
    else if (clipboard.kind === "portal" && currentMap.gameplay.portals.length < 2) { copy.depth = copy.y; currentMap.gameplay.portals.push(copy); selection = { kind: "portal", index: currentMap.gameplay.portals.length - 1 }; }
  });
}

elements.newMap.addEventListener("click", () => {
  cancelAddMode();
  elements.newMapName.value = "";
  elements.newMapId.value = "";
  elements.newMapId.dataset.touched = "false";
  elements.newMapTemplate.value = currentMap?.status === "live" ? currentMap.id : currentMap?.templateId ?? maps[0]?.id;
  elements.dialog.showModal();
  elements.newMapName.focus();
});
elements.newMapName.addEventListener("input", () => {
  if (elements.newMapId.dataset.touched !== "true") elements.newMapId.value = slugify(elements.newMapName.value);
});
elements.newMapId.addEventListener("input", () => { elements.newMapId.dataset.touched = "true"; elements.newMapId.value = slugify(elements.newMapId.value); });
elements.closeNewMap.addEventListener("click", () => elements.dialog.close());
elements.cancelNewMap.addEventListener("click", () => elements.dialog.close());
elements.newMapForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.newMapName.value.trim();
  const id = slugify(elements.newMapId.value);
  if (!name || id.length < 2) return showToast("Enter a map name and a valid map ID.", true);
  createDraft(name, id, elements.newMapTemplate.value);
});
elements.importFile.addEventListener("change", () => { const file = elements.importFile.files?.[0]; if (file) void importMap(file); });

void reloadCatalog().catch((error) => {
  setErrorState("Local editor service disconnected");
  elements.inspector.innerHTML = `<section><h2>Editor unavailable</h2><p class="status-note draft">Reopen <strong>Open WildStat Map Editor.command</strong>, then reload this browser tab.</p><button type="button" data-retry-load>Try again</button></section>`;
  elements.inspector.querySelector("[data-retry-load]")?.addEventListener("click", () => window.location.reload());
  showToast(error.message || "Reopen the map editor launcher, then try again.", true);
});
