import { centerFramesOnGround, keepLargestFrameComponents, removeGreenPixels, repackLargestComponentsIntoFrames } from "/sprite-pixels.js";

// The preview mirrors boss-renderer: the sheet is drawn at drawWidth x
// drawHeight centred on the anchor plus the sprite's Y offset, the hitbox is
// an ellipse around that anchor, the status bar hangs off the artwork's top,
// and the shadow sits at the ground offset.

const view = document.getElementById("view");
const ctx = view.getContext("2d");
const listEl = document.getElementById("list");
const controlsEl = document.getElementById("controls");
const frameBarEl = document.getElementById("frames");
const titleEl = document.getElementById("preview-title");
const saveEl = document.getElementById("save");
const reloadEl = document.getElementById("reload");
const revertEl = document.getElementById("revert-boss");
const statusEl = document.getElementById("status");
const dirtyCountEl = document.getElementById("dirty-count");

const SCALE = 1;
const CENTRE = { x: view.width / 2, y: view.height / 2 + 20 };
const toScreen = (x, y) => [CENTRE.x + x * SCALE, CENTRE.y + y * SCALE];
const toWorld = (x, y) => [(x - CENTRE.x) / SCALE, (y - CENTRE.y) / SCALE];

let bosses = [];
let current = 0;
let frame = 0;
let playing = false;
const sheets = new Map();
const baseline = new Map();
const baselineRows = new Map();
const fieldInputs = new Map();
let frameButtons = [];
let playButton = null;
let cropSet = null;
let saving = false;
let drag = null;

const FIELDS = [
  { group: "Hit area", key: "radius", label: "Half width", min: 40, max: 320 },
  { group: "Hit area", key: "verticalRadius", label: "Half height", min: 20, max: 320 },
  { group: "Hit area", key: "hitboxOffsetY", label: "Centre below anchor", min: -160, max: 220 },
  { group: "Artwork", key: "spriteY", label: "Vertical position", min: -320, max: 320 },
  { group: "Status bar", key: "artTop", label: "Vertical anchor", min: -400, max: 40 },
  { group: "Shadow", key: "groundOffset", label: "Ground offset", min: -60, max: 320 },
  { group: "Depth", key: "depthOffset", label: "Player overlap line", min: -60, max: 400 },
];

const GROUP_HELP = {
  "Hit area": "The pink ellipse is where attacks connect. These sizes are radii, measured from its centre.",
  Artwork: "Moves the sprite. On most bosses the shadow and status bar move with it, as they do in game.",
  "Status bar": "Moves the health bar relative to the artwork's top.",
  Shadow: "Moves the blue ground guide without changing player overlap.",
  Depth: "Players above the purple line draw behind this boss; players below it draw in front.",
};

const boss = () => bosses[current];

function editableSnapshot(row) {
  const values = Object.fromEntries(FIELDS.map(({ key }) => [key, Number(row[key])]));
  const crops = Object.fromEntries(Object.entries(row.crops ?? {}).map(([index, crop]) => [
    index,
    Object.fromEntries(CROP_FIELDS.filter(({ key }) => Number(crop[key] ?? 0) !== 0)
      .map(({ key }) => [key, Number(crop[key])])),
  ]).filter(([, crop]) => Object.keys(crop).length));
  return JSON.stringify({ values, crops });
}

const isDirty = (row) => editableSnapshot(row) !== baseline.get(row.id);
const changedBosses = () => bosses.filter(isDirty);

function setStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", error);
}

function updateSaveState() {
  const count = changedBosses().length;
  dirtyCountEl.textContent = count ? `${count} boss${count === 1 ? "" : "es"} with unsaved changes` : "All changes saved";
  dirtyCountEl.classList.toggle("is-dirty", count > 0);
  saveEl.disabled = !count || saving;
  reloadEl.disabled = saving;
  revertEl.disabled = !boss() || !isDirty(boss());
}

const CROP_FIELDS = [
  { key: "sourceX", label: "Crop left", min: -200, max: 200 },
  { key: "sourceY", label: "Crop top", min: -200, max: 200 },
  { key: "sourceWidth", label: "Crop width", min: -400, max: 400 },
  { key: "sourceHeight", label: "Crop height", min: -400, max: 400 },
  { key: "offsetX", label: "Move across", min: -200, max: 200 },
  { key: "offsetY", label: "Move down", min: -200, max: 200 },
  { key: "scale", label: "Scale", min: -0.6, max: 0.6, step: 0.01 },
  { key: "statusOffsetY", label: "Move status bar", min: -200, max: 200 },
];

