import type { WorldPath } from "../world";

export const FOREST_ROAD_SOURCE = "assets/wildstat/soul-dimension/forest-road.webp";

/** In the pack's 256-pixel tiles: the dirt starts this far in from a road's outer tile edge, past its grass lip. */
const LIP_PIXELS = 45;
/** The edge band: the lip and the grass curls just inside it. */
const SLICE_PIXELS = 110;

type Side = "top" | "bottom" | "left" | "right";
/** One straight stretch of the roads' outline, `from` to `to` along it, at `at` across it; each end is an outer corner or not. */
export type RoadEdge = { side: Side; at: number; from: number; to: number; cornerFrom: boolean; cornerTo: boolean };

/**
 * The outline of every path together: where dirt meets grass, never where two paths meet or cross. Found on the
 * grid of the paths' own edges, so it is exact whatever their sizes.
 */
export function roadOutline(paths: readonly WorldPath[]): RoadEdge[] {
  const xs = [...new Set(paths.flatMap(path => [path.x, path.x + path.w]))].sort((a, b) => a - b);
  const ys = [...new Set(paths.flatMap(path => [path.y, path.y + path.h]))].sort((a, b) => a - b);
  const columns = xs.length - 1, rows = ys.length - 1;
  if (columns < 1 || rows < 1) return [];
  const filled = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cx = (xs[column] + xs[column + 1]) / 2, cy = (ys[row] + ys[row + 1]) / 2;
    if (paths.some(path => cx > path.x && cx < path.x + path.w && cy > path.y && cy < path.y + path.h)) filled[row * columns + column] = 1;
  }
  const at = (column: number, row: number) => column >= 0 && row >= 0 && column < columns && row < rows && filled[row * columns + column] === 1;
  const edges: RoadEdge[] = [];
  // Horizontal edges between rows row-1 and row, in runs; then vertical ones between columns.
  for (let row = 0; row <= rows; row++) for (const side of ["top", "bottom"] as const) {
    const inside = (column: number) => side === "top" ? at(column, row) && !at(column, row - 1) : at(column, row - 1) && !at(column, row);
    const beyond = side === "top" ? row : row - 1;
    for (let column = 0; column < columns; column++) {
      if (!inside(column)) continue;
      let end = column;
      while (end + 1 < columns && inside(end + 1)) end++;
      // An end is an outer corner when the road stops there too; otherwise the outline turns in (a road joins).
      edges.push({ side, at: ys[row], from: xs[column], to: xs[end + 1], cornerFrom: !at(column - 1, beyond), cornerTo: !at(end + 1, beyond) });
      column = end;
    }
  }
  for (let column = 0; column <= columns; column++) for (const side of ["left", "right"] as const) {
    const inside = (row: number) => side === "left" ? at(column, row) && !at(column - 1, row) : at(column - 1, row) && !at(column, row);
    const beyond = side === "left" ? column : column - 1;
    for (let row = 0; row < rows; row++) {
      if (!inside(row)) continue;
      let end = row;
      while (end + 1 < rows && inside(end + 1)) end++;
      edges.push({ side, at: xs[column], from: ys[row], to: ys[end + 1], cornerFrom: !at(beyond, row - 1), cornerTo: !at(beyond, end + 1) });
      row = end;
    }
  }
  return edges;
}

/**
 * The tutorial forest's roads in the Town's road tiles (ForestVillage's Forest_Road, baked by
 * scripts/art/bake-forest-road.mjs): the paths' dirt repeats from the world's origin, so tiles and crossing
 * roads meet seamlessly, and the pack's grass-lipped edge runs along the outline of all of them together, with
 * its rounded corner piece at every outer corner.
 */
