import { ENEMY_SPRITE_LAYOUTS } from "../src/game/enemy-sprite-layouts.mjs";

const RENDER_Y_OFFSET = -3;
const FILE_FORMAT = "wildstat-enemy-sprite-alignment";
const FILE_VERSION = 1;
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
const element = (id) => document.getElementById(id);
const controls = {
  enemy: element("enemy"), facing: element("facing"), pose: element("pose"), aimAngle: element("aimAngle"),
  zoom: element("zoom"), layerList: element("layerList"), layerX: element("layerX"), layerY: element("layerY"),
  layerWidth: element("layerWidth"), layerHeight: element("layerHeight"), spriteSize: element("spriteSize"),
  spriteHeight: element("spriteHeight"), aimEnabled: element("aimEnabled"), aimProperties: element("aimProperties"),
  pivotX: element("pivotX"), pivotY: element("pivotY"), baseRotation: element("baseRotation"),
  movePivot: element("movePivot"), selectedTitle: element("selectedTitle"), status: element("status"),
  output: element("valueOutput"), referenceInput: element("referenceInput"), referenceImage: element("referenceImage"),
  referenceDrop: element("referenceDrop"), referencePlaceholder: element("referencePlaceholder"),
};

const clone = (value) => typeof structuredClone === "function"
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));
const sourceLayouts = Object.fromEntries(Object.entries(ENEMY_SPRITE_LAYOUTS).filter(([, layout]) => Array.isArray(layout.layers)));
const workingLayouts = clone(sourceLayouts);
const imageCache = new Map();
let selectedLayerIndex = 0;
let referenceUrl = "";
let dragState = null;

function currentLayout() {
  return workingLayouts[controls.enemy.value];
}

function currentLayer() {
  return currentLayout()?.layers[selectedLayerIndex];
}

