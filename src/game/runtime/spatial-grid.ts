export type SpatialPoint = { x: number; y: number };

/**
 * Fixed-size, allocation-stable broad-phase index for world entities.
 * Items live in one center cell; callers expand queries by entity radius.
 */
export function createSpatialGrid<T extends SpatialPoint>(cellSize: number, worldWidth: number, worldHeight: number) {
  const safeCellSize = Math.max(1, cellSize);
  const columns = Math.max(1, Math.ceil(worldWidth / safeCellSize));
  const rows = Math.max(1, Math.ceil(worldHeight / safeCellSize));
  const buckets = Array.from({ length: columns * rows }, () => [] as T[]);
  const usedBuckets: number[] = [];

  function cellX(x: number) {
    return Math.max(0, Math.min(columns - 1, Math.floor(x / safeCellSize)));
  }

  function cellY(y: number) {
    return Math.max(0, Math.min(rows - 1, Math.floor(y / safeCellSize)));
  }

  function clear() {
    for (const index of usedBuckets) buckets[index].length = 0;
    usedBuckets.length = 0;
  }

  function insert(item: T) {
    const index = cellY(item.y) * columns + cellX(item.x);
    const bucket = buckets[index];
    if (bucket.length === 0) usedBuckets.push(index);
    bucket.push(item);
  }

  function rebuild(items: readonly T[], include?: (item: T) => boolean) {
    clear();
    for (const item of items) if (!include || include(item)) insert(item);
  }

  function queryBounds(left: number, top: number, right: number, bottom: number, output: T[]) {
    output.length = 0;
    const startX = cellX(Math.min(left, right));
    const endX = cellX(Math.max(left, right));
    const startY = cellY(Math.min(top, bottom));
    const endY = cellY(Math.max(top, bottom));
    for (let y = startY; y <= endY; y += 1) {
      const rowOffset = y * columns;
      for (let x = startX; x <= endX; x += 1) {
        const bucket = buckets[rowOffset + x];
        for (const item of bucket) output.push(item);
      }
    }
    return output;
  }

  /**
   * Visits each same/adjacent-cell pair once. Cell size must be at least the
   * largest possible interaction distance for the caller's exact test.
   */
  function forEachNeighborPair(visit: (left: T, right: T) => void) {
    for (const index of usedBuckets) {
      const bucket = buckets[index];
      for (let left = 0; left < bucket.length; left += 1) {
        for (let right = left + 1; right < bucket.length; right += 1) visit(bucket[left], bucket[right]);
      }

      const x = index % columns;
      const y = Math.floor(index / columns);
      const neighborIndices = [
        x + 1 < columns ? index + 1 : -1,
        y + 1 < rows ? index + columns : -1,
        x + 1 < columns && y + 1 < rows ? index + columns + 1 : -1,
        x > 0 && y + 1 < rows ? index + columns - 1 : -1,
      ];
      for (const neighborIndex of neighborIndices) {
        if (neighborIndex < 0) continue;
        const neighbor = buckets[neighborIndex];
        for (const left of bucket) for (const right of neighbor) visit(left, right);
      }
    }
  }

  return { clear, insert, rebuild, queryBounds, forEachNeighborPair };
}
