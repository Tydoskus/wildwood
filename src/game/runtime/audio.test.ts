import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapMusicController, DEATH_SOUND_SOURCE, musicSourceForMap, SIGN_IN_MUSIC_SOURCE } from "./audio";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
} from "../world";

describe("map music", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("uses Night Ambient 5 for Lava Wastes", () => {
    expect(musicSourceForMap(ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildwood/audio/lava.mp3");
  });

  it("uses the Death sting for player death", () => {
    expect(DEATH_SOUND_SOURCE).toBe("assets/wildwood/audio/death.mp3");
  });

  it("plays death audio through the shared volume and mute control", () => {
    const instances: FakeAudio[] = [];
    vi.stubGlobal("Audio", class extends FakeAudio {
      constructor(source: string) {
        super(source);
        instances.push(this);
      }
    });
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: () => null });

    const controller = createMapMusicController(
      "test-volume",
      BEGINNER_DESERT_MAP_ID,
      INTERMEDIATE_SNOWLANDS_MAP_ID,
      ADVANCED_LAVA_WASTES_MAP_ID,
    );
    controller.setVolume(.25);
    controller.playDeathSound();

    expect(instances[1]?.src).toBe(DEATH_SOUND_SOURCE);
    expect(instances[1]?.volume).toBe(.25);
    expect(instances[1]?.play).toHaveBeenCalledOnce();

    controller.setVolume(0);
    controller.playDeathSound();
    expect(instances[1]?.play).toHaveBeenCalledOnce();
  });
});

class FakeAudio {
  currentTime = 0;
  loop = false;
  paused = true;
  preload = "";
  src: string;
  volume = 1;
  play = vi.fn(async () => {});

  constructor(source: string) {
    this.src = source;
  }

  getAttribute(name: string) {
    return name === "src" ? this.src : null;
  }

  load() {}
}