function filename(source) {
  return source.split("/").at(-1)?.replace(/\.png$/i, "") || source;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanNumber(value) {
  const rounded = Math.round(finiteNumber(value) * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function imageFor(source) {
  if (imageCache.has(source)) return imageCache.get(source);
  const image = new Image();
  image.decoding = "async";
  image.addEventListener("load", draw);
  image.addEventListener("error", draw);
  image.src = source;
  imageCache.set(source, image);
  return image;
}

function rotationFor(layer) {
  const base = finiteNumber(layer.aimOffsetRadians);
  if (!layer.aimPivot || controls.pose.value !== "aiming") return base;
  return base + finiteNumber(controls.aimAngle.value) * Math.PI / 180;
}

function layerBounds(layout) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const layer of layout.layers) {
    top = Math.min(top, layer.y + RENDER_Y_OFFSET);
    bottom = Math.max(bottom, layer.y + RENDER_Y_OFFSET + layer.h);
  }
  return { top, bottom };
}

function stageTransform() {
  return {
    x: canvas.width / 2,
    y: canvas.height * .58,
    zoom: finiteNumber(controls.zoom.value, 4),
    facing: controls.facing.value === "left" ? -1 : 1,
  };
}

function drawLayer(layer, selected) {
  const image = imageFor(layer.src);
  const ready = image.complete && image.naturalWidth > 0;
  context.save();
  if (layer.aimPivot) {
    context.translate(layer.aimPivot.x, layer.aimPivot.y + RENDER_Y_OFFSET);
    context.rotate(rotationFor(layer));
    if (ready) context.drawImage(image, layer.x - layer.aimPivot.x, layer.y - layer.aimPivot.y, layer.w, layer.h);
    if (selected) {
      context.strokeStyle = "#5ff5ff";
      context.lineWidth = 1.5 / stageTransform().zoom;
      context.setLineDash([2.5 / stageTransform().zoom, 2 / stageTransform().zoom]);
      context.strokeRect(layer.x - layer.aimPivot.x, layer.y - layer.aimPivot.y, layer.w, layer.h);
    }
  } else {
    if (ready) context.drawImage(image, layer.x, layer.y + RENDER_Y_OFFSET, layer.w, layer.h);
    if (selected) {
      context.strokeStyle = "#5ff5ff";
      context.lineWidth = 1.5 / stageTransform().zoom;
      context.setLineDash([2.5 / stageTransform().zoom, 2 / stageTransform().zoom]);
      context.strokeRect(layer.x, layer.y + RENDER_Y_OFFSET, layer.w, layer.h);
    }
  }
  context.restore();
}

function draw() {
  const layout = currentLayout();
  if (!layout) return;
  const stage = stageTransform();
  const bounds = layerBounds(layout);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#c99d59";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.save();
  context.globalAlpha = .13;
  context.fillStyle = "#6f522f";
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 97 + 31) % canvas.width;
    const y = (index * 61 + 43) % canvas.height;
    context.beginPath();
    context.ellipse(x, y, 8 + index % 4 * 5, 3 + index % 3 * 2, -.2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const shadowY = stage.y + (bounds.bottom - 2) * stage.zoom;
  context.save();
  context.globalAlpha = .26;
  context.fillStyle = "#273025";
  context.beginPath();
  context.ellipse(stage.x, shadowY, Math.max(34, Math.min(76, layout.size * .9)) * stage.zoom / 2, 8 * stage.zoom, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.translate(stage.x, stage.y);
  context.scale(stage.facing * stage.zoom, stage.zoom);
  context.imageSmoothingEnabled = true;
  layout.layers.forEach((layer, index) => drawLayer(layer, index === selectedLayerIndex));

  const selected = currentLayer();
  if (selected?.aimPivot) {
    const pivotY = selected.aimPivot.y + RENDER_Y_OFFSET;
    context.save();
    context.strokeStyle = "#56f8ff";
    context.fillStyle = "#56f8ff";
    context.lineWidth = 1.5 / stage.zoom;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(selected.aimPivot.x - 5, pivotY);
    context.lineTo(selected.aimPivot.x + 5, pivotY);
    context.moveTo(selected.aimPivot.x, pivotY - 5);
    context.lineTo(selected.aimPivot.x, pivotY + 5);
    context.stroke();
    context.beginPath();
    context.arc(selected.aimPivot.x, pivotY, 1.8, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (controls.pose.value === "aiming") {
    const angle = finiteNumber(controls.aimAngle.value) * Math.PI / 180;
    const origin = selected?.aimPivot ?? { x: 0, y: 0 };
    context.save();
    context.strokeStyle = "#ffeb73";
    context.lineWidth = 1.2 / stage.zoom;
    context.setLineDash([4 / stage.zoom, 3 / stage.zoom]);
    context.beginPath();
    context.moveTo(origin.x, origin.y + RENDER_Y_OFFSET);
    context.lineTo(origin.x + Math.cos(angle) * 72, origin.y + RENDER_Y_OFFSET + Math.sin(angle) * 72);
    context.stroke();
    context.restore();
  }

  context.strokeStyle = "rgba(255,255,255,.42)";
  context.lineWidth = 1 / stage.zoom;
  context.setLineDash([3 / stage.zoom, 3 / stage.zoom]);
  context.beginPath();
  context.moveTo(-8, 0); context.lineTo(8, 0);
  context.moveTo(0, -8); context.lineTo(0, 8);
  context.stroke();
  context.restore();
}

function populateEnemies() {
  for (const name of Object.keys(sourceLayouts)) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    controls.enemy.append(option);
  }
  controls.enemy.value = sourceLayouts["Dune Archer"] ? "Dune Archer" : Object.keys(sourceLayouts)[0];
}

function preferredLayerIndex(layout) {
  const bowIndex = layout.layers.findIndex((layer) => /bow\.png$/i.test(layer.src));
  return bowIndex >= 0 ? bowIndex : Math.max(0, layout.layers.length - 1);
}

function populateLayers() {
  const layout = currentLayout();
  controls.layerList.replaceChildren();
  layout.layers.forEach((layer, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-button";
    button.setAttribute("aria-pressed", String(index === selectedLayerIndex));
    button.title = layer.src;
    const order = document.createElement("span");
    order.className = "layer-order";
    order.textContent = String(index + 1);
    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = filename(layer.src);
    button.append(order, name);
    button.addEventListener("click", () => selectLayer(index));
    controls.layerList.append(button);
  });
}

function selectLayer(index) {
  selectedLayerIndex = Math.max(0, Math.min(currentLayout().layers.length - 1, index));
  populateLayers();
  syncPropertyControls();
  refreshOutput();
  draw();
}

function syncPropertyControls() {
  const layout = currentLayout();
  const layer = currentLayer();
  controls.selectedTitle.textContent = `Selected: ${filename(layer.src)}`;
  controls.layerX.value = cleanNumber(layer.x);
  controls.layerY.value = cleanNumber(layer.y);
  controls.layerWidth.value = cleanNumber(layer.w);
  controls.layerHeight.value = cleanNumber(layer.h);
  controls.spriteSize.value = cleanNumber(layout.size);
  controls.spriteHeight.value = cleanNumber(layout.height);
  controls.aimEnabled.checked = Boolean(layer.aimPivot);
  controls.aimProperties.hidden = !layer.aimPivot;
  controls.pivotX.value = layer.aimPivot ? cleanNumber(layer.aimPivot.x) : "";
  controls.pivotY.value = layer.aimPivot ? cleanNumber(layer.aimPivot.y) : "";
  controls.baseRotation.value = cleanNumber(finiteNumber(layer.aimOffsetRadians) * 180 / Math.PI);
}

function alignmentPayload() {
  const layout = clone(currentLayout());
  for (const layer of layout.layers) {
    layer.x = cleanNumber(layer.x);
    layer.y = cleanNumber(layer.y);
    layer.w = cleanNumber(layer.w);
    layer.h = cleanNumber(layer.h);
    if (layer.aimPivot) {
      layer.aimPivot.x = cleanNumber(layer.aimPivot.x);
      layer.aimPivot.y = cleanNumber(layer.aimPivot.y);
      layer.aimOffsetRadians = cleanNumber(layer.aimOffsetRadians);
    } else {
      delete layer.aimOffsetRadians;
    }
  }
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    enemy: controls.enemy.value,
    sprite: layout,
    preview: {
      facing: controls.facing.value,
      state: controls.pose.value,
      aimAngleDegrees: finiteNumber(controls.aimAngle.value),
      zoom: finiteNumber(controls.zoom.value),
    },
  };
}

function typeScriptSnippet() {
  const { enemy, sprite } = alignmentPayload();
  const lines = [
    `  ${JSON.stringify(enemy)}: {`,
    `    size: ${sprite.size},`,
    `    height: ${sprite.height},`,
    "    layers: [",
  ];
  for (const layer of sprite.layers) {
    const fields = [
      `src: ${JSON.stringify(layer.src)}`,
      `x: ${layer.x}`,
      `y: ${layer.y}`,
      `w: ${layer.w}`,
      `h: ${layer.h}`,
    ];
    if (layer.aimPivot) {
      fields.push(`aimPivot: { x: ${layer.aimPivot.x}, y: ${layer.aimPivot.y} }`);
      fields.push(`aimOffsetRadians: ${cleanNumber(layer.aimOffsetRadians)}`);
    }
    lines.push(`      { ${fields.join(", ")} },`);
  }
  lines.push("    ],", "  },");
  return lines.join("\n");
}

function refreshOutput() {
  controls.output.value = JSON.stringify(alignmentPayload(), null, 2);
}

function announce(message) {
  controls.status.textContent = message;
  window.clearTimeout(announce.timeout);
  announce.timeout = window.setTimeout(() => { controls.status.textContent = ""; }, 3_000);
}

function updatePreviewLabels() {
  element("aimAngleValue").textContent = `${controls.aimAngle.value}°`;
  element("zoomValue").textContent = `${Number(controls.zoom.value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}×`;
}

function updateLayerField(property, input, minimum = -Infinity) {
  const layer = currentLayer();
  layer[property] = Math.max(minimum, finiteNumber(input.value, layer[property]));
  input.value = cleanNumber(layer[property]);
  refreshOutput();
  draw();
}

function moveSelectedLayer(dx, dy) {
  const layer = currentLayer();
  layer.x = cleanNumber(layer.x + dx);
  layer.y = cleanNumber(layer.y + dy);
  if (layer.aimPivot && controls.movePivot.checked) {
    layer.aimPivot.x = cleanNumber(layer.aimPivot.x + dx);
    layer.aimPivot.y = cleanNumber(layer.aimPivot.y + dy);
  }
  syncPropertyControls();
  refreshOutput();
  draw();
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function actorPoint(event) {
  const point = canvasPoint(event);
  const stage = stageTransform();
  return {
    x: (point.x - stage.x) / (stage.zoom * stage.facing),
    y: (point.y - stage.y) / stage.zoom,
  };
}

function inverseRotate(point, center, radians) {
  const cosine = Math.cos(-radians);
  const sine = Math.sin(-radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
}

function hitTest(point) {
  const layers = currentLayout().layers;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    let local = point;
    if (layer.aimPivot) {
      local = inverseRotate(point, { x: layer.aimPivot.x, y: layer.aimPivot.y + RENDER_Y_OFFSET }, rotationFor(layer));
    }
    if (local.x >= layer.x && local.x <= layer.x + layer.w &&
      local.y >= layer.y + RENDER_Y_OFFSET && local.y <= layer.y + RENDER_Y_OFFSET + layer.h) return index;
  }
  return -1;
}

function setReference(file) {
  if (!file?.type.startsWith("image/")) return;
  if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  referenceUrl = URL.createObjectURL(file);
  controls.referenceImage.src = referenceUrl;
  controls.referenceImage.hidden = false;
  controls.referencePlaceholder.hidden = true;
}

function clearReference() {
  if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  referenceUrl = "";
  controls.referenceImage.removeAttribute("src");
  controls.referenceImage.hidden = true;
  controls.referencePlaceholder.hidden = false;
  controls.referenceInput.value = "";
}

function normalizeLoadedSprite(sprite) {
  if (!sprite || !Array.isArray(sprite.layers) || !sprite.layers.length) throw new Error("The file has no sprite layers.");
  return {
    size: Math.max(1, finiteNumber(sprite.size, 64)),
    height: Math.max(1, finiteNumber(sprite.height, sprite.size)),
    layers: sprite.layers.map((layer) => {
      if (!layer || typeof layer.src !== "string") throw new Error("A layer is missing its source path.");
      const normalized = {
        src: layer.src.replace(/^assets\/wildwood\//, "assets/wildstat/"),
        x: finiteNumber(layer.x), y: finiteNumber(layer.y),
        w: Math.max(1, finiteNumber(layer.w, 1)), h: Math.max(1, finiteNumber(layer.h, 1)),
      };
      if (layer.aimPivot) {
        normalized.aimPivot = { x: finiteNumber(layer.aimPivot.x), y: finiteNumber(layer.aimPivot.y) };
        normalized.aimOffsetRadians = finiteNumber(layer.aimOffsetRadians);
      }
      return normalized;
    }),
  };
}

populateEnemies();
selectedLayerIndex = preferredLayerIndex(currentLayout());
populateLayers();
syncPropertyControls();
updatePreviewLabels();
refreshOutput();
draw();

controls.enemy.addEventListener("change", () => {
  selectedLayerIndex = preferredLayerIndex(currentLayout());
  populateLayers();
  syncPropertyControls();
  refreshOutput();
  draw();
});
[controls.facing, controls.pose].forEach((control) => control.addEventListener("change", () => { refreshOutput(); draw(); }));
[controls.aimAngle, controls.zoom].forEach((control) => control.addEventListener("input", () => { updatePreviewLabels(); refreshOutput(); draw(); }));
controls.layerX.addEventListener("input", () => updateLayerField("x", controls.layerX));
controls.layerY.addEventListener("input", () => updateLayerField("y", controls.layerY));
controls.layerWidth.addEventListener("input", () => updateLayerField("w", controls.layerWidth, 1));
controls.layerHeight.addEventListener("input", () => updateLayerField("h", controls.layerHeight, 1));
controls.spriteSize.addEventListener("input", () => {
  currentLayout().size = Math.max(1, finiteNumber(controls.spriteSize.value, currentLayout().size));
  refreshOutput(); draw();
});
controls.spriteHeight.addEventListener("input", () => {
  currentLayout().height = Math.max(1, finiteNumber(controls.spriteHeight.value, currentLayout().height));
  refreshOutput(); draw();
});
controls.aimEnabled.addEventListener("change", () => {
  const layer = currentLayer();
  if (controls.aimEnabled.checked) {
    layer.aimPivot = { x: cleanNumber(layer.x + layer.w / 2), y: cleanNumber(layer.y + layer.h / 2) };
    layer.aimOffsetRadians = 0;
  } else {
    delete layer.aimPivot;
    delete layer.aimOffsetRadians;
  }
  syncPropertyControls(); refreshOutput(); draw();
});
controls.pivotX.addEventListener("input", () => {
  if (!currentLayer().aimPivot) return;
  currentLayer().aimPivot.x = finiteNumber(controls.pivotX.value, currentLayer().aimPivot.x);
  refreshOutput(); draw();
});
controls.pivotY.addEventListener("input", () => {
  if (!currentLayer().aimPivot) return;
  currentLayer().aimPivot.y = finiteNumber(controls.pivotY.value, currentLayer().aimPivot.y);
  refreshOutput(); draw();
});
controls.baseRotation.addEventListener("input", () => {
  if (!currentLayer().aimPivot) return;
  currentLayer().aimOffsetRadians = finiteNumber(controls.baseRotation.value) * Math.PI / 180;
  refreshOutput(); draw();
});

element("moveBack").addEventListener("click", () => {
  if (selectedLayerIndex <= 0) return;
  const layers = currentLayout().layers;
  [layers[selectedLayerIndex - 1], layers[selectedLayerIndex]] = [layers[selectedLayerIndex], layers[selectedLayerIndex - 1]];
  selectLayer(selectedLayerIndex - 1);
});
element("moveFront").addEventListener("click", () => {
  const layers = currentLayout().layers;
  if (selectedLayerIndex >= layers.length - 1) return;
  [layers[selectedLayerIndex + 1], layers[selectedLayerIndex]] = [layers[selectedLayerIndex], layers[selectedLayerIndex + 1]];
  selectLayer(selectedLayerIndex + 1);
});
element("resetLayer").addEventListener("click", () => {
  const source = sourceLayouts[controls.enemy.value].layers;
  const selectedSource = currentLayer().src;
  const original = source.find((layer) => layer.src === selectedSource);
  if (!original) return;
  currentLayout().layers[selectedLayerIndex] = clone(original);
  syncPropertyControls(); refreshOutput(); draw();
  announce("Layer reset to the game source values.");
});
element("resetEnemy").addEventListener("click", () => {
  workingLayouts[controls.enemy.value] = clone(sourceLayouts[controls.enemy.value]);
  selectedLayerIndex = preferredLayerIndex(currentLayout());
  populateLayers(); syncPropertyControls(); refreshOutput(); draw();
  announce("Enemy reset to the game source values.");
});
element("copyValues").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(alignmentPayload(), null, 2));
  announce("Alignment values copied.");
});
element("copyTypeScript").addEventListener("click", async () => {
  await navigator.clipboard.writeText(typeScriptSnippet());
  announce("TypeScript layout copied.");
});
element("saveValues").addEventListener("click", () => {
  const text = JSON.stringify(alignmentPayload(), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug(controls.enemy.value)}-sprite-alignment.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  announce(`Saved ${link.download}. Attach that file to Codex.`);
});
element("loadValues").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (![FILE_FORMAT, "wildwood-enemy-sprite-alignment"].includes(payload.format) || payload.version !== FILE_VERSION) throw new Error("This is not a supported WildStat alignment file.");
    if (!sourceLayouts[payload.enemy]) throw new Error(`Unknown layered enemy: ${payload.enemy}`);
    workingLayouts[payload.enemy] = normalizeLoadedSprite(payload.sprite);
    controls.enemy.value = payload.enemy;
    controls.facing.value = payload.preview?.facing === "left" ? "left" : "right";
    controls.pose.value = payload.preview?.state === "aiming" ? "aiming" : "idle";
    controls.aimAngle.value = finiteNumber(payload.preview?.aimAngleDegrees);
    controls.zoom.value = Math.max(2, Math.min(5, finiteNumber(payload.preview?.zoom, 4)));
    selectedLayerIndex = preferredLayerIndex(currentLayout());
    populateLayers(); syncPropertyControls(); updatePreviewLabels(); refreshOutput(); draw();
    announce(`Loaded ${file.name}.`);
  } catch (error) {
    announce(error instanceof Error ? error.message : "Could not load that values file.");
  } finally {
    event.target.value = "";
  }
});

