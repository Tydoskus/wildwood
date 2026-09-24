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
const GEM_SCAM_PATTERN = /(?:^|[^a-z0-9])(?:free|claim|generate|generator|cheap)[^a-z0-9]+(?:(?:wildstat|wildwood)[^a-z0-9]+)?gems?(?:$|[^a-z0-9])/;

// These run against the comparison-only normalized form. Exact "sex" remains
// allowed so benign references such as "sex education" do not disappear, but
// direct solicitation and targeting are high-confidence moderation cases.
const SEXUAL_SOLICITATION_PATTERNS = [
  /\b(?:i\s*)?(?:want|need)\s*(?:to\s*)?(?:have\s*)?sex\b/,
  /\b(?:have|having)\s*sex\s*with\s*(?:me|you|u)\b/,
  /\bsex\s*with\s*(?:me|you|u)\b/,
  /\b(?:lets|let\s*s|let\s*us|can\s*we|could\s*we|wanna)\s*(?:have\s*)?sex\b/,
  /\bfuck\b/,
  /\bfuck(?:me|you|u)\b/,
  /\bfucking\s*(?:me|you|u)\b/,
] as const;

// Match only complete directed phrases, including spaced-out letters. Do not
// block standalone body-part words or gameplay phrases like "kicked my ass".
const spacedTerm = (word: string) => word.split("").map(letter => `${letter}+`).join("\\s*");
const termChoices = (words: string[]) => `(?:${words.map(spacedTerm).join("|")})`;
const DIRECTED_SEXUAL_INSULT_PATTERN = new RegExp(
  `\\b${termChoices(["eat", "lick", "suck", "kiss"])}\\s*`
  + `${termChoices(["my", "your", "ur", "his", "her", "their"])}\\s*`
  + `${termChoices(["ass", "arse", "dick", "cock", "balls", "pussy"])}\\b`,
);

// Names have no surrounding conversational context. Check compact forms too,
// so joining the words or inserting underscores cannot bypass this rule.
// Keep this name-only: ordinary discussion about children or an unequipped
// character should not disappear from chat.
const childName = termChoices(["boy", "boys", "girl", "girls", "kid", "kids", "child", "children", "teen", "teens", "baby", "babies"]);
const nudityName = termChoices(["naked", "nude", "topless", "bottomless"]);
const childQualifier = `${termChoices(["little", "young", "tiny", "lil"])}?`;
const CHILD_NUDITY_NAME_PATTERN = new RegExp(
  `${nudityName}${childQualifier}${childName}|${childName}${childQualifier}${nudityName}`,
);

const PERSONAL_INFORMATION_REQUEST_PATTERNS = [
  /\b(?:send|give|tell|share)\s*(?:me\s*)?(?:your|ur)\s*(?:home\s*)?(?:address|phone\s*number|email(?:\s*address)?|full\s*name|real\s*name|location)\b/,
  /\b(?:what\s*is|what\s*s|whats)\s*(?:your|ur)\s*(?:home\s*)?(?:address|phone\s*number|email(?:\s*address)?|full\s*name|real\s*name|location)\b/,
] as const;

const NORMALIZED_INVITE_PATTERNS = [
  /\bdiscord\s*(?:dot\s*)?gg\b/,
  /\bdiscord(?:app)?\s*(?:dot\s*)?com\s*invite\b/,
  /\b(?:t|telegram)\s*(?:dot\s*)?me\s+[a-z0-9_/-]+/,
] as const;

function foldForModeration(message: string) {
  return message
    .trim()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0134578@$!|]/g, (character, index, input) => {
      if (/\d/.test(character)) return LEET_FOLD[character] ?? character;
      const embedded = /[a-z0-9]/.test(input[index - 1] ?? "") && /[a-z0-9]/.test(input[index + 1] ?? "");
      return embedded ? LEET_FOLD[character] ?? character : character;
    });
}

