import { describe, expect, it } from "vitest";
import { duelAnnouncementText } from "./duel-announcement";

describe("universal duel announcements", () => {
  it("reports a challenger win from the challenger's perspective", () => {
    expect(duelAnnouncementText("Rymel", "Skittle", "CHALLENGER_WIN"))
      .toBe("Rymel beat Skittle in a duel.");
  });

  it("reports a challenger loss from the challenger's perspective", () => {
    expect(duelAnnouncementText("Lucky Hare", "Rymel", "OPPONENT_WIN"))
      .toBe("Lucky Hare lost to Rymel in a duel.");
  });

  it("keeps draws in challenger-first order", () => {
    expect(duelAnnouncementText("Rymel", "Skittle", "DRAW"))
      .toBe("Rymel and Skittle drew a duel.");
  });
});
