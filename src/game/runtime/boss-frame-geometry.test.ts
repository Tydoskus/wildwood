import { describe, expect, it } from 'vitest';
import { bossSheetFrameGeometry } from './boss-frame-geometry';
const frame = { bossId: 'test', frame: 1, cellWidth: 100, cellHeight: 200, drawWidth: 200, drawHeight: 400 };
describe('isolated boss frame geometry', () => {
  it('pads an expanded crop with transparency rather than drawing the neighboring pose', () => {
    expect(bossSheetFrameGeometry(frame, { sourceX: -20, sourceWidth: 40 })).toEqual({
      sourceX: 100, sourceY: 0, sourceWidth: 100, sourceHeight: 200,
      x: -100, y: -200, width: 200, height: 400,
    });
  });
  it('trims a close neighbor without resizing or moving the retained pixels', () => {
    const full = bossSheetFrameGeometry(frame)!;
    const trimmed = bossSheetFrameGeometry(frame, { clipLeft: 10, clipRight: 5 })!;
    expect(trimmed.sourceWidth).toBe(85);
    expect(trimmed.x - (trimmed.sourceX - full.sourceX) * 2).toBe(full.x);
    expect(trimmed.width / trimmed.sourceWidth).toBe(2);
  });
  it('lets an isolated frame edge extend for an overhanging pose and rejects empty crops', () => {
    expect(bossSheetFrameGeometry(frame, { sourceX: -20, sourceWidth: 40, clipLeft: -20 })!.sourceX).toBe(80);
    expect(bossSheetFrameGeometry(frame, { clipLeft: 80, clipRight: 40 })).toBeNull();
  });
  it('preserves explicit atlas anchors and feet anchors', () => {
    expect(bossSheetFrameGeometry({ ...frame, sourceX: 500, sourceY: 300, left: -80, top: -300 }) )
      .toMatchObject({ sourceX: 500, sourceY: 300, x: -80, y: -300 });
  });
});