// Look-alike folding is deliberately stronger than foldForModeration and is
// used ONLY for the severe patterns (slurs, explicit sexual terms, sexualized
// references to children). It merges letters that are hard to tell apart
// (i/l, g/q), which would create false positives on ordinary profanity lists.
//
// Characters that survive NFKD but read as Latin letters. Upper-case forms are
// listed separately because Greek capital Nu lowercases to "ν", which reads v.
const CONFUSABLE_LETTERS: Readonly<Record<string, string>> = {
  // Cyrillic
  "А": "a", "а": "a", "В": "b", "в": "b", "Е": "e", "е": "e", "г": "r", "И": "n", "и": "n",
  "І": "i", "і": "i", "Ј": "j", "ј": "j", "К": "k", "к": "k", "М": "m", "м": "m", "Н": "h", "н": "h",
  "О": "o", "о": "o", "П": "n", "п": "n", "Р": "p", "р": "p", "С": "c", "с": "c", "Т": "t", "т": "t",
  "У": "y", "у": "y", "Х": "x", "х": "x", "Ѕ": "s", "ѕ": "s", "Ԛ": "q", "ԛ": "q", "Ԝ": "w", "ԝ": "w",
  "Ӏ": "l", "ӏ": "l", "ԁ": "d", "ԍ": "g", "һ": "h", "ь": "b", "ъ": "b", "ш": "w", "щ": "w",
  // Greek
  "Α": "a", "α": "a", "Β": "b", "β": "b", "Ε": "e", "ε": "e", "Ζ": "z", "Η": "h", "η": "n", "Ι": "i",
  "ι": "i", "Κ": "k", "κ": "k", "Μ": "m", "Ν": "n", "ν": "v", "Ο": "o", "ο": "o", "Ρ": "p", "ρ": "p",
  "Τ": "t", "τ": "t", "Υ": "y", "υ": "u", "Χ": "x", "χ": "x", "ω": "w", "π": "n", "μ": "u",
  // Armenian
  "ո": "n", "ս": "u", "օ": "o", "ց": "g", "զ": "q", "հ": "h",
  // Latin letters without a decomposition
  "ı": "i", "ɩ": "i", "ǀ": "l", "ł": "l", "ɡ": "g", "ɢ": "g", "ɑ": "a", "ø": "o", "đ": "d", "ħ": "h",
  "ŋ": "n", "¡": "i",
};
const CONFUSABLE_PATTERN = new RegExp(`[${Object.keys(CONFUSABLE_LETTERS).join("")}]`, "g");
// Zero-width and other invisible characters that can split a word. U+034F
// (combining grapheme joiner) already goes with the combining marks.
const INVISIBLE_CHARACTERS = /[­ᅟᅠ᠎​-‏‪-‮⁠-⁤ㅤ﻿]/g;

function foldLookalikes(message: string) {
  const latin = message
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(CONFUSABLE_PATTERN, character => CONFUSABLE_LETTERS[character] ?? character);
  return foldForModeration(latin)
    // foldForModeration keeps a leading or trailing symbol so @mentions and
    // prices survive; the plain form is still checked, so fold them all here.
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[!|]/g, "i")
    .replace(/ph/g, "f")
    .replace(/vv/g, "w")
    .replace(/l/g, "i")
    .replace(/[q96]/g, "g");
}

// The same fold applied to a pattern's own letters, so a pattern word that
// contains "l" (girl, little, blowjob) still matches once text l became i.
// These pattern sources hold only literal letters, classes like [^a-z0-9]
// (no l or q inside) and regex syntax, so swapping the letters is safe.
const lookalikePattern = (pattern: RegExp) =>
  new RegExp(pattern.source.replace(/l/g, "i").replace(/q/g, "g"), pattern.flags);

/** Look-alike form of a name with every separator removed ("N.i q_q-a" -> "nigga"). */
function compactLookalike(name: string) {
  return foldLookalikes(name).replace(/[^a-z0-9]+/g, "");
}