canvas.addEventListener("pointerdown", (event) => {
  const point = actorPoint(event);
  const hit = hitTest(point);
  if (hit >= 0 && hit !== selectedLayerIndex) selectLayer(hit);
  if (hit < 0) return;
  canvas.setPointerCapture(event.pointerId);
  const layer = currentLayer();
  dragState = {
    pointerId: event.pointerId,
    point: actorPoint(event),
    x: layer.x,
    y: layer.y,
    pivotX: layer.aimPivot?.x,
    pivotY: layer.aimPivot?.y,
  };
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const next = actorPoint(event);
  const layer = currentLayer();
  const dx = Math.round(next.x - dragState.point.x);
  const dy = Math.round(next.y - dragState.point.y);
  layer.x = cleanNumber(dragState.x + dx);
  layer.y = cleanNumber(dragState.y + dy);
  if (layer.aimPivot && controls.movePivot.checked) {
    layer.aimPivot.x = cleanNumber(dragState.pivotX + dx);
    layer.aimPivot.y = cleanNumber(dragState.pivotY + dy);
  }
  syncPropertyControls();
  refreshOutput();
  draw();
});
function endDrag(event) {
  if (dragState?.pointerId === event.pointerId) dragState = null;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("keydown", (event) => {
  const amount = event.shiftKey ? 5 : 1;
  const movement = {
    ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount],
  }[event.key];
  if (!movement) return;
  event.preventDefault();
  moveSelectedLayer(...movement);
});

controls.referenceInput.addEventListener("change", (event) => setReference(event.target.files?.[0]));
element("clearReference").addEventListener("click", clearReference);
for (const eventName of ["dragenter", "dragover"]) {
  controls.referenceDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    controls.referenceDrop.classList.add("is-over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  controls.referenceDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    controls.referenceDrop.classList.remove("is-over");
  });
}
controls.referenceDrop.addEventListener("drop", (event) => setReference(event.dataTransfer?.files?.[0]));
document.addEventListener("paste", (event) => {
  const imageItem = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile();
  if (file) setReference(file);
});
