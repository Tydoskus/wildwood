export function createCanvasPrimitives(ctx: CanvasRenderingContext2D) {
  function pixelCircle(x: number, y: number, radius: number) {
    const step = 4;
    const radiusSquared = radius * radius;
    for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
      const halfWidth = Math.sqrt(Math.max(0, radiusSquared - offsetY * offsetY));
      ctx.fillRect(
        Math.floor(x - halfWidth),
        Math.floor(y + offsetY),
        Math.ceil(halfWidth * 2),
        step,
      );
    }
  }

  function roundRect(x: number, y: number, width: number, height: number, radius: number) {
    const corner = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + corner, y);
    ctx.arcTo(x + width, y, x + width, y + height, corner);
    ctx.arcTo(x + width, y + height, x, y + height, corner);
    ctx.arcTo(x, y + height, x, y, corner);
    ctx.arcTo(x, y, x + width, y, corner);
    ctx.closePath();
  }

  function outlinedText(
    text: string,
    x: number,
    y: number,
    fillColor: string,
    strokeWidth = ctx.lineWidth,
  ) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeWidth;

    // Shadow only the fill. Shadowing both stroke and fill produces two
    // overlapping silhouettes that look like a second outline on small text.
    ctx.fillStyle = fillColor;
    ctx.shadowColor = "rgba(0, 0, 0, .92)";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);

    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "#000";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  return { outlinedText, pixelCircle, roundRect };
}
