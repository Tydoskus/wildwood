export function removeGreenPixels(pixels: Uint8ClampedArray, greenThreshold: number, ratio: number) {
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (green > greenThreshold && green > red * ratio && green > blue * ratio) pixels[index + 3] = 0;
  }
}

/** Removes disconnected atlas bleed while retaining each frame's main sprite. */
export function keepLargestFrameComponents(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  frameColumns: number,
) {
  if (!Number.isInteger(frameColumns) || frameColumns < 2 || width % frameColumns !== 0) return;
  const frameWidth = width / frameColumns;
  const framePixelCount = frameWidth * height;

  for (let frame = 0; frame < frameColumns; frame += 1) {
    const frameX = frame * frameWidth;
    const labels = new Uint32Array(framePixelCount);
    const queue = new Uint32Array(framePixelCount);
    let nextLabel = 0;
    let largestLabel = 0;
    let largestSize = 0;

    for (let localIndex = 0; localIndex < framePixelCount; localIndex += 1) {
      const localX = localIndex % frameWidth;
      const localY = Math.floor(localIndex / frameWidth);
      const alphaIndex = (localY * width + frameX + localX) * 4 + 3;
      if (pixels[alphaIndex] === 0 || labels[localIndex] !== 0) continue;

      const label = ++nextLabel;
      let head = 0;
      let tail = 0;
      let size = 0;
      labels[localIndex] = label;
      queue[tail++] = localIndex;

      while (head < tail) {
        const current = queue[head++];
        const x = current % frameWidth;
        const y = Math.floor(current / frameWidth);
        size += 1;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const neighborY = y + offsetY;
          if (neighborY < 0 || neighborY >= height) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const neighborX = x + offsetX;
            if (neighborX < 0 || neighborX >= frameWidth) continue;
            const neighbor = neighborY * frameWidth + neighborX;
            if (labels[neighbor] !== 0) continue;
            const neighborAlpha = (neighborY * width + frameX + neighborX) * 4 + 3;
            if (pixels[neighborAlpha] === 0) continue;
            labels[neighbor] = label;
            queue[tail++] = neighbor;
          }
        }
      }

      if (size > largestSize) {
        largestSize = size;
        largestLabel = label;
      }
    }

    for (let localIndex = 0; localIndex < framePixelCount; localIndex += 1) {
      if (labels[localIndex] === 0 || labels[localIndex] === largestLabel) continue;
      const localX = localIndex % frameWidth;
      const localY = Math.floor(localIndex / frameWidth);
      pixels[(localY * width + frameX + localX) * 4 + 3] = 0;
    }
  }
}

/** Aligns atlas frames to a stable lower-body anchor so animation poses do not drift. */
export function centerFramesOnGround(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  frameColumns: number,
  anchorHeightRatio = .2,
) {
  if (!Number.isInteger(frameColumns) || frameColumns < 2 || width % frameColumns !== 0) return [];
  const frameWidth = width / frameColumns;
  const targetCenter = (frameWidth - 1) / 2;
  const anchorTop = Math.floor(height * (1 - anchorHeightRatio));
  const offsets: number[] = [];

  for (let frame = 0; frame < frameColumns; frame += 1) {
    const frameX = frame * frameWidth;
    let left = frameWidth;
    let right = -1;
    const measure = (top: number) => {
      for (let y = top; y < height; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          if (pixels[(y * width + frameX + x) * 4 + 3] === 0) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    };
    measure(anchorTop);
    if (right < left) measure(0);
    const offset = right < left ? 0 : Math.round(targetCenter - (left + right) / 2);
    offsets.push(offset);
    if (offset === 0) continue;

    const aligned = new Uint8ClampedArray(frameWidth * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const source = (y * width + frameX + x) * 4;
        if (pixels[source + 3] === 0) continue;
        const targetX = x + offset;
        if (targetX < 0 || targetX >= frameWidth) continue;
        const target = (y * frameWidth + targetX) * 4;
        aligned[target] = pixels[source];
        aligned[target + 1] = pixels[source + 1];
        aligned[target + 2] = pixels[source + 2];
        aligned[target + 3] = pixels[source + 3];
      }
    }
    for (let y = 0; y < height; y += 1) {
      const sourceStart = y * frameWidth * 4;
      const targetStart = (y * width + frameX) * 4;
      pixels.set(aligned.subarray(sourceStart, sourceStart + frameWidth * 4), targetStart);
    }
  }

  return offsets;
}
