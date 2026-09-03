(() => {
  const { validateManifest, frameAt, webpManifest, makeZip } = globalThis.WildStatSpriteTools;
  const el = (id) => document.getElementById(id);
  const canvas = el("canvas"), context = canvas.getContext("2d");
  let manifest = null, pages = [], elapsed = 0, playing = true, previous = performance.now(), loadGeneration = 0, sourceBytes = 0;
  const motion = () => manifest.animations[Number(el("motion").value) || 0];
  const status = (message, error = false) => { el("status").textContent = message; el("status").dataset.error = String(error); };
  const release = (images) => images.forEach((image) => image.close?.());

  el("files").addEventListener("change", async () => {
    const generation = ++loadGeneration;
    el("workspace").hidden = true;
    release(pages); pages = []; manifest = null;
    const decoded = [];
    try {
      const files = [...el("files").files];
      const manifests = files.filter((file) => file.name === "sprite.json");
      if (manifests.length !== 1) throw new Error("Choose one completed export folder, not the parent folder containing several exports.");
      const manifestFile = manifests[0];
      if (manifestFile.size > 4 * 1024 * 1024) throw new Error("sprite.json is too large.");
      const next = validateManifest(JSON.parse(await manifestFile.text()));
      const prefix = manifestFile.webkitRelativePath.slice(0, -"sprite.json".length);
      let bytes = 0;
      for (const page of next.pages) {
        const file = files.find((candidate) => candidate.webkitRelativePath === prefix + page.file);
        if (!file) throw new Error(`Missing sheet: ${page.file}`);
        bytes += file.size;
        if (bytes > 128 * 1024 * 1024) throw new Error("Export is too large for this preview. Export fewer motions.");
        const image = await createImageBitmap(file);
        decoded.push(image);
        if (generation !== loadGeneration) { release(decoded); return; }
        if (image.width !== page.width || image.height !== page.height) throw new Error(`Sheet dimensions do not match sprite.json: ${page.file}`);
      }
      if (generation !== loadGeneration) { release(decoded); return; }
      manifest = next; pages = decoded; sourceBytes = bytes;
      el("motion").replaceChildren(...manifest.animations.map((animation, index) => {
        const option = document.createElement("option"); option.value = String(index); option.textContent = animation.key; return option;
      }));
      canvas.width = manifest.frameWidth; canvas.height = manifest.frameHeight;
      elapsed = 0; playing = true; el("play").textContent = "Pause"; previous = performance.now();
      el("workspace").hidden = false;
      status(`${manifest.name} · ${manifest.pages.length} sheets · ${(bytes / 1024).toFixed(1)} KB\n${(manifest.warnings || []).filter((warning) => typeof warning === "string").join("\n")}`.trim());
      updateMotion();
    } catch (error) {
      release(decoded);
      if (generation === loadGeneration) status(error.message, true);
    }
  });

  function updateMotion() {
    elapsed = 0;
    const animation = motion();
    el("frame").max = String(animation.frames.length - 1);
    el("details").textContent = `${manifest.frameWidth} × ${manifest.frameHeight} px · ${animation.frames.length} frames · ${(1000 / animation.frameDurationMs).toFixed(1)} FPS · ${animation.loop ? "loop" : "one-shot, holds last frame"}`;
    draw();
  }

  function draw() {
    if (!manifest) return;
    const animation = motion(), index = frameAt(animation, elapsed), frame = animation.frames[index];
    const scale = Number(el("scale").value);
    canvas.style.width = `${manifest.frameWidth * scale}px`;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(pages[frame.page], frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    if (el("anchor").checked) {
      const x = manifest.anchorX, y = manifest.anchorY;
      context.strokeStyle = "#fc3157"; context.lineWidth = 1;
      context.beginPath(); context.moveTo(x - 6, y); context.lineTo(x + 6, y); context.moveTo(x, y - 6); context.lineTo(x, y + 6); context.stroke();
    }
    el("frame").value = String(index);
    el("frame-label").textContent = `${index + 1} / ${animation.frames.length}`;
  }

  function tick(now) {
    if (manifest && playing && !document.hidden) { elapsed += Math.min(now - previous, 100); draw(); }
    previous = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  el("motion").addEventListener("change", updateMotion);
  el("play").addEventListener("click", () => { playing = !playing; el("play").textContent = playing ? "Pause" : "Play"; });
  el("restart").addEventListener("click", () => { elapsed = 0; playing = true; el("play").textContent = "Pause"; draw(); });
  el("frame").addEventListener("input", () => { playing = false; el("play").textContent = "Play"; elapsed = Number(el("frame").value) * motion().frameDurationMs + .00001; draw(); });
  for (const id of ["scale", "anchor"]) el(id).addEventListener("change", draw);
  el("background").addEventListener("change", () => { el("stage").dataset.background = el("background").value; });

  el("webp").addEventListener("click", async () => {
    if (!manifest) return;
    el("webp").disabled = true; el("files").disabled = true;
    try {
      const converted = webpManifest(manifest);
      const quality = Math.min(100, Math.max(70, Number(el("quality").value) || 95)) / 100;
      const entries = [];
      let bytes = 0;
      for (let i = 0; i < pages.length; i++) {
        status(`Converting sheet ${i + 1} / ${pages.length} locally…`);
        const image = pages[i], output = document.createElement("canvas");
        output.width = image.width; output.height = image.height;
        output.getContext("2d").drawImage(image, 0, 0);
        const blob = await new Promise((resolve) => output.toBlob(resolve, "image/webp", quality));
        output.width = 1; output.height = 1;
        if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot encode WebP. Try Chrome; your PNG originals are unchanged.");
        bytes += blob.size;
        entries.push({ name: converted.pages[i].file, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      entries.push({ name: "sprite.json", bytes: new TextEncoder().encode(JSON.stringify(converted, null, 2) + "\n") });
      const zip = makeZip(entries), url = URL.createObjectURL(zip), link = document.createElement("a");
      link.href = url; link.download = `${manifest.name}-webp.zip`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status(`WebP bundle ready: ${(bytes / 1024).toFixed(1)} KB of sheets, versus ${(sourceBytes / 1024).toFixed(1)} KB originally. Extract the ZIP to use its updated sprite.json. PNG masters are untouched.`);
    } catch (error) { status(error.message, true); }
    finally { el("webp").disabled = false; el("files").disabled = false; }
  });
})();