/** Every field defaults to zero, so an untouched frame draws as it always did. */
function cropFor(row, index) {
  const saved = row.crops?.[String(index)] ?? {};
  return Object.fromEntries(CROP_FIELDS.map((field) => [field.key, Number(saved[field.key] ?? 0)]));
}

function setCrop(row, index, key, value) {
  row.crops ??= {};
  row.crops[String(index)] ??= {};
  row.crops[String(index)][key] = Number(value);
}

function sheetFor(row) {
  if (sheets.has(row.id)) return sheets.get(row.id);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    // Use the game's exact preprocessing so the crop and hit area guides sit
    // around the pixels players actually see, including its frame recentering.
    if (["SPIDER", "FROSTCLAW", "MAGMALISK", "GLOOMROOT", "TIDEWYRM", "KOI_SHOGUN"].includes(row.id)) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      removeGreenPixels(pixels.data, row.id === "SPIDER" ? 135 : 145, row.id === "SPIDER" ? 1.35 : 1.45);
      if (row.id === "MAGMALISK") repackLargestComponentsIntoFrames(pixels.data, canvas.width, canvas.height, 4);
      else if (["SPIDER", "FROSTCLAW", "TIDEWYRM", "KOI_SHOGUN"].includes(row.id)) {
        keepLargestFrameComponents(pixels.data, canvas.width, canvas.height, 4);
        centerFramesOnGround(pixels.data, canvas.width, canvas.height, 4);
      }
      context.putImageData(pixels, 0, 0);
    }
    sheets.set(row.id, canvas);
    draw();
  };
  image.onerror = () => setStatus(`Could not load ${row.sheet}.`, true);
  sheets.set(row.id, image);
  image.src = `/assets/wildstat/${row.sheet}`;
  return image;
}

/** Where the sprite's box lands, in world units around the anchor. */
function spriteBox(row, image) {
  const columns = row.frames;
  const rows = row.rows ?? 1;
  const cellW = image.width / columns;
  const cellH = image.height / rows;
  const height = row.drawHeight || row.drawWidth * cellH / cellW;
  // The scorpion is sized from its width and placed from its feet; every other
  // boss is drawn into a fixed box centred on its own offset. Either way the
  // artwork answers to its own number and nothing else.
  const top = row.drawHeight
    ? row.spriteY + (row.spriteNudge ?? 0) - height / 2
    : row.spriteY - height * (row.groundBaseline ?? 0.88);
  return { cellW, cellH, width: row.drawWidth, height, top };
}

function drawBoss(row) {
  const image = sheetFor(row);
  if (!(image instanceof HTMLCanvasElement)) return null;
  const box = spriteBox(row, image);
  const columns = row.frames;
  const index = frame % (columns * (row.rows ?? 1));
  // Mirrors drawBossSheetFrame: the source window moves and grows inside the
  // cell, and the draw box keeps its proportions rather than stretching.
  const crop = cropFor(row, index);
  const sourceX = (index % columns) * box.cellW + crop.sourceX;
  const sourceY = Math.floor(index / columns) * box.cellH + crop.sourceY;
  const sourceW = box.cellW + crop.sourceWidth;
  const sourceH = box.cellH + crop.sourceHeight;
  if (sourceW <= 0 || sourceH <= 0) return box;
  const scale = 1 + crop.scale;
  const width = box.width * (sourceW / box.cellW) * scale;
  const height = box.height * (sourceH / box.cellH) * scale;
  const drawTop = row.drawHeight ? box.top + (box.height - height) / 2 : box.top;
  const [x, y] = toScreen(-width / 2 + crop.offsetX, drawTop + crop.offsetY);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, x, y, width * SCALE, height * SCALE);

  // The cell the artwork is drawn into, so the empty air above a short boss is
  // visible rather than something you have to infer from the bar floating.
  const [cellX, cellY] = toScreen(-box.width / 2, box.top);
  ctx.strokeStyle = "rgba(255,255,255,.1)";
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(cellX, cellY, box.width * SCALE, box.height * SCALE);
  ctx.setLineDash([]);
  return box;
}