export function createForestRoadPainter(image: () => HTMLImageElement | undefined) {
  let centre: HTMLCanvasElement | null = null;
  let outlineOf: readonly WorldPath[] | null = null, outlineKey = "", outline: RoadEdge[] = [];
  /** Each outer corner's drawn size, by its point. */
  let corners = new Map<string, number>();

  function dirt(context: CanvasRenderingContext2D, img: HTMLImageElement, tile: number) {
    if (!centre) {
      centre = document.createElement("canvas");
      centre.width = centre.height = Math.round(tile);
      centre.getContext("2d")?.drawImage(img, tile, tile, tile, tile, 0, 0, centre.width, centre.height);
    }
    return context.createPattern(centre, "repeat");
  }

  /** Paints every road reaching into the tile at (ox, oy), `size` square. Returns false while the image loads. */
  return function paintRoads(context: CanvasRenderingContext2D, paths: readonly WorldPath[], ox: number, oy: number, size: number, ground: string) {
    const img = image();
    if (!img?.complete) return false;
    if (!(img.naturalWidth > 0) || !paths.length) return true;
    const tile = img.naturalWidth / 3, unit = tile / 256, W = img.naturalWidth;
    const lip = LIP_PIXELS * unit, c = SLICE_PIXELS * unit, inward = c - lip;
    const key = paths.map(path => `${path.x},${path.y},${path.w},${path.h}`).join(";");
    if (paths !== outlineOf || key !== outlineKey) {
      outlineOf = paths; outlineKey = key; outline = roadOutline(paths);
      // A corner fits the shorter of its two edges: its rounding takes at most half of either.
      const lengths = new Map<string, number>();
      for (const edge of outline) {
        const horizontal = edge.side === "top" || edge.side === "bottom", length = edge.to - edge.from;
        for (const [end, cornered] of [[edge.from, edge.cornerFrom], [edge.to, edge.cornerTo]] as const) {
          if (!cornered) continue;
          const key = horizontal ? `${end},${edge.at}` : `${edge.at},${end}`;
          lengths.set(key, Math.min(lengths.get(key) ?? Infinity, length));
        }
      }
      corners = new Map([...lengths].map(([key, length]) => [key, Math.min(tile, length / 2 / (1 - LIP_PIXELS / 256))]));
    }
    const reaches = (x0: number, y0: number, x1: number, y1: number) => x0 < ox + size && x1 > ox && y0 < oy + size && y1 > oy;
    const pattern = dirt(context, img, tile);
    context.save();
    context.translate(-ox, -oy);
    context.imageSmoothingEnabled = true;
    if (pattern) {
      context.fillStyle = pattern;
      for (const path of paths) if (reaches(path.x, path.y, path.x + path.w, path.y + path.h)) context.fillRect(path.x, path.y, path.w, path.h);
    }
    // Along a stretch, a middle tile's band at a time, lined up with the world so the art runs on across tiles.
    const along = (from: number, to: number, draw: (offset: number, start: number, length: number) => void) => {
      // Stepped by whole tiles from the world's origin: a fractional tile otherwise left slivers to step by forever.
      for (let index = Math.floor(from / tile); index * tile < to; index++) {
        const start = Math.max(from, index * tile), end = Math.min(to, (index + 1) * tile);
        if (end - start > .01) draw(start - index * tile, start, end - start);
      }
    };
    // Each outer corner is the pack's whole rounded corner tile, shrunk where the road is too short for it (by
    // `scale`), and set so its lip lands on the dirt's edge, where the straight edges' lips run.
    const cornerSize = (x: number, y: number) => corners.get(`${x},${y}`) ?? tile;
    const corner = (x: number, y: number, right: boolean, bottom: boolean) => {
      const size = cornerSize(x, y), inset = lip * size / tile;
      const left = right ? x + inset - size : x - inset, top = bottom ? y + inset - size : y - inset;
      if (!reaches(left, top, left + size, top + size)) return;
      // The square of dirt under its rounding goes back to ground first.
      context.fillStyle = ground;
      context.fillRect(right ? x - (size - inset) : x, bottom ? y - (size - inset) : y, size - inset, size - inset);
      context.drawImage(img, right ? W - tile : 0, bottom ? W - tile : 0, tile, tile, left, top, size, size);
    };
    const reach = (x: number, y: number) => { const size = cornerSize(x, y); return size - lip * size / tile; };
    for (const edge of outline) {
      const horizontal = edge.side === "top" || edge.side === "bottom";
      const point = (along: number) => horizontal ? [along, edge.at] as const : [edge.at, along] as const;
      const from = edge.from + (edge.cornerFrom ? reach(...point(edge.from)) : 0), to = edge.to - (edge.cornerTo ? reach(...point(edge.to)) : 0);
      if (horizontal) {
        const top = edge.side === "top" ? edge.at - lip : edge.at - inward, sy = edge.side === "top" ? 0 : W - c;
        if (reaches(edge.from - lip, top, edge.to + lip, top + c)) along(from, to, (offset, x, length) => context.drawImage(img, tile + offset, sy, length, c, x, top, length, c));
        if (edge.cornerFrom) corner(edge.from, edge.at, false, edge.side === "bottom");
        if (edge.cornerTo) corner(edge.to, edge.at, true, edge.side === "bottom");
      } else {
        const left = edge.side === "left" ? edge.at - lip : edge.at - inward, sx = edge.side === "left" ? 0 : W - c;
        if (reaches(left, edge.from - lip, left + c, edge.to + lip)) along(from, to, (offset, y, length) => context.drawImage(img, sx, tile + offset, c, length, left, y, c, length));
      }
    }
    context.restore();
    return true;
  };
}
