// Presence messages deliberately leave senderName blank so clients can render
// them as plain system text without player portraits, names, power, or gender.
export function isPresenceChatMessage(senderName: string) {
  return senderName.length === 0;
}
