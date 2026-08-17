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
