import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";

const LEET_FOLD: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
};

// Keep this deliberately short and high-confidence. These patterns run only
// on the server and inspect a maximum of 250 characters per accepted attempt.
const SEVERE_HATE_PATTERNS = [
  /(?:^|[^a-z0-9])n+[^a-z0-9]*i+[^a-z0-9]*g+[^a-z0-9]*g+[^a-z0-9]*e+[^a-z0-9]*r+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])n+[^a-z0-9]*i+[^a-z0-9]*g+[^a-z0-9]*g+[^a-z0-9]*a+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])f+[^a-z0-9]*a+[^a-z0-9]*g+[^a-z0-9]*g+[^a-z0-9]*o+[^a-z0-9]*t+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])k+[^a-z0-9]*i+[^a-z0-9]*k+[^a-z0-9]*e+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])wetbacks?(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])t+[^a-z0-9]*r+[^a-z0-9]*a+[^a-z0-9]*n+[^a-z0-9]*y+s*(?:$|[^a-z0-9])/,
] as const;

const EXPLICIT_SEXUAL_PATTERNS = [
  /(?:^|[^a-z0-9])n+[^a-z0-9]*u+[^a-z0-9]*d+[^a-z0-9]*e+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])p+[^a-z0-9]*o+[^a-z0-9]*r+[^a-z0-9]*n+(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])b+[^a-z0-9]*l+[^a-z0-9]*o+[^a-z0-9]*w+[^a-z0-9]*j+[^a-z0-9]*o+[^a-z0-9]*b+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])h+[^a-z0-9]*a+[^a-z0-9]*n+[^a-z0-9]*d+[^a-z0-9]*j+[^a-z0-9]*o+[^a-z0-9]*b+s*(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])r+[^a-z0-9]*a+[^a-z0-9]*p+[^a-z0-9]*e+(?:$|[^a-z0-9])/,
] as const;

const CREDIBLE_THREAT_PATTERNS = [
  /(?:^|[^a-z0-9])(?:kill|shoot|stab)[^a-z0-9]+(?:you|u)[^a-z0-9]+(?:irl|in[^a-z0-9]+real[^a-z0-9]+life)(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])i[^a-z0-9]+know[^a-z0-9]+where[^a-z0-9]+you[^a-z0-9]+live(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])(?:bomb|burn[^a-z0-9]+down)[^a-z0-9]+(?:your|ur)[^a-z0-9]+(?:house|home|school)(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])(?:doxx?|swat)[^a-z0-9]+(?:you|u)(?:$|[^a-z0-9])/,
  /(?:^|[^a-z0-9])leak[^a-z0-9]+(?:your|ur)[^a-z0-9]+address(?:$|[^a-z0-9])/,
] as const;

const INVITE_LINK_PATTERNS = [
  /(?:^|[^a-z0-9])discord\.gg(?:\/|$)/,
  /(?:^|[^a-z0-9])discord(?:app)?\.com\/invite(?:\/|$)/,
  /(?:^|[^a-z0-9])t\.me\/[a-z0-9_/-]+/,
  /(?:^|[^a-z0-9])telegram\.me\/[a-z0-9_/-]+/,
] as const;

const CREDENTIAL_REQUEST_PATTERN = /(?:^|[^a-z0-9])(?:send|give|tell|share)[^a-z0-9]+(?:me[^a-z0-9]+)?(?:your[^a-z0-9]+)?(?:password|login[^a-z0-9]+code|verification[^a-z0-9]+code|recovery[^a-z0-9]+code)(?:$|[^a-z0-9])/;
const LINK_PATTERN = /(?:https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.(?:com|net|org|gg|io|xyz|app|site|link)(?:\/|$))/;
const GEM_SCAM_PATTERN = /(?:^|[^a-z0-9])(?:free|claim|generate|generator|cheap)[^a-z0-9]+(?:wildwood[^a-z0-9]+)?gems?(?:$|[^a-z0-9])/;

function foldForModeration(message: string) {
  return message
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0134578@$!|]/g, (character) => LEET_FOLD[character] ?? character);
}

export function shouldModeratePublicChatMessage(message: string) {
  const folded = foldForModeration(message);
  if (SEVERE_HATE_PATTERNS.some((pattern) => pattern.test(folded))) return true;
  if (EXPLICIT_SEXUAL_PATTERNS.some((pattern) => pattern.test(folded))) return true;
  if (CREDIBLE_THREAT_PATTERNS.some((pattern) => pattern.test(folded))) return true;
  if (INVITE_LINK_PATTERNS.some((pattern) => pattern.test(folded))) return true;
  if (CREDENTIAL_REQUEST_PATTERN.test(folded)) return true;
  return LINK_PATTERN.test(folded) && GEM_SCAM_PATTERN.test(folded);
}

export function moderatePublicChatMessage(message: string) {
  const moderated = shouldModeratePublicChatMessage(message);
  return {
    message: moderated ? MODERATED_CHAT_MESSAGE : message,
    moderated,
  };
}