export function normalizeModerationText(message: string) {
  const normalized = foldForModeration(message)
    // Leading/trailing symbols are normally punctuation. Recognize these
    // specific body-part evasions without folding every @mention or dollar sign.
    .replace(/(^|[^a-z0-9])(?:@s{2,}|[a@]\${2,})(?=$|[^a-z0-9])/g, "$1ass")
    .replace(/([a-z0-9])\1{2,}/g, "$1$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized
    // Canonicalize only the explicit terms whose separator evasions we match.
    // Optional "u" intentionally catches the common censored form "f*ck".
    .replace(/(^| )s+\s*e+\s*x+(?= |$)/g, "$1sex")
    .replace(/(^| )f+\s*(?:u+\s*)?c+\s*k+(?= |$)/g, "$1fuck");
}

// Recorded as the `rule` on every automatic moderation_action row, so the log
// shows which filter made a call. Changing it re-checks nothing by itself.
export const MODERATION_RULE_VERSION = "content-filter-v5";

const LOOKALIKE_SEVERE_HATE_PATTERNS = SEVERE_HATE_PATTERNS.map(lookalikePattern);
const LOOKALIKE_EXPLICIT_SEXUAL_PATTERNS = EXPLICIT_SEXUAL_PATTERNS.map(lookalikePattern);
// Compound usernames have no word boundaries: appending a title must not
// make this racial slur acceptable. Keep this separate from chat discussion.
const HATEFUL_USERNAME_PATTERN = /(?:n+i+g+g+(?:e+r+|a+)|nword(?:slayer|killer))/;
const LOOKALIKE_HATEFUL_USERNAME_PATTERN = lookalikePattern(HATEFUL_USERNAME_PATTERN);
const LOOKALIKE_CHILD_NUDITY_NAME_PATTERN = lookalikePattern(CHILD_NUDITY_NAME_PATTERN);

export function chatModerationReason(message: string): string | null {
  const folded = foldForModeration(message);
  const normalized = normalizeModerationText(message);
  const lookalike = foldLookalikes(message);
  if (SEVERE_HATE_PATTERNS.some(pattern => pattern.test(folded))
    || LOOKALIKE_SEVERE_HATE_PATTERNS.some(pattern => pattern.test(lookalike))) return "Hateful language";
  if (EXPLICIT_SEXUAL_PATTERNS.some(pattern => pattern.test(folded))
    || LOOKALIKE_EXPLICIT_SEXUAL_PATTERNS.some(pattern => pattern.test(lookalike))) return "Explicit sexual content";
  if (SEXUAL_SOLICITATION_PATTERNS.some(pattern => pattern.test(normalized))) return "Sexual solicitation";
  if (DIRECTED_SEXUAL_INSULT_PATTERN.test(normalized)) return "Sexual harassment";
  if (CREDIBLE_THREAT_PATTERNS.some(pattern => pattern.test(folded))) return "Threat of real-world harm";
  if (INVITE_LINK_PATTERNS.some(pattern => pattern.test(folded)) || NORMALIZED_INVITE_PATTERNS.some(pattern => pattern.test(normalized))) return "Invite link";
  if (CREDENTIAL_REQUEST_PATTERN.test(folded)) return "Request for account credentials";
  if (PERSONAL_INFORMATION_REQUEST_PATTERNS.some(pattern => pattern.test(normalized))) return "Request for personal information";
  return LINK_PATTERN.test(folded) && GEM_SCAM_PATTERN.test(folded) ? "Gem scam link" : null;
}

export function shouldModeratePublicChatMessage(message: string) {
  return chatModerationReason(message) !== null;
}

export function displayNameModerationReason(displayName: string): string | null {
  const reason = chatModerationReason(displayName);
  if (reason) return reason;
  const compact = normalizeModerationText(displayName).replace(/\s/g, "");
  const lookalike = compactLookalike(displayName);
  if (HATEFUL_USERNAME_PATTERN.test(compact) || LOOKALIKE_HATEFUL_USERNAME_PATTERN.test(lookalike)) return "Hateful username";
  return CHILD_NUDITY_NAME_PATTERN.test(compact) || LOOKALIKE_CHILD_NUDITY_NAME_PATTERN.test(lookalike)
    ? "Sexualized reference to a child" : null;
}

export function isPublicDisplayNameAllowed(displayName: string) {
  return displayNameModerationReason(displayName) === null;
}

export function moderatePublicChatMessage(message: string) {
  const moderated = shouldModeratePublicChatMessage(message);
  return {
    message: moderated ? MODERATED_CHAT_MESSAGE : message,
    moderated,
  };
}

// Guild names are exactly four letters, so the profanity that slips past the
// severe-content filters above is a short, finite list. Case is ignored.
const BLOCKED_GUILD_NAMES = new Set([
  "fuck", "cunt", "cock", "dick", "shit", "anus", "twat", "slut", "tits", "jizz", "cums", "wank", "arse", "piss",
  "rape", "pedo", "nazi", "kike", "spic", "coon", "gook", "fags", "dyke", "homo", "nigs", "chin", "paki", "wogs",
]);

/** Guild names also carry the display-name rules; this adds the short profanity list. */
export function guildNameModerationReason(name: string): string | null {
  const reason = displayNameModerationReason(name);
  if (reason) return reason;
  const blocked = BLOCKED_GUILD_NAMES.has(normalizeModerationText(name).replace(/\s/g, ""))
    // Guild names are four plain letters, so the look-alike form only adds
    // l->i and q->g here ("NlGS", "QOOK"); the plain check keeps "SLUT".
    || BLOCKED_GUILD_NAMES.has(compactLookalike(name));
  return blocked ? "Offensive guild name" : null;
}
