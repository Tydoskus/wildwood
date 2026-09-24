import { describe, expect, it } from "vitest";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import {
  chatModerationReason,
  displayNameModerationReason,
  guildNameModerationReason,
  isPublicDisplayNameAllowed,
  moderatePublicChatMessage,
  normalizeModerationText,
  shouldModeratePublicChatMessage,
} from "./chat-moderation";

describe("public chat moderation", () => {
  it("leaves ordinary gameplay chat untouched", () => {
    const allowed = [
      "I killed the dragon boss",
      "Join me in the desert",
      "Niger is a country",
      "The grape dropped near the bench",
      "The path is wet back near the portal",
      "The daily bonus gives free gems",
      "Message moderated.",
      "Sex education is part of health class",
      "That boss fucked me up",
    ];

    for (const message of allowed) {
      expect(moderatePublicChatMessage(message)).toEqual({ message, moderated: false });
    }
  });

  it("catches severe slurs with simple leetspeak and separator evasions", () => {
    expect(shouldModeratePublicChatMessage("n1gg3r")).toBe(true);
    expect(shouldModeratePublicChatMessage("f.a.g.g.0.t")).toBe(true);
    expect(shouldModeratePublicChatMessage("wetback")).toBe(true);
  });

  it("catches explicit sexual content", () => {
    expect(shouldModeratePublicChatMessage("send n.u.d.e.s")).toBe(true);
    expect(shouldModeratePublicChatMessage("visit this porn page")).toBe(true);
  });

  it("catches direct sexual solicitation without blocking standalone context", () => {
    const blocked = [
      "i want sex",
      "have sex with me",
      "i fuck you so hot",
      "i want to fuck you",
      "lets fuck and have sex",
      "f.u.c.k you",
      "f*ck you",
      "I want s3x",
    ];
    for (const message of blocked) expect(shouldModeratePublicChatMessage(message)).toBe(true);
    expect(shouldModeratePublicChatMessage("sex")).toBe(false);
    expect(shouldModeratePublicChatMessage("sex education")).toBe(false);
  });

  it("catches credible real-world threats without hiding normal combat talk", () => {
    expect(shouldModeratePublicChatMessage("I will kill you irl")).toBe(true);
    expect(shouldModeratePublicChatMessage("I know where you live")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will dox you")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will kill your lava boss")).toBe(false);
  });

  it.each([
    "Eat my ass", "KISS MY ASS", "suck my dick", "lick your balls", "eatmyass",
    "e.a.t m.y a.s.s", "eat my @ss", "suck my d1ck", "Ｅａｔ ｍｙ ａｓｓ",
    "eat my a\u200bs\u200bs", "eeaaat my assss", "eat my a$$", "eat my @$$",
  ])("moderates directed sexual insults: %s", (message) => {
    expect(moderatePublicChatMessage(message)).toEqual({ message: MODERATED_CHAT_MESSAGE, moderated: true });
    expect(isPublicDisplayNameAllowed(message)).toBe(false);
  });

  it.each([
    "A naked little boy", "NakedLittleBoy", "Naked_Little_Boy", "n4k3d l1ttl3 b0y",
    "n a k e d k i d", "NudeGirl", "ToplessTeen", "BottomlessBaby", "NakedYoungChild",
    "NakedTinyGirl", "NakedLilBoy", "KidNaked", "ANakedLittleBoy123", "nnaked little boy",
  ])("rejects child-nudity-themed names: %s", (name) => {
    expect(isPublicDisplayNameAllowed(name)).toBe(false);
  });

  it.each(["Fartin", "Hassan", "Assassin", "Scunthorpe", "Boysen", "BabyDragon", "TeenTitan", "ChildOfLight", "NakedMoleRat"])("keeps harmless names allowed: %s", (name) => {
    expect(isPublicDisplayNameAllowed(name)).toBe(true);
  });

  it.each([
    "That boss kicked my ass", "You suck at duels", "I need to eat my food",
    "My assassin needs better gear", "The boss can eat my assassin alive",
    "My character is naked without armor", "The kids are playing", "That was a damn close duel",
    "Please report usernames about naked children",
  ])("keeps gameplay banter and ordinary discussion: %s", (message) => {
    expect(shouldModeratePublicChatMessage(message)).toBe(false);
  });

  it("catches invite links and high-confidence scams", () => {
    expect(shouldModeratePublicChatMessage("join https://discord.gg/example")).toBe(true);
    expect(shouldModeratePublicChatMessage("join discord dot gg example")).toBe(true);
    expect(shouldModeratePublicChatMessage("free gems https://bad.example.xyz")).toBe(true);
    expect(shouldModeratePublicChatMessage("send me your password")).toBe(true);
  });

  it.each(["Wildstat", "Wildwood", "WILDSTAT", "W1LDST4T"])("detects gem-scam links using %s without blocking normal reward discussion", (name) => {
    expect(shouldModeratePublicChatMessage(`free ${name} gems https://bad.example.xyz`)).toBe(true);
    expect(shouldModeratePublicChatMessage(`The daily bonus gives free ${name} gems`)).toBe(false);
  });

  it("catches high-confidence personal-information requests", () => {
    expect(shouldModeratePublicChatMessage("send me your home address")).toBe(true);
    expect(shouldModeratePublicChatMessage("what's your phone number")).toBe(true);
    expect(shouldModeratePublicChatMessage("share your real name")).toBe(true);
    expect(shouldModeratePublicChatMessage("where is the lava boss located")).toBe(false);
  });

  it("normalizes Unicode, leetspeak, separators, and long letter runs only for comparison", () => {
    expect(normalizeModerationText("  F...U...C...K YOU!!!  ")).toBe("fuck you");
    expect(normalizeModerationText("I want s333xxxx")).toBe("i want sex");
  });

  it("applies the same high-confidence filter to display names", () => {
    expect(isPublicDisplayNameAllowed("F_u_c_k")).toBe(false);
    expect(isPublicDisplayNameAllowed("WantSex")).toBe(false);
    expect(isPublicDisplayNameAllowed("Sex Education")).toBe(true);
    expect(isPublicDisplayNameAllowed("Niger Explorer")).toBe(true);
    expect(isPublicDisplayNameAllowed("NiggerSlayer")).toBe(false);
    expect(isPublicDisplayNameAllowed("N1gg3r_Slayer")).toBe(false);
    expect(isPublicDisplayNameAllowed("N word Slayer")).toBe(false);
    expect(isPublicDisplayNameAllowed("Potato slayer")).toBe(true);
  });

  describe("look-alike letter substitutions", () => {
    // Every evasion folds to a slur only once q/9/6 read as g, l/1/!/|/ı read
    // as i, ph as f, vv as w, and look-alike Unicode letters as Latin.
    const evasions = [
      "FireNiqqa", "Niqqer", "N1qqa", "NiqqaSlayer", "Nlgga", "NLGGA", "Ni99a", "Ni66er", "Ni9qa",
      "N!gga", "N|gga", "Nígga", "Nìgga", "Nïgga", "Nıgga", "Niqq3r", "N1qq4", "Niqq@",
      "n.i.q.q.a", "n i q q a", "n_l_g_g_a", "n-i-q-q-e-r", "n..i..q..q..a",
      "n​i​q​q​a", "n­iqqa", "ｎｉｑｑａ", "ＮＩＱＱＥＲ",
      "ΝІGGA", // Greek capital Nu, Cyrillic I
      "nіggа", // Cyrillic i and a
      "піgga", // Cyrillic small pe reads as n
      "nigɡa", // Latin script g
      "phaggot", "faqqot", "f4qq0t", "vvetback", "klke", "k1ke", "tranny", "tr4nny",
    ];

    it.each(evasions)("blocks the display name %s", (name) => {
      expect(isPublicDisplayNameAllowed(name)).toBe(false);
      expect(displayNameModerationReason(name)).toMatch(/^Hateful (?:language|username)$/);
    });

    it.each(evasions.filter(name => !/(?:Slayer|^Fire)/.test(name)))("filters the chat message %s", (message) => {
      expect(shouldModeratePublicChatMessage(`you are a ${message} lol`)).toBe(true);
      expect(chatModerationReason(`you are a ${message}`)).toBe("Hateful language");
    });

    it("reports the display-name reason for compound look-alike names", () => {
      expect(displayNameModerationReason("FireNiqqa")).toBe("Hateful username");
      expect(displayNameModerationReason("NiqqaSlayer")).toBe("Hateful username");
      expect(displayNameModerationReason("xX_Nlgger_Xx")).not.toBeNull();
    });

    it.each([
      "NakedLlttleGlrl", "Naked_Lil_Kld", "NudeGlrls", "T0pl3ssT33n", "NakеdKid",
    ])("blocks look-alike child-nudity names: %s", (name) => {
      expect(displayNameModerationReason(name)).toBe("Sexualized reference to a child");
    });

    it.each(["send nυdes", "blovvjob", "bl0vvj0b", "pоrn"])("filters look-alike explicit terms: %s", (message) => {
      expect(chatModerationReason(message)).toBe("Explicit sexual content");
    });

    it("applies the look-alike fold to guild names", () => {
      expect(guildNameModerationReason("NlGS")).not.toBeNull();
      expect(guildNameModerationReason("QOOK")).toBe("Offensive guild name");
      expect(guildNameModerationReason("SLUT")).toBe("Offensive guild name");
      for (const name of ["Qing", "Ling", "Liqd", "Lqqk", "Eggs", "Nigh", "Soup"]) expect(guildNameModerationReason(name), name).toBeNull();
    });

    // Words and names that contain the same letters and must stay usable.
    // "Niger" (the country and river) and "Nigerian" stay allowed: the slur
    // patterns require a doubled g, so a single-g "niqer" is allowed as well.
    const harmless = [
      "night", "nigh", "Niger", "Nigeria", "Nigerian", "signal", "align", "liquid", "quiet", "queen",
      "eggs", "big", "digger", "trigger", "Niko", "Ling", "Qing", "Iqbal", "Tariq", "lqqk", "Nigel",
      "Nigella", "Nightingale", "Knight", "Ninja", "Enigma", "Niggle", "Sniggle", "Ningguang",
      "Lingga", "Aqua", "Iggy", "Luigi", "Iggle", "Biggles", "Riggs", "Wiggles", "Liggett", "Quigley",
      "Gilligan", "Philip", "Phaser", "Vvardenfell", "Klee", "Kiki", "Frank", "Grape", "Poppy",
      "NakedMoleRat", "LittleGirlBlue", "Dan1996", "Nini99", "Qqqq", "Dragon666",
    ];

    it.each(harmless)("keeps the display name %s", (name) => {
      expect(displayNameModerationReason(name)).toBeNull();
    });

    it.each(harmless)("keeps the chat word %s", (word) => {
      expect(shouldModeratePublicChatMessage(`meet ${word} near the portal`)).toBe(false);
    });

    it.each([
      "Snigger at the boss", "The Niger river floods", "I snigger at that", "big eggs", "quiet queen",
      "привет, как дела?", // Russian: hi, how are you?
      "Γεια σου φίλε", // Greek: hello friend
    ])("keeps the chat message %s", (message) => {
      expect(shouldModeratePublicChatMessage(message)).toBe(false);
    });

    it("still blocks a name built around the slur with a letter in front", () => {
      // Usernames have no word boundaries, so "Snigger" reads as the slur and
      // was already rejected before look-alike folding; chat is unaffected.
      expect(isPublicDisplayNameAllowed("Snigger")).toBe(false);
    });
  });

  it("replaces moderated content without retaining the original text", () => {
    expect(moderatePublicChatMessage("send nudes")).toEqual({
      message: MODERATED_CHAT_MESSAGE,
      moderated: true,
    });
  });
});
