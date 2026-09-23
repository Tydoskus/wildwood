// The preview mirrors boss-renderer: the sheet is drawn at drawWidth x
// drawHeight centred on the anchor plus the sprite's Y offset, the hitbox is
// an ellipse around that anchor, the status bar hangs off the artwork's top,
// and the shadow sits at the ground offset.

const view = document.getElementById("view");
const ctx = view.getContext("2d");
const listEl = document.getElementById("list");
const controlsEl = document.getElementById("controls");
const frameBarEl = document.getElementById("frames");

const SCALE = 0.78;
const CENTRE = { x: view.width / 2, y: view.height / 2 + 70 };
const toScreen = (x, y) => [CENTRE.x + x * SCALE, CENTRE.y + y * SCALE];
const toWorld = (x, y) => [(x - CENTRE.x) / SCALE, (y - CENTRE.y) / SCALE];

let bosses = [];
let current = 0;
let frame = 0;
let playing = true;
let sheets = new Map();
let drag = null;

const FIELDS = [
  { group: "Hitbox", key: "radius", label: "Width (radius)", min: 40, max: 320 },
  { group: "Hitbox", key: "verticalRadius", label: "Height (radius)", min: 20, max: 320 },
  { group: "Hitbox", key: "hitboxOffsetY", label: "Centre, down from anchor", min: -160, max: 220 },
  { group: "Sprite", key: "spriteY", label: "Artwork height", min: -320, max: 320 },
  { group: "Floating HUD", key: "artTop", label: "Status bar anchor", min: -400, max: 40 },
  { group: "Shadow", key: "groundOffset", label: "Shadow height", min: -60, max: 320 },
  { group: "Depth", key: "depthOffset", label: "Sorts against players at", min: -60, max: 400 },
];

const boss = () => bosses[current];

const CROP_FIELDS = [
  { key: "sourceX", label: "Crop left", min: -200, max: 200 },
  { key: "sourceY", label: "Crop top", min: -200, max: 200 },
  { key: "sourceWidth", label: "Crop width", min: -400, max: 400 },
  { key: "sourceHeight", label: "Crop height", min: -400, max: 400 },
  { key: "offsetX", label: "Move across", min: -200, max: 200 },
  { key: "offsetY", label: "Move down", min: -200, max: 200 },
  { key: "scale", label: "Scale", min: -0.6, max: 0.6, step: 0.01 },
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
  image.src = `/assets/wildstat/${row.sheet}`;
  image.onload = () => draw();
  sheets.set(row.id, image);
  return image;
}

/** Where the sprite's box lands, in world units around the anchor. */
function spriteBox(row, image) {
  const columns = row.frames;
  const rows = row.rows ?? 1;
  const cellW = image.naturalWidth / columns;
  const cellH = image.naturalHeight / rows;
  const height = row.drawHeight || row.drawWidth * cellH / cellW;
  // The scorpion is sized from its width and placed from its feet; every other
  // boss is drawn into a fixed box centred on its own offset. Either way the
  // artwork answers to its own number and nothing else.
  const top = row.drawHeight
    ? row.spriteY - height / 2
    : row.spriteY - height * (row.groundBaseline ?? 0.88);
  return { cellW, cellH, width: row.drawWidth, height, top };
}

function drawBoss(row) {
  const image = sheetFor(row);
  if (!image.complete || !image.naturalWidth) return null;
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
  const [x, y] = toScreen(-width / 2 + crop.offsetX, box.top + (box.height - height) / 2 + crop.offsetY);
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

  const [, groundY] = toScreen(0, row.groundOffset);
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

  const [shadowX, shadowY] = toScreen(0, row.groundOffset);
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

  const [ax, ay] = toScreen(0, 0);
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(ax - 9, ay); ctx.lineTo(ax + 9, ay);
  ctx.moveTo(ax, ay - 9); ctx.lineTo(ax, ay + 9);
  ctx.stroke();

  const [barX, barY] = toScreen(-165, row.artTop - 34);
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillRect(barX, barY, 330 * SCALE, 23 * SCALE);
  ctx.fillStyle = "#ffd24a";
  ctx.fillRect(barX, barY, 330 * SCALE * 0.72, 23 * SCALE);
  ctx.font = "600 12px system-ui";
  ctx.fillText(row.name.toUpperCase(), barX, barY - 6);
}

function renderFrames() {
  const row = boss();
  frameBarEl.replaceChildren();
  if (!row) return;
  const play = document.createElement("button");
  play.className = "ghost";
  play.textContent = playing ? "Pause" : "Play";
  play.addEventListener("click", () => { playing = !playing; renderFrames(); });
  frameBarEl.append(play);
  const total = row.frames * (row.rows ?? 1);
  for (let index = 0; index < total; index += 1) {
    const button = document.createElement("button");
    const name = row.frameNames?.[index] ?? `frame ${index}`;
    const unused = /never drawn/.test(name);
    button.className = `chip${index === frame % total ? " is-active" : ""}${unused ? " is-unused" : ""}`;
    button.textContent = name;
    button.addEventListener("click", () => { playing = false; frame = index; renderFrames(); renderControls(); draw(); });
    frameBarEl.append(button);
  }
  const note = document.createElement("span");
  note.className = "frame-note";
  note.textContent = row.frameNote
    ?? "Size the hitbox to the pose the boss holds, not the one it reaches in.";
  frameBarEl.append(note);
}

