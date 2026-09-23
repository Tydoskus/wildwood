// The preview mirrors boss-renderer: the sheet is drawn at drawWidth x
// drawHeight centred on the anchor plus the sprite's Y offset, the hitbox is
// an ellipse around that anchor, the status bar hangs off the artwork's top,
// and the shadow sits at the ground offset.

const view = document.getElementById("view");
const ctx = view.getContext("2d");
const listEl = document.getElementById("list");
const controlsEl = document.getElementById("controls");

const SCALE = 0.8;
const CENTRE = { x: view.width / 2, y: view.height / 2 + 60 };
const toScreen = (x, y) => [CENTRE.x + x * SCALE, CENTRE.y + y * SCALE];
const toWorld = (x, y) => [(x - CENTRE.x) / SCALE, (y - CENTRE.y) / SCALE];

let bosses = [];
let current = 0;
let sheets = new Map();
let drag = null;

const FIELDS = [
  { group: "Hitbox", key: "radius", label: "Width (radius)", min: 40, max: 320 },
  { group: "Hitbox", key: "verticalRadius", label: "Height (radius)", min: 20, max: 320 },
  { group: "Hitbox", key: "hitboxOffsetY", label: "Centre, down from anchor", min: -160, max: 220 },
  { group: "Floating HUD", key: "artTop", label: "Status bar anchor", min: -400, max: 40 },
  { group: "Shadow", key: "groundOffset", label: "Shadow height", min: -60, max: 320 },
];

function boss() { return bosses[current]; }

function sheetFor(row) {
  if (sheets.has(row.id)) return sheets.get(row.id);
  const image = new Image();
  image.src = `/assets/wildstat/${row.sheet}`;
  image.onload = () => draw();
  sheets.set(row.id, image);
  return image;
}

function drawBoss(row) {
  const image = sheetFor(row);
  if (!image.complete || !image.naturalWidth) return;
  const columns = row.frames;
  const rows = row.rows ?? 1;
  const cellW = image.naturalWidth / columns;
  const cellH = image.naturalHeight / rows;
  // The spider is sized from its width and stands on a baseline; the rest are
  // drawn into a fixed box. Both are what the renderer does.
  const drawH = row.drawHeight || row.drawWidth * cellH / cellW;
  const top = row.drawHeight
    ? row.spriteY - drawH / 2
    : row.groundOffset - drawH * (row.groundBaseline ?? 0.88);
  const [x, y] = toScreen(-row.drawWidth / 2, top);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, cellW, cellH, x, y, row.drawWidth * SCALE, drawH * SCALE);
}

function draw() {
  const row = boss();
  ctx.fillStyle = "#17301f";
  ctx.fillRect(0, 0, view.width, view.height);
  if (!row) return;

  // Ground line, so the shadow and the feet have something to sit against.
  const [, groundY] = toScreen(0, row.groundOffset);
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(view.width, groundY); ctx.stroke();

  drawBoss(row);

  // Shadow.
  const [shadowX, shadowY] = toScreen(0, row.groundOffset);
  ctx.strokeStyle = "#6fd0ff";
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, row.shadowWidth / 2 * SCALE, row.shadowWidth / 6 * SCALE, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Hitbox.
  const [hitX, hitY] = toScreen(0, row.hitboxOffsetY);
  ctx.strokeStyle = "#ff40a0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(hitX, hitY, row.radius * SCALE, (row.verticalRadius ?? row.radius) * SCALE, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Anchor: the point the server measures from.
  const [ax, ay] = toScreen(0, 0);
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(ax - 9, ay); ctx.lineTo(ax + 9, ay);
  ctx.moveTo(ax, ay - 9); ctx.lineTo(ax, ay + 9);
  ctx.stroke();

  // Status bar, drawn where the real one sits above the artwork.
  const barTop = (row.artTop ?? row.spriteY - (row.drawHeight || 0) / 2) + row.spriteY * 0;
  const [barX, barY] = toScreen(-165, barTop - 34);
  ctx.fillStyle = "rgba(0,0,0,.85)";
  ctx.fillRect(barX, barY, 330 * SCALE, 23 * SCALE);
  ctx.fillStyle = "#ffd24a";
  ctx.fillRect(barX, barY, 330 * SCALE * 0.72, 23 * SCALE);
  ctx.fillStyle = "#ffd24a";
  ctx.font = "600 12px system-ui";
  ctx.fillText(row.name.toUpperCase(), barX, barY - 6);
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
      const out = document.createElement("output");
      const value = row[field.key] ?? (field.key === "verticalRadius" ? row.radius : 0);
      out.textContent = Math.round(value);
      label.append(text, out);
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(field.min);
      input.max = String(field.max);
      input.value = String(Math.round(value));
      input.addEventListener("input", () => {
        row[field.key] = Number(input.value);
        out.textContent = input.value;
        draw();
      });
      wrap.append(label, input);
      set.append(wrap);
    }
    controlsEl.append(set);
  }

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
    button.addEventListener("click", () => { current = index; renderList(); renderControls(); draw(); });
    listEl.append(button);
  });
}

// Dragging the ring moves the body; dragging near its edge resizes.
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

async function load() {
  bosses = await (await fetch("/api/bosses")).json();
  for (const row of bosses) if (row.verticalRadius === null) row.verticalRadius = row.radius;
  for (const row of bosses) if (row.artTop === null) row.artTop = row.spriteY - (row.drawHeight || 440) / 2;
  renderList();
  renderControls();
  draw();
}

load();
