export function createCanvasPrimitives(
  ctx: CanvasRenderingContext2D,
  textLayer?: CanvasRenderingContext2D,
) {
  function textContext() {
    return textLayer ?? ctx;
  }

  function copyTextState(target: CanvasRenderingContext2D) {
    target.setTransform(ctx.getTransform());
    target.globalAlpha = ctx.globalAlpha;
    target.font = ctx.font;
    target.textAlign = ctx.textAlign;
    target.textBaseline = ctx.textBaseline;
    target.direction = ctx.direction;
  }
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
    drawOutlinedText(textContext(), text, x, y, fillColor, strokeWidth);
  }

  function outlinedWorldText(
    text: string,
    x: number,
    y: number,
    fillColor: string,
    strokeWidth = ctx.lineWidth,
  ) {
    drawOutlinedText(ctx, text, x, y, fillColor, strokeWidth);
  }

  function drawOutlinedText(
    target: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fillColor: string,
    strokeWidth: number,
  ) {
    target.save();
    copyTextState(target);
    target.lineJoin = "round";
    target.lineWidth = strokeWidth;

    // Shadow only the fill. Shadowing both stroke and fill produces two
    // overlapping silhouettes that look like a second outline on small text.
    target.fillStyle = fillColor;
    target.shadowColor = "rgba(0, 0, 0, .92)";
    target.shadowBlur = 0;
    target.shadowOffsetX = 1;
    target.shadowOffsetY = 2;
    target.fillText(text, x, y);

    target.shadowColor = "transparent";
    target.shadowOffsetX = 0;
    target.shadowOffsetY = 0;
    target.strokeStyle = "#000";
    target.strokeText(text, x, y);
    target.fillStyle = fillColor;
    target.fillText(text, x, y);
    target.restore();
  }

  function fillFloatingText(text: string, x: number, y: number) {
    const target = textContext();
    target.save();
    copyTextState(target);
    target.fillStyle = ctx.fillStyle;
    target.fillText(text, x, y);
    target.restore();
  }

  function fillWorldText(text: string, x: number, y: number) {
    ctx.fillText(text, x, y);
  }

  return { outlinedText, outlinedWorldText, fillFloatingText, fillWorldText, pixelCircle, roundRect };
}
