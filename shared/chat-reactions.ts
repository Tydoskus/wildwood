export const CHAT_REACTIONS = [
  { id: "like", emoji: "👍", image: "", label: "Thumbs up" },
  { id: "laugh", emoji: "😂", image: "", label: "Laugh" },
  { id: "heart", emoji: "❤️", image: "", label: "Heart" },
  { id: "dislike", emoji: "👎", image: "", label: "Thumbs down" },
  { id: "gemHeart", emoji: "", image: "assets/wildstat/gems/gem-heart-reaction.webp", label: "Gem heart" },
  { id: "greenHeart", emoji: "", image: "assets/wildstat/gems/gem-heart-green-reaction.webp", label: "Green gem heart" },
] as const;
export type ChatReaction = typeof CHAT_REACTIONS[number]["id"];
export type ChatReactionCounts = Partial<Record<ChatReaction, number>>;
/** Each moderator's own heart: only its owner can react with it. */
export const MODERATOR_HEARTS = ["gemHeart", "greenHeart"] as const;
export type ModeratorHeart = typeof MODERATOR_HEARTS[number];
export function isModeratorHeart(value: string): value is ModeratorHeart { return (MODERATOR_HEARTS as readonly string[]).includes(value); }
/** gemHeartUnlocked stays for clients from before moderators had their own hearts. */
export type ChatReactionState = { counts: ChatReactionCounts; selected: ChatReaction[]; gemHeartUnlocked?: boolean; moderatorHeart?: ModeratorHeart };
/** What the viewer may do in chat beyond a player: a moderator's heart, and whether their reports remove messages. */
export type ChatRole = { moderatorHeart: ModeratorHeart | null; canModerate: boolean };
export function isChatReaction(value: string): value is ChatReaction { return CHAT_REACTIONS.some(reaction => reaction.id === value); }
export function chatReactionCounts(json: string | undefined): ChatReactionCounts {
  try {
    const value = JSON.parse(json ?? "{}");
    return Object.fromEntries(Object.entries(value ?? {}).filter(([id, count]) =>
      isChatReaction(id) && Number.isSafeInteger(count) && Number(count) > 0));
  } catch { return {}; }
}