function draw() {
  const row = boss();
  ctx.fillStyle = "#17301f";
  ctx.fillRect(0, 0, view.width, view.height);
  if (!row) return;

  const shadowOffset = row.groundOffset + (row.shadowFollowsSprite ? row.spriteY : 0);
  const [, groundY] = toScreen(0, shadowOffset);
  ctx.strokeStyle = "rgba(255,255,255,.1)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(view.width, groundY); ctx.stroke();

  // Where the boss sorts. A player whose feet are above this line draws behind
  // it, and one below draws in front.
  const [, depthY] = toScreen(0, row.depthOffset);
  ctx.strokeStyle = "rgba(160,140,255,.55)";
  ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(0, depthY); ctx.lineTo(view.width, depthY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(160,140,255,.9)";
  ctx.font = "600 11px system-ui";
  ctx.fillText("depth", 8, depthY - 5);

  drawBoss(row);

  const [shadowX, shadowY] = toScreen(0, shadowOffset);
  ctx.strokeStyle = "#6fd0ff";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, row.shadowWidth / 2 * SCALE, row.shadowWidth / 6 * SCALE, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const [hitX, hitY] = toScreen(0, row.hitboxOffsetY);
  ctx.strokeStyle = "#ff40a0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(hitX, hitY, row.radius * SCALE, (row.verticalRadius ?? row.radius) * SCALE, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ff4ba6";
  for (const [hx, hy] of [[row.radius, 0], [-row.radius, 0], [0, row.verticalRadius], [0, -row.verticalRadius]]) {
    const [handleX, handleY] = toScreen(hx, row.hitboxOffsetY + hy);
    ctx.beginPath(); ctx.arc(handleX, handleY, 6, 0, Math.PI * 2); ctx.fill();
  }

  const [ax, ay] = toScreen(0, 0);
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(ax - 9, ay); ctx.lineTo(ax + 9, ay);
  ctx.moveTo(ax, ay - 9); ctx.lineTo(ax, ay + 9);
  ctx.stroke();

  const statusAnchor = row.artTop + (row.statusFollowsSprite ? row.spriteY : 0) + cropFor(row, frame).statusOffsetY;
  const [barX, barY] = toScreen(-row.barWidth / 2, statusAnchor - row.barGap);
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillRect(barX, barY, row.barWidth * SCALE, row.barHeight * SCALE);
  ctx.fillStyle = "#ffd24a";
  ctx.fillRect(barX, barY, row.barWidth * SCALE * 0.72, row.barHeight * SCALE);
  ctx.font = "600 12px system-ui";
  ctx.fillText(row.name.toUpperCase(), barX, barY - 6);
}

function updateFrameSelection() {
  const selected = frame % (boss()?.frames * (boss()?.rows ?? 1) || 1);
  frameButtons.forEach((button, index) => {
    button.classList.toggle("is-active", index === selected);
    button.setAttribute("aria-pressed", String(index === selected));
  });
}

function renderFrames() {
  const row = boss();
  frameBarEl.replaceChildren();
  frameButtons = [];
  if (!row) return;
  const play = document.createElement("button");
  play.className = "ghost";
  play.textContent = playing ? "Pause" : "Play frames";
  play.setAttribute("aria-label", playing ? "Pause frame preview" : "Play frame preview");
  play.addEventListener("click", () => {
    playing = !playing;
    play.textContent = playing ? "Pause" : "Play frames";
    play.setAttribute("aria-label", playing ? "Pause frame preview" : "Play frame preview");
    if (playing) cropSet.disabled = true;
    else renderControls();
  });
  playButton = play;
  frameBarEl.append(play);
  const total = row.frames * (row.rows ?? 1);
  for (let index = 0; index < total; index += 1) {
    const button = document.createElement("button");
    const name = row.frameNames?.[index] ?? `frame ${index}`;
    const unused = /never drawn/.test(name);
    button.className = `chip${unused ? " is-unused" : ""}`;
    button.textContent = name;
    button.title = unused ? "This frame is not selected by the game" : `Inspect ${name}`;
    button.addEventListener("click", () => {
      playing = false;
      playButton.textContent = "Play frames";
      playButton.setAttribute("aria-label", "Play frame preview");
      frame = index;
      updateFrameSelection();
      renderControls();
      draw();
    });
    frameBarEl.append(button);
    frameButtons.push(button);
  }
  const note = document.createElement("span");
  note.className = "frame-note";
  note.textContent = row.frameNote
    ?? "Size the hitbox to the pose the boss holds, not the one it reaches in.";
  frameBarEl.append(note);
  updateFrameSelection();
}

function fieldControl(field, value, onChange, idPrefix) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = field.label;
  const number = document.createElement("input");
  number.id = `${idPrefix}-${field.key}`;
  number.type = "number";
  number.className = "number";
  number.min = String(field.min);
  number.max = String(field.max);
  number.step = String(field.step ?? 1);
  number.value = String(value);
  label.htmlFor = number.id;
  label.append(text, number);
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(field.min);
  range.max = String(field.max);
  range.step = String(field.step ?? 1);
  range.value = String(value);
  range.setAttribute("aria-label", `${field.label} slider`);
  const apply = (raw) => {
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) {
      number.value = range.value;
      return;
    }
    const next = Math.max(field.min, Math.min(field.max, parsed));
    number.value = String(next);
    range.value = String(next);
    onChange(next);
  };
  range.addEventListener("input", () => apply(range.value));
  number.addEventListener("input", () => {
    const parsed = Number(number.value);
    if (!number.value.trim() || !Number.isFinite(parsed) || parsed < field.min || parsed > field.max) return;
    range.value = number.value;
    onChange(parsed);
  });
  number.addEventListener("change", () => apply(number.value));
  wrap.append(label, range);
  return { wrap, number, range };
}

