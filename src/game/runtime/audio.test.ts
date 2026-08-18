import { describe, expect, it } from "vitest";
import { musicSourceForMap, SIGN_IN_MUSIC_SOURCE } from "./audio";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
} from "../world";

describe("map music", () => {
  it("uses Light Ambient 4 on sign-in", () => {
    expect(SIGN_IN_MUSIC_SOURCE).toBe("assets/wildwood/audio/signin.mp3");
  });

  it("uses Ambient 10 for Snowlands", () => {
    expect(musicSourceForMap(INTERMEDIATE_SNOWLANDS_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildwood/audio/snow.mp3");
  });

  it("keeps existing forest and desert tracks", () => {
    expect(musicSourceForMap(TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildwood/audio/forest.mp3");
    expect(musicSourceForMap(BEGINNER_DESERT_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildwood/audio/desert.mp3");
  });

  it("reuses the warm desert track for Lava Wastes", () => {
    expect(musicSourceForMap(ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildwood/audio/desert.mp3");
  });
});
