export function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required game element: #${id}`);
  return element as T;
}

export function requiredSelector<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing required game element: ${selector}`);
  return element as T;
}

export function requiredCanvasContext(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
) {
  const context = canvas.getContext("2d", options);
  if (!context) throw new Error("Canvas 2D context unavailable");
  return context;
}