function renderControls() {
  const row = boss();
  if (!row) return;
  controlsEl.replaceChildren();
  fieldInputs.clear();
  const groups = new Map();
  for (const field of FIELDS) {
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }
  for (const [group, fields] of groups) {
    const set = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group;
    const help = document.createElement("p");
    help.className = "group-help";
    help.textContent = group === "Artwork" && !row.statusFollowsSprite
      ? "Moves this sprite alone. Its shadow and status bar have their own anchors."
      : group === "Status bar" && !row.statusFollowsSprite
        ? "Moves this boss's health bar independently from its artwork."
        : GROUP_HELP[group];
    set.append(legend, help);
    for (const field of fields) {
      const control = fieldControl(field, row[field.key] ?? 0, (value) => {
        row[field.key] = value;
        renderList();
        updateSaveState();
        draw();
      }, "boss");
      fieldInputs.set(field.key, control);
      set.append(control.wrap);
    }
    controlsEl.append(set);
  }

  cropSet = document.createElement("fieldset");
  const cropLegend = document.createElement("legend");
  const index = frame % (row.frames * (row.rows ?? 1));
  cropLegend.textContent = `Frame · ${row.frameNames?.[index] ?? index}`;
  const help = document.createElement("p");
  help.className = "group-help";
  help.textContent = "Corrections for this frame only. Pause playback to edit them.";
  cropSet.append(cropLegend, help);
  const crop = cropFor(row, index);
  for (const field of CROP_FIELDS) {
    const control = fieldControl(field, crop[field.key], (value) => {
      setCrop(row, index, field.key, value);
      renderList();
      updateSaveState();
      draw();
    }, "crop");
    cropSet.append(control.wrap);
  }
  const reset = document.createElement("button");
  reset.className = "ghost";
  reset.textContent = "Clear frame corrections";
  reset.addEventListener("click", () => {
    if (row.crops) delete row.crops[String(index)];
    renderControls();
    renderList();
    updateSaveState();
    draw();
  });
  cropSet.append(reset);
  cropSet.disabled = playing;
  controlsEl.append(cropSet);
}

function syncBossFields() {
  for (const [key, { number, range }] of fieldInputs) {
    number.value = String(boss()[key]);
    range.value = String(boss()[key]);
  }
}

function renderList() {
  listEl.replaceChildren();
  bosses.forEach((row, index) => {
    const button = document.createElement("button");
    button.className = index === current ? "is-active" : "";
    if (index === current) button.setAttribute("aria-current", "true");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = row.name;
    const detail = document.createElement("small");
    detail.textContent = `Hit area ${Math.round(row.radius)} × ${Math.round(row.verticalRadius ?? row.radius)}`;
    copy.append(title, detail);
    button.append(copy);
    if (isDirty(row)) {
      const mark = document.createElement("span");
      mark.className = "dirty-mark";
      mark.setAttribute("aria-label", "Unsaved changes");
      button.append(mark);
    }
    button.addEventListener("click", () => {
      current = index; frame = 0; playing = false;
      titleEl.textContent = row.name;
      renderList(); renderControls(); renderFrames(); updateSaveState(); draw();
      listEl.querySelectorAll("button")[index]?.focus();
    });
    listEl.append(button);
  });
}

saveEl.addEventListener("click", async () => {
  const edits = changedBosses();
  if (!edits.length || saving) return;
  const payload = edits.map((row) => structuredClone(row));
  saving = true;
  updateSaveState();
  setStatus(`Saving ${edits.length} boss${edits.length === 1 ? "" : "es"}…`);
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    for (const row of payload) {
      baseline.set(row.id, editableSnapshot(row));
      baselineRows.set(row.id, row);
    }
    setStatus(`Saved ${body.saved.length} boss${body.saved.length === 1 ? "" : "es"} to disk.`);
    renderList();
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, true);
  } finally {
    saving = false;
    updateSaveState();
  }
});

