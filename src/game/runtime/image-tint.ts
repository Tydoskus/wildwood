/** Recolors one transparent image while preserving its original light and shadow. */
export function createTintedImageCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  tint: string,
  imageSmoothingEnabled = false,
) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = imageSmoothingEnabled;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "color";
  context.fillStyle = tint;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas;
}
