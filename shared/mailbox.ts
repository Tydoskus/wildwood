import mailboxCopy from "./mailbox-copy.json";
export const REBALANCE_MAIL_ID = "stats-explained-2026-09-17";
export const REBALANCE_MAIL_GEMS = 75n;
export const REBALANCE_MAIL_TITLE = mailboxCopy.title;
export const REBALANCE_MAIL_BODY = mailboxCopy.body;

/**
 * A make-good for the slot upgrades that went missing: a prestige wiped them
 * before the fix, and a running upgrade was thrown away by the next sweep or
 * sign-in because the check still expected an item id where the slot now sits.
 */
export const SLOT_UPGRADE_MAIL_ID = "slot-upgrades-restored-2026-09-22";
export const SLOT_UPGRADE_MAIL_GEMS = 50n;
export const SLOT_UPGRADE_MAIL_TITLE = "Sorry about your slot upgrades";
export const SLOT_UPGRADE_MAIL_BODY = [
  "Slot upgrades were not surviving. A prestige wiped every slot tier, and an upgrade left running on the bench was being thrown away the next time the world swept or you signed in \u2014 which is why a slot would not move past the tier it started the day with.",
  "",
  "Both are fixed. Slot tiers now survive a prestige, the way your research does, and an upgrade on the bench runs to the end.",
  "",
  "Take 50 gems for the trouble.",
].join("\n");

export type MailboxMessage = {
  id: string;
  title: string;
  body: string;
  gems: bigint;
  itemIds?: string[];
  upgradeLevel?: number;
  createdAtMs: number;
  read: boolean;
  claimed: boolean;
};