reloadEl.addEventListener("click", () => {
  if (changedBosses().length && !confirm("Discard unsaved boss changes and reload from disk?")) return;
  void load();
});

revertEl.addEventListener("click", () => {
  const row = boss();
  if (!row || !isDirty(row)) return;
  const saved = baselineRows.get(row.id);
  bosses[current] = structuredClone(saved);
  renderList(); renderControls(); renderFrames(); updateSaveState(); draw();
  setStatus(`Reverted ${row.name} to its saved values.`);
});

window.addEventListener("beforeunload", (event) => {
  if (!changedBosses().length) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
  event.preventDefault();
  saveEl.click();
});

function pointerWorld(event) {
  const rect = view.getBoundingClientRect();
  return toWorld(
    (event.clientX - rect.left) * view.width / rect.width,
    (event.clientY - rect.top) * view.height / rect.height,
  );
}

function dragMode(row, wx, wy) {
  const dy = wy - row.hitboxOffsetY;
  const vertical = row.verticalRadius;
  if (Math.hypot(Math.abs(wx) - row.radius, dy) < 22) return "width";
  if (Math.hypot(wx, Math.abs(dy) - vertical) < 22) return "height";
  if ((wx / row.radius) ** 2 + (dy / vertical) ** 2 <= 1.08) return "move";
  return null;
}

view.addEventListener("pointerdown", (event) => {
  const row = boss();
  if (!row) return;
  const [wx, wy] = pointerWorld(event);
  const mode = dragMode(row, wx, wy);
  if (!mode) return;
  event.preventDefault();
  drag = { mode, wy, offset: row.hitboxOffsetY };
  view.classList.add("is-dragging");
  view.setPointerCapture(event.pointerId);
});

view.addEventListener("pointermove", (event) => {
  const row = boss();
  if (!row) return;
  const [wx, wy] = pointerWorld(event);
  if (!drag) {
    const mode = dragMode(row, wx, wy);
    view.style.cursor = mode === "width" ? "ew-resize" : mode === "height" ? "ns-resize" : mode ? "grab" : "default";
    return;
  }
  if (drag.mode === "width") row.radius = Math.max(40, Math.min(320, Math.round(Math.abs(wx))));
  else if (drag.mode === "height") row.verticalRadius = Math.max(20, Math.min(320, Math.round(Math.abs(wy - row.hitboxOffsetY))));
  else row.hitboxOffsetY = Math.max(-160, Math.min(220, Math.round(drag.offset + (wy - drag.wy))));
  syncBossFields();
  renderList();
  updateSaveState();
  draw();
});

const endDrag = () => { drag = null; view.classList.remove("is-dragging"); };
view.addEventListener("pointerup", endDrag);
view.addEventListener("pointercancel", endDrag);

// Frames run at the pace the sheets were authored for: slow enough to read.
let last = 0;
function tick(now) {
  if (playing && now - last > 320) {
    last = now;
    const row = boss();
    if (row) {
      const total = row.frames * (row.rows ?? 1);
      for (let attempts = 0; attempts < total; attempts += 1) {
        frame = (frame + 1) % total;
        if (!/never drawn/.test(row.frameNames?.[frame] ?? "")) break;
      }
      updateFrameSelection();
    }
    draw();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

async function load() {
  try {
    const response = await fetch("/api/bosses");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const loaded = await response.json();
    if (!Array.isArray(loaded) || !loaded.length) throw new Error("No bosses were returned");
    bosses = loaded;
    for (const row of bosses) {
      if (row.verticalRadius === null) row.verticalRadius = row.radius;
      if (row.artTop === null) row.artTop = row.spriteY - (row.drawHeight || 440) / 2;
    }
    baseline.clear();
    baselineRows.clear();
    for (const row of bosses) {
      baseline.set(row.id, editableSnapshot(row));
      baselineRows.set(row.id, structuredClone(row));
    }
    current = Math.min(current, bosses.length - 1);
    frame = 0;
    playing = false;
    titleEl.textContent = boss().name;
    renderList();
    renderControls();
    renderFrames();
    updateSaveState();
    draw();
    setStatus("Drag the hit area or use the controls. Press ⌘/Ctrl+S to save changes.");
  } catch (error) {
    setStatus(`Could not load bosses: ${error.message}`, true);
  }
}

load();
