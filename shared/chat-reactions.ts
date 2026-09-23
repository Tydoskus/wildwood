export const CHAT_REACTIONS = [
  { id: "like", emoji: "👍", image: "", label: "Thumbs up" },
  { id: "laugh", emoji: "😂", image: "", label: "Laugh" },
  { id: "heart", emoji: "❤️", image: "", label: "Heart" },
  { id: "dislike", emoji: "👎", image: "", label: "Thumbs down" },
  { id: "gemHeart", emoji: "", image: "assets/wildstat/gems/gem-heart-reaction.webp", label: "Gem heart" },
] as const;
export type ChatReaction = typeof CHAT_REACTIONS[number]["id"];
export type ChatReactionCounts = Partial<Record<ChatReaction, number>>;
export type ChatReactionState = { counts: ChatReactionCounts; selected: ChatReaction[]; gemHeartUnlocked?: boolean };
export function isChatReaction(value: string): value is ChatReaction { return CHAT_REACTIONS.some(reaction => reaction.id === value); }
export function chatReactionCounts(json: string | undefined): ChatReactionCounts {
  try {
    const value = JSON.parse(json ?? "{}");
    return Object.fromEntries(Object.entries(value ?? {}).filter(([id, count]) =>
      isChatReaction(id) && Number.isSafeInteger(count) && Number(count) > 0));
  } catch { return {}; }
}
