/* Plain script, intentionally usable from file:// without a server or dependencies. */
(() => {
  const safeName = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const safePage = /^[a-z0-9][a-z0-9-]*\.(png|webp)$/;
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const positiveInt = (value) => Number.isInteger(value) && value > 0;

  function validateManifest(manifest) {
    const fail = (message) => { throw new Error(`Invalid sprite.json: ${message}`); };
    if (!manifest || manifest.schemaVersion !== 1 || !safeName.test(manifest.name)) fail("unsupported format or name");
    if (manifest.warnings !== undefined && (!Array.isArray(manifest.warnings) || manifest.warnings.some((warning) => typeof warning !== "string"))) fail("invalid warnings");
    if (manifest.coordinates !== "top-left-pixels" || manifest.alpha !== "straight") fail("unsupported coordinates or alpha mode");
    if (![64, 128, 256, 512].includes(manifest.frameWidth) || manifest.frameWidth !== manifest.frameHeight) fail("invalid frame size");
    if (!finite(manifest.anchorX) || !finite(manifest.anchorY) || manifest.anchorX < 0 || manifest.anchorX > manifest.frameWidth || manifest.anchorY < 0 || manifest.anchorY > manifest.frameHeight) fail("invalid anchor");
    if (!finite(manifest.pixelsPerUnit) || manifest.pixelsPerUnit <= 0) fail("invalid pixels per unit");
    if (!Array.isArray(manifest.pages) || manifest.pages.length < 1 || manifest.pages.length > 128) fail("invalid page count");
    const filenames = new Set();
    let pixels = 0;
    for (const page of manifest.pages) {
      if (!page || !safePage.test(page.file) || filenames.has(page.file)) fail("unsafe or duplicate page filename");
      filenames.add(page.file);
      if (!positiveInt(page.width) || !positiveInt(page.height) || page.width > 2048 || page.height > 2048) fail("sheet exceeds texture limits");
      pixels += page.width * page.height;
    }
    if (pixels > 64 * 1024 * 1024) fail("export exceeds preview memory limit; export fewer motions at once");
    if (!Array.isArray(manifest.animations) || !manifest.animations.length) fail("no animations");
    const keys = new Set();
    let count = 0;
    for (const animation of manifest.animations) {
      if (!animation || !safeName.test(animation.key) || keys.has(animation.key)) fail("invalid or duplicate motion name");
      keys.add(animation.key);
      if (typeof animation.loop !== "boolean" || !finite(animation.frameDurationMs) || animation.frameDurationMs <= 0 || animation.frameDurationMs > 60000) fail("invalid timing");
      if (!Array.isArray(animation.frames) || animation.frames.length < 1 || animation.frames.length > 600) fail("invalid frame count");
      if (!finite(animation.durationMs) || Math.abs(animation.durationMs - animation.frameDurationMs * animation.frames.length) > .01) fail("inconsistent duration");
      count += animation.frames.length;
      for (const frame of animation.frames) {
        if (!frame || !Number.isInteger(frame.page) || frame.page < 0 || frame.page >= manifest.pages.length) fail("invalid frame page");
        const page = manifest.pages[frame.page];
        if (!Number.isInteger(frame.x) || !Number.isInteger(frame.y) || frame.x < 0 || frame.y < 0 || frame.w !== manifest.frameWidth || frame.h !== manifest.frameHeight || frame.x + frame.w > page.width || frame.y + frame.h > page.height) fail("frame outside sheet");
      }
    }
    if (count > 2000) fail("too many frames");
    return manifest;
  }

  function frameAt(animation, elapsedMs) {
    const index = Math.floor(Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / animation.frameDurationMs);
    return animation.loop ? index % animation.frames.length : Math.min(index, animation.frames.length - 1);
  }

  function webpManifest(manifest) {
    validateManifest(manifest);
    const converted = { ...manifest, pages: manifest.pages.map((page) => ({ ...page, file: page.file.replace(/\.(png|webp)$/, ".webp") })) };
    return validateManifest(converted);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // PNG/WebP are already compressed. ZIP "store" avoids another dependency and
  // creates one download with explicit little-endian headers and verified CRCs.
  function makeZip(entries) {
    if (!entries.length || entries.length > 256) throw new Error("Invalid ZIP entry count.");
    const localParts = [], centralParts = [], names = new Set();
    let offset = 0, centralSize = 0;
    for (const entry of entries) {
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(entry.name) || entry.name.includes("..") || names.has(entry.name)) throw new Error("Unsafe or duplicate ZIP filename.");
      names.add(entry.name);
      if (!(entry.bytes instanceof Uint8Array)) throw new Error("Expected ZIP file bytes.");
      const name = new TextEncoder().encode(entry.name);
      const size = entry.bytes.length;
      if (offset + size > 512 * 1024 * 1024) throw new Error("ZIP exceeds memory limit.");
      const crc = crc32(entry.bytes);
      const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(12, 0x0021, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      header.set(name, 30);
      localParts.push(header, entry.bytes);
      const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(14, 0x0021, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.set(name, 46); centralParts.push(central); centralSize += central.length;
      offset += header.length + size;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  globalThis.WildStatSpriteTools = Object.freeze({ validateManifest, frameAt, webpManifest, crc32, makeZip });
})();
