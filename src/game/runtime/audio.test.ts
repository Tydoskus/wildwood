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
  musicGainForSource,
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

  it("loads a map soundtrack once into a Blob URL before looping it", async () => {
    const instances: FakeAudio[] = [];
    vi.stubGlobal("Audio", class extends FakeAudio {
      constructor(source = "") {
        super(source);
        instances.push(this);
      }
    });
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetchMusic = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(["forest soundtrack"], { type: "audio/mpeg" }),
    }));
    const createObjectURL = vi.fn(() => "blob:forest-soundtrack");
    vi.stubGlobal("fetch", fetchMusic);
    vi.stubGlobal("URL", { createObjectURL });

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
    expect(music.pause).toHaveBeenCalledOnce();
    expect(music.load).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(music.src).toBe("blob:forest-soundtrack"));
    // The short clips are fetched up front too; the soundtrack itself is fetched once.
    const musicFetches = () => fetchMusic.mock.calls.filter((call) => (call as unknown as [string])[0] === "assets/wildstat/audio/forest.mp3");
    expect(musicFetches()).toHaveLength(1);
    expect(fetchMusic).toHaveBeenCalledWith("assets/wildstat/audio/forest.mp3", expect.objectContaining({ cache: "force-cache" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(music.play).toHaveBeenCalledOnce();
    expect(music.loop).toBe(true);

    controller.syncMap(TUTORIAL_FOREST_MAP_ID);
    expect(musicFetches()).toHaveLength(1);
    expect(music.play).toHaveBeenCalledOnce();
  });

  it("uses the Death sting for player death", () => {
    expect(DEATH_SOUND_SOURCE).toBe("assets/wildstat/audio/death.mp3");
  });

  it("ships the trimmed release clip while retaining the original source recording", () => {
    expect(BOW_ATTACK_SOUND_SOURCE).toBe("assets/wildstat/audio/bow-release.mp3");
    const source = readFileSync(new URL("../../../art-source/sounds/bow-release-bow-and-arrow-4.mp3", import.meta.url));
    const runtime = readFileSync(new URL("../../../public/assets/wildstat/audio/bow-release.mp3", import.meta.url));
    expect(runtime.length).toBeGreaterThan(0);
    expect(runtime.length).toBeLessThan(source.length);
    expect(runtime).not.toEqual(source);
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

  it.each(["suspended", "interrupted", "running", "closed"])("recovers audio from %s only when resumable", (state) => {
    const context = new FakeAudioContext();
    context.state = "running";
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const controller = createMapMusicController("test-volume", BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID);
    controller.ensurePlaying(false);
    context.state = state;
    controller.ensurePlaying(false);
    controller.playDeathSound();
    controller.playBowAttackSound();
    expect(context.resume).toHaveBeenCalledTimes(state === "suspended" || state === "interrupted" ? 3 : 0);
    expect(context.gains).toHaveLength(2);
  });

  it("balances the shipped map tracks when the map or music slider changes", () => {
    const context = new FakeAudioContext();
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const controller = createMapMusicController("test-volume", BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID);
    controller.ensurePlaying(false);
    controller.syncMap(TUTORIAL_FOREST_MAP_ID);
    expect(context.gains[0]?.gain.value).toBeCloseTo(.35 * musicGainForSource("assets/wildstat/audio/forest.mp3"));
    controller.syncMap(BEGINNER_DESERT_MAP_ID);
    expect(context.gains[0]?.gain.value).toBeCloseTo(.35 * musicGainForSource("assets/wildstat/audio/desert.mp3"));
    controller.setVolume(.2);
    expect(context.gains[0]?.gain.value).toBeCloseTo(.2 * musicGainForSource("assets/wildstat/audio/desert.mp3"));
    expect(musicGainForSource(SIGN_IN_MUSIC_SOURCE)).toBe(1);
  });

  it.each([1.872, .08])("plays a quietly mixed release voice with a %s-second source", async (duration) => {
    const context = new FakeAudioContext();
    context.decodeAudioData.mockResolvedValue({ duration });
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
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(2)); // bow clip and death sting
    controller.setSfxVolume(.4);
    controller.playBowAttackSound();

    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.playbackRate.value).toBeCloseTo(.965);
    const clipDuration = Math.min(duration, .46);
    expect(context.sources[0]?.start).toHaveBeenCalledWith(context.currentTime, 0, clipDuration);
    const playbackDuration = clipDuration / .965;
    expect(context.gains[2]?.gain.setValueAtTime).toHaveBeenCalledWith(
      BOW_ATTACK_SOUND_GAIN, context.currentTime + playbackDuration - Math.min(.09, playbackDuration * .25),
    );
    expect(fetch).toHaveBeenCalledWith(BOW_ATTACK_SOUND_SOURCE);
    expect(context.gains[1]?.gain.value).toBe(.4);
    expect(context.gains[2]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(BOW_ATTACK_SOUND_GAIN, context.currentTime + .008);
  });
  it("plays a shot that was fired while the clip was still decoding, if it arrives in time", async () => {
    const context = new FakeAudioContext();
    const finishDecode: ((buffer: { duration: number }) => void)[] = [];
    context.decodeAudioData.mockImplementation(() => new Promise((resolve) => { finishDecode.push(resolve); }));
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const controller = createMapMusicController("test-volume", BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, "test-sfx-volume");
    controller.ensurePlaying(false);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalled());
    controller.playBowAttackSound();                 // fired before the clip exists
    expect(context.sources).toHaveLength(0);
    finishDecode[0]!({ duration: 1.872 });           // the bow clip is decoded first
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
  });

  it("plays the death sting as a decoded voice once the graph is up, and from the element before that", async () => {
    const context = new FakeAudioContext();
    context.decodeAudioData.mockResolvedValue({ duration: 4 });
    const instances: FakeAudio[] = [];
    vi.stubGlobal("Audio", class extends FakeAudio { constructor(source = "") { super(source); instances.push(this); } });
    vi.stubGlobal("window", { AudioContext: class { constructor() { return context; } } });
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const controller = createMapMusicController("test-volume", BEGINNER_DESERT_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ADVANCED_LAVA_WASTES_MAP_ID, "test-sfx-volume");
    controller.playDeathSound();                     // graph just created, nothing decoded yet
    expect(instances[1]?.play).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    controller.playDeathSound();
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.start).toHaveBeenCalledOnce();
    expect(instances[1]?.play).toHaveBeenCalledOnce(); // the element was not asked again
  });
});

class FakeAudio {
  currentTime = 0;
  loop = false;
  paused = true;
  preload = "";
  src: string;
  volume = 1;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();

  constructor(source = "") {
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
