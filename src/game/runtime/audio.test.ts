import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOW_ATTACK_SOUND_GAIN,
  BOW_ATTACK_SOUND_RATE_MAX,
  BOW_ATTACK_SOUND_RATE_MIN,
  BOW_ATTACK_SOUND_SOURCE,
  bowAttackPlaybackRate,
  createMapMusicController,
  DEATH_SOUND_SOURCE,
  musicSourceForMap,
  SIGN_IN_MUSIC_SOURCE,
} from "./audio";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
} from "../world";

describe("map music", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses Light Ambient 4 on sign-in", () => {
    expect(SIGN_IN_MUSIC_SOURCE).toBe("assets/wildstat/audio/signin.mp3");
  });

  it("uses Ambient 10 for Snowlands", () => {
    expect(musicSourceForMap(INTERMEDIATE_SNOWLANDS_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildstat/audio/snow.mp3");
  });

  it("keeps existing forest and desert tracks", () => {
    expect(musicSourceForMap(TUTORIAL_FOREST_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildstat/audio/forest.mp3");
    expect(musicSourceForMap(BEGINNER_DESERT_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildstat/audio/desert.mp3");
  });

  it("uses Night Ambient 5 for Lava Lake", () => {
    expect(musicSourceForMap(ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildstat/audio/lava.mp3");
  });

  it("uses Night Ambient 3 for Night Forest", () => {
    expect(musicSourceForMap(INFERNAL_DEPTHS_MAP_ID, BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID)).toBe("assets/wildstat/audio/night-forest.mp3");
  });

  it("loads a map soundtrack on demand through the playback element", () => {
    const instances: FakeAudio[] = [];
    vi.stubGlobal("Audio", class extends FakeAudio {
      constructor(source: string) {
        super(source);
        instances.push(this);
      }
    });
    vi.stubGlobal("localStorage", { getItem: () => null });

    const controller = createMapMusicController(
      "test-volume",
      BEGINNER_DESERT_MAP_ID,
      INTERMEDIATE_SNOWLANDS_MAP_ID,
      ADVANCED_LAVA_WASTES_MAP_ID,
    );
    const music = instances[0]!;
    music.paused = false;
    controller.syncMap(TUTORIAL_FOREST_MAP_ID);

    expect(instances).toHaveLength(2);
    expect(music.src).toBe("assets/wildstat/audio/forest.mp3");
    expect(music.load).not.toHaveBeenCalled();
    expect(music.play).toHaveBeenCalledOnce();

    controller.syncMap(TUTORIAL_FOREST_MAP_ID);
    expect(music.play).toHaveBeenCalledOnce();
  });

  it("uses the Death sting for player death", () => {
    expect(DEATH_SOUND_SOURCE).toBe("assets/wildstat/audio/death.mp3");
  });

  it("ships the vendor bow release as the runtime attack sound", () => {
    expect(BOW_ATTACK_SOUND_SOURCE).toBe("assets/wildstat/audio/bow-release.mp3");
    const source = readFileSync(new URL("../../../art-source/sounds/bow-release-bow-and-arrow-4.mp3", import.meta.url));
    const runtime = readFileSync(new URL("../../../public/assets/wildstat/audio/bow-release.mp3", import.meta.url));
    expect(runtime).toEqual(source);
  });

  it("varies bow pitch up to seven percent below the original", () => {
    expect(BOW_ATTACK_SOUND_RATE_MIN).toBe(.93);
    expect(BOW_ATTACK_SOUND_RATE_MAX).toBe(1);
    expect(bowAttackPlaybackRate(0)).toBe(BOW_ATTACK_SOUND_RATE_MIN);
    expect(bowAttackPlaybackRate(.5)).toBeCloseTo(.965);
    expect(bowAttackPlaybackRate(1)).toBe(BOW_ATTACK_SOUND_RATE_MAX);
    expect(bowAttackPlaybackRate(Number.NaN)).toBe(1);
  });

  it("controls death audio independently through the SFX volume", () => {
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
      "test-sfx-volume",
    );
    controller.setVolume(.25);
    controller.setSfxVolume(.6);
    controller.playDeathSound();

    expect(instances[1]?.src).toBe(DEATH_SOUND_SOURCE);
    expect(instances[0]?.volume).toBe(.25);
    expect(instances[1]?.volume).toBe(.6);
    expect(instances[1]?.play).toHaveBeenCalledOnce();

    controller.setVolume(0);
    controller.playDeathSound();
    expect(instances[1]?.play).toHaveBeenCalledTimes(2);

    controller.setSfxVolume(0);
    controller.playDeathSound();
    expect(instances[1]?.play).toHaveBeenCalledTimes(2);
  });

  it("plays a short, quietly mixed bow voice through Web Audio", async () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    })));
    vi.spyOn(Math, "random").mockReturnValue(.5);

    const controller = createMapMusicController(
      "test-volume",
      BEGINNER_DESERT_MAP_ID,
      INTERMEDIATE_SNOWLANDS_MAP_ID,
      ADVANCED_LAVA_WASTES_MAP_ID,
      "test-sfx-volume",
    );
    controller.ensurePlaying(false);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    controller.setSfxVolume(.4);
    controller.playBowAttackSound();

    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.playbackRate.value).toBeCloseTo(.965);
    expect(context.sources[0]?.start).toHaveBeenCalledWith(context.currentTime, 0, .46);
    expect(context.gains[1]?.gain.value).toBe(.4);
    expect(context.gains[2]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(BOW_ATTACK_SOUND_GAIN, context.currentTime + .008);
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
  load = vi.fn();

  constructor(source: string) {
    this.src = source;
  }

  getAttribute(name: string) {
    return name === "src" ? this.src : null;
  }

}

class FakeAudioParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setValueAtTime = vi.fn();
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSource {
  buffer: { duration: number } | null = null;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  currentTime = 12;
  decodeAudioData = vi.fn(async () => ({ duration: 1.872 }));
  destination = {};
  gains: FakeGainNode[] = [];
  sources: FakeBufferSource[] = [];
  state = "running";
  createBufferSource = () => {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  };
  createGain = () => {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  };
  createMediaElementSource = () => ({ connect: vi.fn() });
  resume = vi.fn(async () => {});
}
