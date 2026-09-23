import { CHAT_REACTIONS, chatReactionCounts } from "../../shared/chat-reactions";

export function appendChatReactions(bubble: HTMLElement, countsJson: string | undefined) {
  const counts = chatReactionCounts(countsJson);
  const visible = Object.keys(counts).flatMap(id => CHAT_REACTIONS.filter(reaction => reaction.id === id));
  if (!visible.length) return;
  bubble.classList.add("has-reactions");
  const reactions = document.createElement("span");
  reactions.className = "chat-bubble-reactions";
  for (const { id, emoji, image, label } of visible) {
    const count = counts[id]!;
    const item = document.createElement("span"); item.className = "chat-bubble-reaction";
    item.setAttribute("aria-label", `${label}: ${count}`);
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    if (image) {
      const art = document.createElement("img"); art.src = image; art.alt = ""; art.draggable = false; icon.append(art);
    } else icon.textContent = emoji;
    item.append(icon);
    const countLabel = document.createElement("span"); countLabel.className = "chat-reaction-count";
    countLabel.textContent = count > 99 ? "99+" : String(count); countLabel.setAttribute("aria-hidden", "true"); item.append(countLabel);
    reactions.append(item);
  }
  bubble.append(reactions);
}
