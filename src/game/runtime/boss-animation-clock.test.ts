import { expect, it } from 'vitest';
import { carapaceAnglerSpriteFrame, CARAPACE_ANGLER_ATLAS } from './carapace-angler-sprite';
import { ironhornSpriteFrame, IRONHORN_ATLAS } from './ironhorn-sprite';
import { dreadreaperSpriteFrame, DREADREAPER_ATLAS } from './dreadreaper-sprite';
for (const [name, frame, atlas] of [
  ['Angler', carapaceAnglerSpriteFrame, CARAPACE_ANGLER_ATLAS],
  ['Ironhorn', ironhornSpriteFrame, IRONHORN_ATLAS],
  ['Dreadreaper', dreadreaperSpriteFrame, DREADREAPER_ATLAS],
] as const) {
  it(`${name} returns to idle when its clip finishes, even with lingering hazards`, () => {
    const duration = atlas.animations.attack.durationMs / 1000;
    expect(frame(2, duration - .001).tuningFrame).toBe(atlas.animations.idle.frames.length + atlas.animations.attack.frames.length - 1);
    expect(frame(2, duration)).toEqual(frame(2));
    expect(frame(2, duration + 3)).toEqual(frame(2));
    expect(frame(2, 0).tuningFrame).toBe(atlas.animations.idle.frames.length);
  });
}
