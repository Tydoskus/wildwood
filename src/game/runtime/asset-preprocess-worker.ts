type TreeSpriteBound = { x: number; y: number; w: number; h: number; groundCenter: number; groundWidth: number };

type BoundsRequest = {
  type: "treeBounds";
  requestId: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
};

type ChromaRequest = {
  type: "removeGreen";
  requestId: number;
  pixels: ArrayBuffer;
  greenThreshold: number;
  ratio: number;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<BoundsRequest | ChromaRequest>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

function treeBounds(width: number, height: number, pixels: Uint8ClampedArray): TreeSpriteBound[] {
  const cellW = width / 4;
  const cellH = height / 4;
  return Array.from({ length: 16 }, (_, variant) => {
    const cellX = Math.floor((variant % 4) * cellW);
    const cellY = Math.floor(Math.floor(variant / 4) * cellH);
    const cellWidth = Math.ceil(cellW);
    const cellHeight = Math.ceil(cellH);
    let left = cellWidth, top = cellHeight, right = 0, bottom = 0;
    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        if (pixels[((cellY + y) * width + cellX + x) * 4 + 3] < 8) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) return { x: cellX, y: cellY, w: cellWidth, h: cellHeight, groundCenter: cellWidth / 2, groundWidth: cellWidth * .3 };
    let groundLeft = cellWidth, groundRight = 0;
    for (let y = Math.max(0, bottom - 3); y < bottom; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        if (pixels[((cellY + y) * width + cellX + x) * 4 + 3] < 8) continue;
        groundLeft = Math.min(groundLeft, x); groundRight = Math.max(groundRight, x + 1);
      }
    }
    const groundWidth = groundRight > groundLeft ? groundRight - groundLeft : Math.max(8, (right - left) * .28);
    const groundCenter = groundRight > groundLeft ? (groundLeft + groundRight) / 2 - left : (right - left) / 2;
    return { x: cellX + left, y: cellY + top, w: right - left, h: bottom - top, groundCenter, groundWidth };
  });
}

workerScope.onmessage = ({ data }) => {
  if (data.type === "treeBounds") {
    const bounds = treeBounds(data.width, data.height, new Uint8ClampedArray(data.pixels));
    workerScope.postMessage({ type: "treeBounds", requestId: data.requestId, bounds }, []);
    return;
  }
  const pixels = new Uint8ClampedArray(data.pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (green > data.greenThreshold && green > red * data.ratio && green > blue * data.ratio) pixels[index + 3] = 0;
  }
  workerScope.postMessage({ type: "removeGreen", requestId: data.requestId, pixels: pixels.buffer }, [pixels.buffer as ArrayBuffer]);
};
