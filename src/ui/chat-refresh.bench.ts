import { bench, describe } from "vitest";
import { chatFixture, mountChat } from "../../tests/helpers/chat-controller";

// `npx vitest bench src/ui/chat-refresh.bench.ts --run`. Script time only:
// linkedom has no layout, so the tests count layout reads instead.
for (const large of [false, true]) {
  describe(`chat refresh (${large ? "expanded" : "compact"})`, () => {
    const fixture = chatFixture();
    const { chat, elements, window } = mountChat(fixture.coop);
    if (large) elements.sizeToggle.dispatchEvent(new window.Event("click"));
    chat.refresh();
    const scenarios: [string, () => void][] = [
      ["nothing changed", () => {}],
      ["new message in the open channel", () => fixture.addPublicMessage()],
      ["new message in another channel", () => fixture.addGuildMessage()],
      ["social hub update", () => fixture.touchSocial()],
      ["profile or portrait row", () => fixture.touchChatPresentation()],
    ];
    for (const [name, change] of scenarios) {
      bench(name, () => { change(); chat.refresh(); });
    }
  });
}
