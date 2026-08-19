type TextSprite = {
  canvas: HTMLCanvasElement;
  logicalWidth: number;
  logicalHeight: number;
  textWidth: number;
  ascent: number;
  padding: number;
  pixels: number;
};

type TextSpriteMetrics = {
  width: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
  fontBoundingBoxAscent?: number;
  fontBoundingBoxDescent?: number;
};

export function textSpriteLayout(metrics: TextSpriteMetrics, fontSize: number, strokeWidth: number | null) {
  const safeFontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16;
  const positiveMetric = (value: number | undefined) => Number.isFinite(value) && value! > 0 ? value! : undefined;
  const nonNegativeMetric = (value: number | undefined) => Number.isFinite(value) && value! >= 0 ? value! : undefined;
  const measuredAscent = positiveMetric(metrics.actualBoundingBoxAscent)
    ?? positiveMetric(metrics.fontBoundingBoxAscent)
    ?? safeFontSize * .8;
  // Zero descent is valid for digits. Extra raster bleed protects glyphs with
  // unreliable descent metrics without moving centered number labels.
  const measuredDescent = nonNegativeMetric(metrics.actualBoundingBoxDescent)
    ?? nonNegativeMetric(metrics.fontBoundingBoxDescent)
    ?? safeFontSize * .2;
  const textWidth = Math.max(1, Math.ceil(Number.isFinite(metrics.width) ? metrics.width : 1));
  const ascent = Math.max(1, Math.ceil(measuredAscent));
  const descent = Math.max(0, Math.ceil(measuredDescent));
  const glyphBleed = Math.max(2, Math.ceil(safeFontSize * .2));
  const padding = Math.ceil((strokeWidth ?? 0) / 2) + glyphBleed;
  return {
    textWidth,
    ascent,
    descent,
    padding,
    logicalWidth: textWidth + padding * 2,
    logicalHeight: ascent + descent + padding * 2,
  };
}

export function createCanvasPrimitives(ctx: CanvasRenderingContext2D) {
  const TEXT_CACHE_LIMIT = 256;
  const TEXT_CACHE_PIXEL_LIMIT = 4_000_000;
  const textSprites = new Map<string, TextSprite>();
  let cachedTextPixels = 0;

  function textSprite(text: string, fillColor: string, strokeWidth: number | null) {
    const scale = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const font = ctx.font;
    const direction = ctx.direction;
    const key = `${scale}\u0000${font}\u0000${direction}\u0000${fillColor}\u0000${strokeWidth ?? "fill"}\u0000${text}`;
    const cached = textSprites.get(key);
    if (cached) {
      textSprites.delete(key);
      textSprites.set(key, cached);
      return cached;
    }

    const canvas = document.createElement("canvas");
    const target = canvas.getContext("2d");
    if (target) {
      // WebKit can resolve different font metrics for a document canvas and a
      // detached canvas. Measure and render with this same context.
      target.font = font;
      target.direction = direction;
    }
    const metrics = target?.measureText(text) ?? ctx.measureText(text);
    const fontSize = Number.parseFloat(font.match(/([\d.]+)px/)?.[1] ?? "16");
    const { textWidth, ascent, padding, logicalWidth, logicalHeight } = textSpriteLayout(metrics, fontSize, strokeWidth);
    canvas.width = Math.ceil(logicalWidth * scale);
    canvas.height = Math.ceil(logicalHeight * scale);
    if (target) {
      target.setTransform(scale, 0, 0, scale, 0, 0);
      target.font = font;
      target.direction = direction;
      target.textAlign = "left";
      target.textBaseline = "alphabetic";
      target.lineJoin = "round";
      if (strokeWidth !== null) {
        target.lineWidth = strokeWidth;
        target.strokeStyle = "#000";
        target.strokeText(text, padding, padding + ascent);
      }
      target.fillStyle = fillColor;
      target.fillText(text, padding, padding + ascent);
    }
    const sprite = { canvas, logicalWidth, logicalHeight, textWidth, ascent, padding, pixels: canvas.width * canvas.height };
    textSprites.set(key, sprite);
    cachedTextPixels += sprite.pixels;
    while (textSprites.size > TEXT_CACHE_LIMIT || cachedTextPixels > TEXT_CACHE_PIXEL_LIMIT) {
      const oldestKey = textSprites.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = textSprites.get(oldestKey);
      textSprites.delete(oldestKey);
      if (oldest) cachedTextPixels -= oldest.pixels;
    }
    return sprite;
  }

  function drawTextSprite(sprite: TextSprite, x: number, y: number) {
    const direction = ctx.direction;
    const align = ctx.textAlign === "start"
      ? direction === "rtl" ? "right" : "left"
      : ctx.textAlign === "end"
        ? direction === "rtl" ? "left" : "right"
        : ctx.textAlign;
    const anchorX = align === "center"
      ? sprite.padding + sprite.textWidth / 2
      : align === "right"
        ? sprite.padding + sprite.textWidth
        : sprite.padding;
    const anchorY = ctx.textBaseline === "middle"
      ? sprite.logicalHeight / 2
      : ctx.textBaseline === "top" || ctx.textBaseline === "hanging"
        ? sprite.padding
        : ctx.textBaseline === "bottom" || ctx.textBaseline === "ideographic"
          ? sprite.logicalHeight - sprite.padding
          : sprite.padding + sprite.ascent;
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      sprite.canvas,
      x - anchorX,
      y - anchorY,
      sprite.logicalWidth,
      sprite.logicalHeight,
    );
    ctx.imageSmoothingEnabled = smoothing;
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

  function outlinedWorldText(
    text: string,
    x: number,
    y: number,
    fillColor: string,
    strokeWidth = ctx.lineWidth,
  ) {
    drawTextSprite(textSprite(text, fillColor, strokeWidth), x, y);
  }

  function drawFilledText(text: string, x: number, y: number) {
    if (typeof ctx.fillStyle !== "string") {
      ctx.fillText(text, x, y);
      return;
    }
    drawTextSprite(textSprite(text, ctx.fillStyle, null), x, y);
  }

  function fillWorldText(text: string, x: number, y: number) {
    drawFilledText(text, x, y);
  }

  return { outlinedWorldText, fillWorldText, pixelCircle, roundRect };
}