function renderControls() {
  const row = boss();
  if (!row) return;
  const groups = new Map();
  for (const field of FIELDS) {
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }
  controlsEl.replaceChildren();
  for (const [group, fields] of groups) {
    const set = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = group;
    set.append(legend);
    for (const field of fields) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      const text = document.createElement("span");
      text.textContent = field.label;
      const number = document.createElement("input");
      number.type = "number";
      number.className = "number";
      label.append(text, number);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(field.min);
      input.max = String(field.max);
      const value = Math.round(row[field.key] ?? 0);
      input.value = String(value);
      number.value = String(value);
      const apply = (next) => {
        row[field.key] = Number(next);
        input.value = String(next);
        number.value = String(next);
        renderList();
        draw();
      };
      input.addEventListener("input", () => apply(input.value));
      number.addEventListener("input", () => apply(number.value));
      wrap.append(label, input);
      if (field.key === "depthOffset") {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "Whether the boss draws in front of or behind a player standing beside it. It used to share a number with the shadow, so nudging one moved the other.";
        wrap.append(hint);
      }
      set.append(wrap);
    }
    controlsEl.append(set);
  }

  // This frame's own correction, below the boss-wide numbers.
  const cropSet = document.createElement("fieldset");
  const cropLegend = document.createElement("legend");
  const total = row.frames * (row.rows ?? 1);
  const index = frame % total;
  cropLegend.textContent = `Frame: ${row.frameNames?.[index] ?? index}`;
  cropSet.append(cropLegend);
  const crop = cropFor(row, index);
  for (const field of CROP_FIELDS) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = field.label;
    const number = document.createElement("input");
    number.type = "number";
    number.className = "number";
    number.step = String(field.step ?? 1);
    number.value = String(crop[field.key]);
    label.append(text, number);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step ?? 1);
    input.value = String(crop[field.key]);
    const apply = (next) => {
      setCrop(row, index, field.key, next);
      input.value = String(next);
      number.value = String(next);
      draw();
    };
    input.addEventListener("input", () => apply(input.value));
    number.addEventListener("input", () => apply(number.value));
    wrap.append(label, input);
    cropSet.append(wrap);
  }
  const reset = document.createElement("button");
  reset.className = "ghost";
  reset.textContent = "Reset this frame";
  reset.addEventListener("click", () => {
    if (row.crops) delete row.crops[String(index)];
    renderControls();
    draw();
  });
  cropSet.append(reset);
  controlsEl.append(cropSet);

  const actions = document.createElement("div");
  actions.className = "actions";
  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = "Save all";
  const reload = document.createElement("button");
  reload.className = "ghost";
  reload.textContent = "Reload";
  const status = document.createElement("span");
  status.id = "status";
  save.addEventListener("click", async () => {
    status.textContent = "Saving…";
    const response = await fetch("/api/save", { method: "POST", body: JSON.stringify(bosses) });
    const body = await response.json();
    status.textContent = response.ok ? `Wrote ${body.saved.length} bosses` : `Failed: ${body.error}`;
  });
  reload.addEventListener("click", () => load());
  actions.append(save, reload, status);
  controlsEl.append(actions);
}

function renderList() {
  listEl.replaceChildren();
  bosses.forEach((row, index) => {
    const button = document.createElement("button");
    button.className = index === current ? "is-active" : "";
    const title = document.createElement("strong");
    title.textContent = row.name;
    const detail = document.createElement("span");
    detail.textContent = `${Math.round(row.radius)} x ${Math.round(row.verticalRadius ?? row.radius)}`;
    button.append(title, detail);
    button.addEventListener("click", () => {
      current = index; frame = 0;
      renderList(); renderControls(); renderFrames(); draw();
    });
    listEl.append(button);
  });
}

view.addEventListener("pointerdown", (event) => {
  const row = boss();
  if (!row) return;
  const rect = view.getBoundingClientRect();
  const [wx, wy] = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  const dy = wy - row.hitboxOffsetY;
  const vertical = row.verticalRadius ?? row.radius;
  const onEdgeX = Math.abs(Math.abs(wx) - row.radius) < 16 && Math.abs(dy) < vertical;
  const onEdgeY = Math.abs(Math.abs(dy) - vertical) < 16 && Math.abs(wx) < row.radius;
  drag = { mode: onEdgeX ? "width" : onEdgeY ? "height" : "move", wy, offset: row.hitboxOffsetY };
  view.classList.add("is-dragging");
  view.setPointerCapture(event.pointerId);
});

view.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const row = boss();
  const rect = view.getBoundingClientRect();
  const [wx, wy] = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  if (drag.mode === "width") row.radius = Math.max(20, Math.round(Math.abs(wx)));
  else if (drag.mode === "height") row.verticalRadius = Math.max(15, Math.round(Math.abs(wy - row.hitboxOffsetY)));
  else row.hitboxOffsetY = Math.round(drag.offset + (wy - drag.wy));
  renderControls();
  renderList();
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
    frame += 1;
    renderFrames();
    renderControls();
    draw();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

async function load() {
  bosses = await (await fetch("/api/bosses")).json();
  for (const row of bosses) {
    if (row.verticalRadius === null) row.verticalRadius = row.radius;
    if (row.artTop === null) row.artTop = row.spriteY - (row.drawHeight || 440) / 2;
  }
  renderList();
  renderControls();
  renderFrames();
  draw();
}

load();
