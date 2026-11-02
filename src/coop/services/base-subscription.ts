import { createSessionSubscriptions } from "./session-subscriptions";
import { PATREON_TICKER_CHANGED } from "../../../shared/patreon-ticker";
import { questDay, questWeek } from "../../../shared/weekly-quests";
import type { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";
import { withWideDuel, withWideProgress } from "./wide-progress";
import { reducerEventMs } from "./reducer-event-time";
import type { TableName, TableRow } from "./table-watch";

/** A handler for one table's rows, typed from the bindings. */
type On<Name extends TableName> = (row: TableRow<Name>) => void;
type ActiveUpgradeRow = TableRow<"activeItemUpgrade" | "activeItemUpgradeSlotTwo" | "activeItemUpgradeSlotThree">;

export type BaseSubscriptionHandlers = {
  player: On<"player">;
  removePlayer: On<"player">;
  motionFrame: On<"playerMotionDetailFrame">;
  mapFrame: On<"playerMapFrame">;
  deathFrame: On<"playerDeathFrame">;
  motionIdentity: On<"playerMotionIdentity">;
  removeMotionIdentity: On<"playerMotionIdentity">;
  nameTag: On<"playerNameTag">;
  removeNameTag: On<"playerNameTag">;
  nameColor: On<"playerNameColor">;
  removeNameColor: On<"playerNameColor">;
  profile: On<"playerProfile">;
  removeProfile: On<"playerProfile">;
  gemWallet: On<"myGemWallet">;
  removeGemWallet: On<"myGemWallet">;
  dailyGemBonus: On<"myDailyGemBonus">;
  removeDailyGemBonus: On<"myDailyGemBonus">;
  onboarding: On<"myOnboarding">;
  removeOnboarding: On<"myOnboarding">;
  mailbox: On<"myMailboxV2">;
  removeMailbox: On<"myMailboxV2">;
  itemGift: On<"myItemGifts">;
  removeItemGift: On<"myItemGifts">;
  balanceApologyNotice: On<"myBalanceApologyNotice">;
  removeBalanceApologyNotice: On<"myBalanceApologyNotice">;
  upgradeBench: On<"myUpgradeBench">;
  removeUpgradeBench: On<"myUpgradeBench">;
  upgradeBenchThirdSlot: On<"myUpgradeBenchThirdSlot">;
  removeUpgradeBenchThirdSlot: On<"myUpgradeBenchThirdSlot">;
  inventoryCapacity: On<"myInventoryCapacity">;
  removeInventoryCapacity: On<"myInventoryCapacity">;
  cutsceneHistory: On<"myCutsceneHistory">;
  removeCutsceneHistory: On<"myCutsceneHistory">;
  accessAudit: On<"devAccessAudit">;
  removeAccessAudit: On<"devAccessAudit">;
  bugReport: On<"devBugReports">;
  removeBugReport: On<"devBugReports">;
  accountStatus: On<"playerAccountStatus">;
  removeAccountStatus: On<"playerAccountStatus">;
  worldStatus: On<"worldStatus">;
  releaseNotice: On<"releaseNotice">;
  progress: (row: ReturnType<typeof withWideProgress<TableRow<"playerProgress">>>) => void;
  research: On<"playerResearch">;
  removeResearch: On<"playerResearch">;
  luckResearch: On<"playerLuckResearch">;
  removeLuckResearch: On<"playerLuckResearch">;
  researchRank: On<"myResearchRanks">;
  removeResearchRank: On<"myResearchRanks">;
  activeResearch: On<"activeResearch">;
  removeActiveResearch: (row: Pick<TableRow<"activeResearch">, "identity">) => void;
  pausedResearch: On<"pausedResearch">;
  removePausedResearch: On<"pausedResearch">;
  prestige: On<"playerPrestige">;
  removePrestige: On<"playerPrestige">;
  prestigePerk: On<"playerPrestigePerk">;
  prestigeChallenge: On<"playerPrestigeChallenge">; removePrestigeChallenge: On<"playerPrestigeChallenge">;
  prestigeChallengeParked: On<"playerPrestigeChallengeParked">; removePrestigeChallengeParked: On<"playerPrestigeChallengeParked">;
  aggroChallenge: On<"playerAggroChallenge">; removeAggroChallenge: On<"playerAggroChallenge">;
  aggroChallengeParked: On<"playerAggroChallengeParked">; removeAggroChallengeParked: On<"playerAggroChallengeParked">;
  freeRespec: On<"playerFreeRespec">; removeFreeRespec: On<"playerFreeRespec">;
  dailyQuest: On<"playerDailyQuest">; removeDailyQuest: On<"playerDailyQuest">; guildQuestWeek: On<"guildQuestWeek">; removeGuildQuestWeek: On<"guildQuestWeek">;
  prestigeExpansionPerk: On<"playerPrestigeExpansionPerk">;
  removePrestigeExpansionPerk: (row: Pick<TableRow<"playerPrestigeExpansionPerk">, "identity">) => void;
  prestigeCardPerk: On<"playerPrestigeCardPerk">; removePrestigeCardPerk: (row: Pick<TableRow<"playerPrestigeCardPerk">, "identity">) => void;
  bonusToggle: On<"playerBonusToggle">; removeBonusToggle: (row: Pick<TableRow<"playerBonusToggle">, "identity">) => void;
  removePrestigePerk: On<"playerPrestigePerk">;
  itemUpgrade: On<"playerItemUpgrade">;
  removeItemUpgrade: On<"playerItemUpgrade">;
  activeItemUpgrade: (row: ActiveUpgradeRow, slot: 1 | 2 | 3) => void;
  removeActiveItemUpgrade: (row: ActiveUpgradeRow, slot: 1 | 2 | 3) => void;
  itemDrop: On<"playerItemDrop">;
  gemDrop: On<"playerGemDrop">;
  lifetime: On<"playerLifetime">;
  chatHearts: On<"playerChatHearts">;
  socialHub: On<"mySocialHub">;
  removeSocialHub: On<"mySocialHub">;
  socialMessage: On<"mySocialMessagesWithReactions">;
  removeSocialMessage: On<"mySocialMessagesWithReactions">;
  socialDuelLink: On<"socialDuelMessage">;
  removeSocialDuelLink: On<"socialDuelMessage">;
  chatMessage: On<"latestChatMessagesWithReactions">;
  removeChatMessage: On<"latestChatMessagesWithReactions">;
  playerBlock: On<"myPlayerBlocks">;
  removePlayerBlock: On<"myPlayerBlocks">;
  duel: (row: TableRow<"duel">) => void;
  removeDuel: On<"duel">;
  /** The server's time from a reply to one of our own calls (reducer-event-time.ts). */
  serverTime?: (serverAtMs: number) => void;
};

type BaseSubscriptionHandlerSources = {
  presence: {
    upsertPlayer: BaseSubscriptionHandlers["player"];
    removePlayer: BaseSubscriptionHandlers["removePlayer"];
    upsertPlayerMotionFrame: BaseSubscriptionHandlers["motionFrame"];
    upsertPlayerMapFrame: BaseSubscriptionHandlers["mapFrame"];
    upsertPlayerDeathFrame: BaseSubscriptionHandlers["deathFrame"];
    upsertMotionIdentity: BaseSubscriptionHandlers["motionIdentity"];
    removeMotionIdentity: BaseSubscriptionHandlers["removeMotionIdentity"];
    upsertWorldStatus: BaseSubscriptionHandlers["worldStatus"];
    upsertReleaseNotice: BaseSubscriptionHandlers["releaseNotice"];
    observeServerTime?: (serverAtMs: number) => void;
  };
  profile: {
    upsertNameTag: BaseSubscriptionHandlers["nameTag"];
    removeNameTag: BaseSubscriptionHandlers["removeNameTag"];
    upsertNameColor: BaseSubscriptionHandlers["nameColor"];
    removeNameColor: BaseSubscriptionHandlers["removeNameColor"];
    upsertProfile: BaseSubscriptionHandlers["profile"];
    removeProfile: BaseSubscriptionHandlers["removeProfile"];
    upsertAccountStatus: BaseSubscriptionHandlers["accountStatus"];
    removeAccountStatus: BaseSubscriptionHandlers["removeAccountStatus"];
  };
  progression: {
    upsertProgress: BaseSubscriptionHandlers["progress"];
    upsertResearch: BaseSubscriptionHandlers["research"];
    removeResearch: BaseSubscriptionHandlers["removeResearch"];
    upsertLuckResearch: BaseSubscriptionHandlers["luckResearch"];
    removeLuckResearch: BaseSubscriptionHandlers["removeLuckResearch"];
    upsertResearchRank: BaseSubscriptionHandlers["researchRank"];
    removeResearchRank: BaseSubscriptionHandlers["removeResearchRank"];
    upsertActiveResearch: BaseSubscriptionHandlers["activeResearch"];
    removeActiveResearch: BaseSubscriptionHandlers["removeActiveResearch"];
    upsertPausedResearch: BaseSubscriptionHandlers["pausedResearch"];
    removePausedResearch: BaseSubscriptionHandlers["removePausedResearch"];
    upsertPrestige: BaseSubscriptionHandlers["prestige"];
    removePrestige: BaseSubscriptionHandlers["removePrestige"];
    upsertPrestigePerk: BaseSubscriptionHandlers["prestigePerk"];
    upsertPrestigeChallenge: BaseSubscriptionHandlers["prestigeChallenge"]; removePrestigeChallenge: BaseSubscriptionHandlers["removePrestigeChallenge"];
    upsertPrestigeChallengeParked: BaseSubscriptionHandlers["prestigeChallengeParked"]; removePrestigeChallengeParked: BaseSubscriptionHandlers["removePrestigeChallengeParked"];
    upsertAggroChallenge: BaseSubscriptionHandlers["aggroChallenge"]; removeAggroChallenge: BaseSubscriptionHandlers["removeAggroChallenge"];
    upsertAggroChallengeParked: BaseSubscriptionHandlers["aggroChallengeParked"]; removeAggroChallengeParked: BaseSubscriptionHandlers["removeAggroChallengeParked"];
    upsertFreeRespec: BaseSubscriptionHandlers["freeRespec"]; removeFreeRespec: BaseSubscriptionHandlers["removeFreeRespec"];
    upsertDailyQuest: BaseSubscriptionHandlers["dailyQuest"]; removeDailyQuest: BaseSubscriptionHandlers["removeDailyQuest"]; upsertGuildQuestWeek: BaseSubscriptionHandlers["guildQuestWeek"]; removeGuildQuestWeek: BaseSubscriptionHandlers["removeGuildQuestWeek"];
    upsertPrestigeExpansionPerk: BaseSubscriptionHandlers["prestigeExpansionPerk"]; removePrestigeExpansionPerk: BaseSubscriptionHandlers["removePrestigeExpansionPerk"];
    upsertPrestigeCardPerk: BaseSubscriptionHandlers["prestigeCardPerk"]; removePrestigeCardPerk: BaseSubscriptionHandlers["removePrestigeCardPerk"];
    upsertBonusToggle: BaseSubscriptionHandlers["bonusToggle"]; removeBonusToggle: BaseSubscriptionHandlers["removeBonusToggle"];
    removePrestigePerk: BaseSubscriptionHandlers["removePrestigePerk"];
    upsertItemUpgrade: BaseSubscriptionHandlers["itemUpgrade"];
    removeItemUpgrade: BaseSubscriptionHandlers["removeItemUpgrade"];
    upsertActiveItemUpgrade: BaseSubscriptionHandlers["activeItemUpgrade"];
    removeActiveItemUpgrade: BaseSubscriptionHandlers["removeActiveItemUpgrade"];
    upsertLifetime: BaseSubscriptionHandlers["lifetime"];
    upsertChatHearts: BaseSubscriptionHandlers["chatHearts"];
    upsertGemWallet: BaseSubscriptionHandlers["gemWallet"];
    removeGemWallet: BaseSubscriptionHandlers["removeGemWallet"];
    upsertDailyGemBonus: BaseSubscriptionHandlers["dailyGemBonus"];
    removeDailyGemBonus: BaseSubscriptionHandlers["removeDailyGemBonus"];
    upsertOnboarding: BaseSubscriptionHandlers["onboarding"];
    removeOnboarding: BaseSubscriptionHandlers["removeOnboarding"];
    upsertMailbox: BaseSubscriptionHandlers["mailbox"];
    removeMailbox: BaseSubscriptionHandlers["removeMailbox"];
    upsertItemGift: BaseSubscriptionHandlers["itemGift"];
    removeItemGift: BaseSubscriptionHandlers["removeItemGift"];
    upsertBalanceApologyNotice: BaseSubscriptionHandlers["balanceApologyNotice"];
    removeBalanceApologyNotice: BaseSubscriptionHandlers["removeBalanceApologyNotice"];
    upsertUpgradeBench: BaseSubscriptionHandlers["upgradeBench"];
    removeUpgradeBench: BaseSubscriptionHandlers["removeUpgradeBench"];
    upsertUpgradeBenchThirdSlot: BaseSubscriptionHandlers["upgradeBenchThirdSlot"];
    removeUpgradeBenchThirdSlot: BaseSubscriptionHandlers["removeUpgradeBenchThirdSlot"];
    upsertInventoryCapacity: BaseSubscriptionHandlers["inventoryCapacity"];
    removeInventoryCapacity: BaseSubscriptionHandlers["removeInventoryCapacity"];
    upsertCutsceneHistory: BaseSubscriptionHandlers["cutsceneHistory"];
    removeCutsceneHistory: BaseSubscriptionHandlers["removeCutsceneHistory"];
    upsertItemDrop: BaseSubscriptionHandlers["itemDrop"];
    upsertGemDrop: BaseSubscriptionHandlers["gemDrop"];
  };
  developer: {
    upsertAccessAudit: BaseSubscriptionHandlers["accessAudit"];
    removeAccessAudit: BaseSubscriptionHandlers["removeAccessAudit"];
    upsertBugReport: BaseSubscriptionHandlers["bugReport"];
    removeBugReport: BaseSubscriptionHandlers["removeBugReport"];
  };
  social?: {
    upsertHub: BaseSubscriptionHandlers["socialHub"]; removeHub: BaseSubscriptionHandlers["removeSocialHub"];
    upsertMessage: BaseSubscriptionHandlers["socialMessage"]; removeMessage: BaseSubscriptionHandlers["removeSocialMessage"];
    upsertDuelLink?: BaseSubscriptionHandlers["socialDuelLink"]; removeDuelLink?: BaseSubscriptionHandlers["removeSocialDuelLink"];
  };
  chat: {
    upsert: BaseSubscriptionHandlers["chatMessage"]; remove: BaseSubscriptionHandlers["removeChatMessage"];
    upsertBlock: BaseSubscriptionHandlers["playerBlock"]; removeBlock: BaseSubscriptionHandlers["removePlayerBlock"];
  };
  duel: { upsert: BaseSubscriptionHandlers["duel"]; remove: BaseSubscriptionHandlers["removeDuel"] };
};

/** Adapts service-owned table handlers to the subscription's table names. */
export function createBaseSubscriptionHandlers(sources: BaseSubscriptionHandlerSources): BaseSubscriptionHandlers {
  const { presence, profile, progression, developer, chat, duel } = sources;
  return {
    player: presence.upsertPlayer,
    removePlayer: presence.removePlayer,
    motionFrame: presence.upsertPlayerMotionFrame,
    mapFrame: presence.upsertPlayerMapFrame,
    deathFrame: presence.upsertPlayerDeathFrame,
    serverTime: presence.observeServerTime,
    motionIdentity: presence.upsertMotionIdentity,
    removeMotionIdentity: presence.removeMotionIdentity,
    nameTag: profile.upsertNameTag,
    removeNameTag: profile.removeNameTag,
    nameColor: profile.upsertNameColor,
    removeNameColor: profile.removeNameColor,
    profile: profile.upsertProfile,
    removeProfile: profile.removeProfile,
    gemWallet: progression.upsertGemWallet,
    removeGemWallet: progression.removeGemWallet,
    dailyGemBonus: progression.upsertDailyGemBonus,
    removeDailyGemBonus: progression.removeDailyGemBonus,
    onboarding: progression.upsertOnboarding,
    removeOnboarding: progression.removeOnboarding,
    mailbox: progression.upsertMailbox,
    removeMailbox: progression.removeMailbox,
    itemGift: progression.upsertItemGift,
    removeItemGift: progression.removeItemGift,
    balanceApologyNotice: progression.upsertBalanceApologyNotice,
    removeBalanceApologyNotice: progression.removeBalanceApologyNotice,
    upgradeBench: progression.upsertUpgradeBench,
    removeUpgradeBench: progression.removeUpgradeBench,
    upgradeBenchThirdSlot: progression.upsertUpgradeBenchThirdSlot,
    removeUpgradeBenchThirdSlot: progression.removeUpgradeBenchThirdSlot,
    inventoryCapacity: progression.upsertInventoryCapacity,
    removeInventoryCapacity: progression.removeInventoryCapacity,
    cutsceneHistory: progression.upsertCutsceneHistory,
    removeCutsceneHistory: progression.removeCutsceneHistory,
    accessAudit: developer.upsertAccessAudit,
    removeAccessAudit: developer.removeAccessAudit,
    bugReport: developer.upsertBugReport,
    removeBugReport: developer.removeBugReport,
    accountStatus: profile.upsertAccountStatus,
    removeAccountStatus: profile.removeAccountStatus,
    worldStatus: presence.upsertWorldStatus,
    releaseNotice: presence.upsertReleaseNotice,
    progress: progression.upsertProgress,
    research: progression.upsertResearch,
    removeResearch: progression.removeResearch,
    luckResearch: progression.upsertLuckResearch,
    removeLuckResearch: progression.removeLuckResearch,
    researchRank: progression.upsertResearchRank,
    removeResearchRank: progression.removeResearchRank,
    activeResearch: progression.upsertActiveResearch,
    removeActiveResearch: progression.removeActiveResearch,
    pausedResearch: progression.upsertPausedResearch,
    removePausedResearch: progression.removePausedResearch,
    prestige: progression.upsertPrestige,
    removePrestige: progression.removePrestige,
    prestigePerk: progression.upsertPrestigePerk,
    prestigeChallenge: progression.upsertPrestigeChallenge, removePrestigeChallenge: progression.removePrestigeChallenge,
    prestigeChallengeParked: progression.upsertPrestigeChallengeParked, removePrestigeChallengeParked: progression.removePrestigeChallengeParked,
    aggroChallenge: progression.upsertAggroChallenge, removeAggroChallenge: progression.removeAggroChallenge,
    aggroChallengeParked: progression.upsertAggroChallengeParked, removeAggroChallengeParked: progression.removeAggroChallengeParked,
    freeRespec: progression.upsertFreeRespec, removeFreeRespec: progression.removeFreeRespec,
    dailyQuest: progression.upsertDailyQuest, removeDailyQuest: progression.removeDailyQuest,
    guildQuestWeek: progression.upsertGuildQuestWeek, removeGuildQuestWeek: progression.removeGuildQuestWeek,
    prestigeExpansionPerk: progression.upsertPrestigeExpansionPerk, removePrestigeExpansionPerk: progression.removePrestigeExpansionPerk,
    prestigeCardPerk: progression.upsertPrestigeCardPerk, removePrestigeCardPerk: progression.removePrestigeCardPerk,
    bonusToggle: progression.upsertBonusToggle, removeBonusToggle: progression.removeBonusToggle,
    removePrestigePerk: progression.removePrestigePerk,
    itemUpgrade: progression.upsertItemUpgrade,
    removeItemUpgrade: progression.removeItemUpgrade,
    activeItemUpgrade: progression.upsertActiveItemUpgrade,
    removeActiveItemUpgrade: progression.removeActiveItemUpgrade,
    itemDrop: progression.upsertItemDrop,
    gemDrop: progression.upsertGemDrop,
    lifetime: progression.upsertLifetime,
    chatHearts: progression.upsertChatHearts,
    socialHub: sources.social?.upsertHub ?? (() => {}),
    removeSocialHub: sources.social?.removeHub ?? (() => {}),
    socialMessage: sources.social?.upsertMessage ?? (() => {}),
    removeSocialMessage: sources.social?.removeMessage ?? (() => {}),
    socialDuelLink: sources.social?.upsertDuelLink ?? (() => {}),
    removeSocialDuelLink: sources.social?.removeDuelLink ?? (() => {}),
    chatMessage: chat.upsert,
    removeChatMessage: chat.remove,
    playerBlock: chat.upsertBlock,
    removePlayerBlock: chat.removeBlock,
    duel: duel.upsert,
    removeDuel: duel.remove,
  };
}

type BaseSubscriptionDependencies = {
  connection: DbConnection;
  identity: Identity;
  includeDeveloperTables: boolean;
  onLoading: () => void;
  isCurrent: () => boolean;
  isPresenceSubscriptionTransitioning: () => boolean;
  batch: (action: () => void) => void;
  handlers: BaseSubscriptionHandlers;
  onHydrated: () => void;
  onError: (event: unknown) => void;
  afterHydrated: () => void;
};

export function startBaseSubscription(dependencies: BaseSubscriptionDependencies) {
  const { connection, handlers } = dependencies;
  // The SDK emits the initial subscription's row callbacks after onApplied.
  // Hydrate once from the cache, then suppress that duplicate callback batch.
  let hydrating = true;
  const shouldHandle = () => dependencies.isCurrent() && !hydrating;
  const supporterChanged = () => {
    if (shouldHandle() && typeof window !== "undefined") window.dispatchEvent(new Event(PATREON_TICKER_CHANGED));
  };
  connection.db.patreonTickerSupporters.onInsert(supporterChanged);
  connection.db.patreonTickerSupporters.onUpdate(supporterChanged);
  connection.db.patreonTickerSupporters.onDelete(supporterChanged);
  // Our own calls that touch the player row (entering the world, stopping) carry the server's time.
  const serverTime = (ctx: unknown) => {
    const at = reducerEventMs(ctx);
    if (at !== null && dependencies.isCurrent()) handlers.serverTime?.(at);
  };
  connection.db.player.onInsert((ctx, row) => { serverTime(ctx); if (shouldHandle()) handlers.player(row); });
  connection.db.player.onUpdate((ctx, _oldRow, row) => { serverTime(ctx); if (shouldHandle()) handlers.player(row); });
  connection.db.player.onDelete((_ctx, row) => {
    if (shouldHandle() && !dependencies.isPresenceSubscriptionTransitioning()) handlers.removePlayer(row);
  });
  // Event-table rows are consumed directly by render buffers. Their handlers
  // intentionally do not trigger application-wide UI fanout.
  connection.db.playerMotionDetailFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.motionFrame(row); });
  connection.db.playerMapFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.mapFrame(row); });
  connection.db.playerDeathFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.deathFrame(row); });
  connection.db.playerMotionIdentity.onInsert((_ctx, row) => { if (shouldHandle()) handlers.motionIdentity(row); });
  connection.db.playerMotionIdentity.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.motionIdentity(row); });
  connection.db.playerMotionIdentity.onDelete((_ctx, row) => {
    if (shouldHandle() && !dependencies.isPresenceSubscriptionTransitioning()) handlers.removeMotionIdentity(row);
  });
  connection.db.playerNameTag.onInsert((_ctx, row) => { if (shouldHandle()) handlers.nameTag(row); });
  connection.db.playerNameTag.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.nameTag(row); });
  connection.db.playerNameTag.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeNameTag(row); });
  connection.db.playerNameColor.onInsert((_ctx, row) => { if (shouldHandle()) handlers.nameColor(row); });
  connection.db.playerNameColor.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.nameColor(row); });
  connection.db.playerNameColor.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeNameColor(row); });
  connection.db.playerProfile.onInsert((_ctx, row) => { if (shouldHandle()) handlers.profile(row); });
  connection.db.playerProfile.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.profile(row); });
  connection.db.playerProfile.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeProfile(row); });
  connection.db.myGemWallet.onInsert((_ctx, row) => { if (shouldHandle()) handlers.gemWallet(row); });
  connection.db.myGemWallet.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.gemWallet(row); });
  connection.db.myGemWallet.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeGemWallet(row); });
  connection.db.myDailyGemBonus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.dailyGemBonus(row); });
  connection.db.myDailyGemBonus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.dailyGemBonus(row); });
  connection.db.myDailyGemBonus.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDailyGemBonus(row); });
  connection.db.myOnboarding.onInsert((_ctx, row) => { if (shouldHandle()) handlers.onboarding(row); });
  connection.db.myOnboarding.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.onboarding(row); });
  connection.db.myOnboarding.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeOnboarding(row); });
  connection.db.myMailboxV2.onInsert((_ctx, row) => { if (shouldHandle()) handlers.mailbox(row); });
  connection.db.myMailboxV2.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.mailbox(row); });
  connection.db.myMailboxV2.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeMailbox(row); });
  connection.db.myItemGifts.onInsert((_ctx, row) => { if (shouldHandle()) handlers.itemGift(row); });
  connection.db.myItemGifts.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.itemGift(row); });
  connection.db.myItemGifts.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeItemGift(row); });
  connection.db.myBalanceApologyNotice.onInsert((_ctx, row) => { if (shouldHandle()) handlers.balanceApologyNotice(row); });
  connection.db.myBalanceApologyNotice.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.balanceApologyNotice(row); });
  connection.db.myBalanceApologyNotice.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeBalanceApologyNotice(row); });
  connection.db.myUpgradeBench.onInsert((_ctx, row) => { if (shouldHandle()) handlers.upgradeBench(row); });
  connection.db.myUpgradeBench.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.upgradeBench(row); });
  connection.db.myUpgradeBench.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeUpgradeBench(row); });
  connection.db.myUpgradeBenchThirdSlot.onInsert((_ctx, row) => { if (shouldHandle()) handlers.upgradeBenchThirdSlot(row); });
  connection.db.myUpgradeBenchThirdSlot.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeUpgradeBenchThirdSlot(row); });
  connection.db.myInventoryCapacity.onInsert((_ctx, row) => { if (shouldHandle()) handlers.inventoryCapacity(row); });
  connection.db.myInventoryCapacity.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.inventoryCapacity(row); });
  connection.db.myInventoryCapacity.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeInventoryCapacity(row); });
  connection.db.myCutsceneHistory.onInsert((_ctx, row) => { if (shouldHandle()) handlers.cutsceneHistory(row); });
  connection.db.myCutsceneHistory.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.cutsceneHistory(row); });
  connection.db.myCutsceneHistory.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeCutsceneHistory(row); });
  connection.db.devAccessAudit.onInsert((_ctx, row) => { if (shouldHandle()) handlers.accessAudit(row); });
  connection.db.devAccessAudit.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.accessAudit(row); });
  connection.db.devAccessAudit.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAccessAudit(row); });
  connection.db.devBugReports.onInsert((_ctx, row) => { if (shouldHandle()) handlers.bugReport(row); });
  connection.db.devBugReports.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.bugReport(row); });
  connection.db.devBugReports.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeBugReport(row); });
  connection.db.playerAccountStatus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAccountStatus(row); });
  connection.db.releaseNotice.onInsert((_ctx, row) => { if (shouldHandle()) handlers.releaseNotice(row); });
  connection.db.releaseNotice.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.releaseNotice(row); });
  connection.db.worldStatus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.worldStatus(row); });
  connection.db.worldStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.worldStatus(row); });
  connection.db.playerProgress.onInsert((_ctx, row) => { if (shouldHandle()) handlers.progress(withWideProgress(connection, row)); });
  connection.db.playerProgress.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.progress(withWideProgress(connection, row)); });
  // The bag arrives in its own row (player_inventory); a change there re-reads the progress it belongs to.
  const progressAgain = (bag: TableRow<"playerInventory">) => {
    if (!shouldHandle()) return;
    for (const row of connection.db.playerProgress.iter()) {
      if (row.identity.toHexString() === bag.identity.toHexString()) handlers.progress(withWideProgress(connection, row));
    }
  };
  connection.db.playerInventory.onInsert((_ctx, row) => progressAgain(row));
  connection.db.playerInventory.onUpdate((_ctx, _oldRow, row) => progressAgain(row));
  connection.db.playerInventory.onDelete((_ctx, row) => progressAgain(row));
  connection.db.playerResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.research(row); });
  connection.db.playerResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.research(row); });
  connection.db.playerResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeResearch(row); });
  connection.db.playerLuckResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.luckResearch(row); });
  connection.db.playerLuckResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.luckResearch(row); });
  connection.db.playerLuckResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeLuckResearch(row); });
  connection.db.myResearchRanks.onInsert((_ctx, row) => { if (shouldHandle()) handlers.researchRank(row); });
  connection.db.myResearchRanks.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.researchRank(row); });
  connection.db.myResearchRanks.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeResearchRank(row); });
  connection.db.activeResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeResearch(row); });
  connection.db.activeResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeResearch(row); });
  connection.db.activeResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveResearch(row); });
  connection.db.pausedResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.pausedResearch(row); });
  connection.db.pausedResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.pausedResearch(row); });
  connection.db.pausedResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePausedResearch(row); });
  connection.db.playerPrestige.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestige(row); });
  connection.db.playerPrestige.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.prestige(row); });
  connection.db.playerPrestige.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestige(row); });
  connection.db.playerPrestigeChallenge.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestigeChallenge(row); });
  connection.db.playerPrestigeChallenge.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.prestigeChallenge(row); });
  connection.db.playerPrestigeChallenge.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestigeChallenge(row); });
  connection.db.playerPrestigeChallengeParked.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestigeChallengeParked(row); });
  connection.db.playerPrestigeChallengeParked.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestigeChallengeParked(row); });
  connection.db.playerAggroChallenge.onInsert((_ctx, row) => { if (shouldHandle()) handlers.aggroChallenge(row); });
  connection.db.playerAggroChallenge.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.aggroChallenge(row); });
  connection.db.playerAggroChallenge.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAggroChallenge(row); });
  connection.db.playerAggroChallengeParked.onInsert((_ctx, row) => { if (shouldHandle()) handlers.aggroChallengeParked(row); });
  connection.db.playerAggroChallengeParked.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAggroChallengeParked(row); });
  connection.db.playerFreeRespec.onInsert((_ctx, row) => { if (shouldHandle()) handlers.freeRespec(row); });
  connection.db.playerFreeRespec.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeFreeRespec(row); });
  connection.db.playerDailyQuest.onInsert((_ctx, row) => { if (shouldHandle()) handlers.dailyQuest(row); });
  connection.db.playerDailyQuest.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.dailyQuest(row); });
  connection.db.playerDailyQuest.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDailyQuest(row); });
  connection.db.guildQuestWeek.onInsert((_ctx, row) => { if (shouldHandle()) handlers.guildQuestWeek(row); });
  connection.db.guildQuestWeek.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.guildQuestWeek(row); });
  connection.db.guildQuestWeek.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeGuildQuestWeek(row); });
  connection.db.playerPrestigeExpansionPerk.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestigeExpansionPerk(row); });
  connection.db.playerPrestigeExpansionPerk.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.prestigeExpansionPerk(row); });
  connection.db.playerPrestigeExpansionPerk.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestigeExpansionPerk(row); });
  connection.db.playerPrestigeCardPerk.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestigeCardPerk(row); });
  connection.db.playerPrestigeCardPerk.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.prestigeCardPerk(row); });
  connection.db.playerPrestigeCardPerk.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestigeCardPerk(row); });
  connection.db.playerBonusToggle.onInsert((_ctx, row) => { if (shouldHandle()) handlers.bonusToggle(row); });
  connection.db.playerBonusToggle.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.bonusToggle(row); });
  connection.db.playerBonusToggle.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeBonusToggle(row); });
  connection.db.playerPrestigePerk.onInsert((_ctx, row) => { if (shouldHandle()) handlers.prestigePerk(row); });
  connection.db.playerPrestigePerk.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.prestigePerk(row); });
  connection.db.playerPrestigePerk.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePrestigePerk(row); });
  connection.db.playerItemUpgrade.onInsert((_ctx, row) => { if (shouldHandle()) handlers.itemUpgrade(row); });
  connection.db.playerItemUpgrade.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.itemUpgrade(row); });
  connection.db.playerItemUpgrade.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeItemUpgrade(row); });
  connection.db.activeItemUpgrade.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 1); });
  connection.db.activeItemUpgrade.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 1); });
  connection.db.activeItemUpgrade.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveItemUpgrade(row, 1); });
  connection.db.activeItemUpgradeSlotTwo.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 2); });
  connection.db.activeItemUpgradeSlotTwo.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 2); });
  connection.db.activeItemUpgradeSlotTwo.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveItemUpgrade(row, 2); });
  connection.db.activeItemUpgradeSlotThree.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 3); });
  connection.db.activeItemUpgradeSlotThree.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 3); });
  connection.db.activeItemUpgradeSlotThree.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveItemUpgrade(row, 3); });
  connection.db.playerItemDrop.onInsert((_ctx, row) => { if (shouldHandle()) handlers.itemDrop(row); });
  connection.db.playerItemDrop.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.itemDrop(row); });
  connection.db.playerGemDrop.onInsert((_ctx, row) => { if (shouldHandle()) handlers.gemDrop(row); });
  connection.db.playerGemDrop.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.gemDrop(row); });
  connection.db.playerChatHearts.onInsert((_ctx, row) => { if (shouldHandle()) handlers.chatHearts(row); });
  connection.db.playerChatHearts.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.chatHearts(row); });
  connection.db.playerChatHearts.onDelete((_ctx, row) => { if (shouldHandle()) handlers.chatHearts({ ...row, chatHeartsReceived: 0n }); });
  connection.db.playerLifetime.onInsert((_ctx, row) => { if (shouldHandle()) handlers.lifetime(row); });
  connection.db.playerLifetime.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.lifetime(row); });
  connection.db.mySocialHub.onInsert((_ctx, row) => { if (shouldHandle()) handlers.socialHub(row); });
  connection.db.mySocialHub.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.socialHub(row); });
  connection.db.mySocialHub.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeSocialHub(row); });
  connection.db.mySocialMessagesWithReactions.onInsert((_ctx, row) => { if (shouldHandle()) handlers.socialMessage(row); });
  connection.db.mySocialMessagesWithReactions.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.socialMessage(row); });
  connection.db.mySocialMessagesWithReactions.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeSocialMessage(row); });
  connection.db.socialDuelMessage.onInsert((_ctx, row) => { if (shouldHandle()) handlers.socialDuelLink(row); });
  connection.db.socialDuelMessage.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeSocialDuelLink(row); });
  connection.db.latestChatMessagesWithReactions.onInsert((_ctx, row) => { if (shouldHandle()) handlers.chatMessage(row); });
  connection.db.latestChatMessagesWithReactions.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.chatMessage(row); });
  connection.db.latestChatMessagesWithReactions.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeChatMessage(row); });
  connection.db.myPlayerBlocks.onInsert((_ctx, row) => { if (shouldHandle()) handlers.playerBlock(row); });
  connection.db.myPlayerBlocks.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.playerBlock(row); });
  connection.db.myPlayerBlocks.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePlayerBlock(row); });
  connection.db.duel.onInsert((_ctx, row) => { if (shouldHandle()) handlers.duel(withWideDuel(connection, row)); });
  connection.db.duel.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.duel(withWideDuel(connection, row)); });
  // A duel's stats past f32 arrive in their own row; a change there re-reads the duel.
  const duelAgain = (wide: TableRow<"duelWideStats">) => {
    if (!shouldHandle()) return;
    for (const row of connection.db.duel.iter()) if (row.id === wide.duelId) handlers.duel(withWideDuel(connection, row));
  };
  connection.db.duelWideStats.onInsert((_ctx, row) => duelAgain(row));
  connection.db.duelWideStats.onUpdate((_ctx, _oldRow, row) => duelAgain(row));
  connection.db.duelWideStats.onDelete((_ctx, row) => duelAgain(row));
  connection.db.duel.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDuel(row); });

  return createSessionSubscriptions({
    isCurrent: dependencies.isCurrent,
    loading: () => { hydrating = true; dependencies.onLoading(); },
    error: dependencies.onError,
    subscribe: (scope, applied) => connection.subscriptionBuilder()
      .onApplied(applied)
      .onError((ctx) => { if (dependencies.isCurrent()) dependencies.onError(ctx.event); })
      .subscribe(scope === "account" ? [
      tables.playerProfile.where((profile) => profile.identity.eq(dependencies.identity)),
      tables.playerProgress.where((progress) => progress.identity.eq(dependencies.identity)),
      tables.playerInventory.where((bag) => bag.identity.eq(dependencies.identity)),
      tables.playerAccountStatus.where((status) => status.identity.eq(dependencies.identity)),
    ] : [
      tables.playerNameTag,
      // Whole table, as the tags: every name in chat needs its sender's color. One small row per player who picked one.
      tables.playerNameColor,
      tables.patreonTickerSupporters,
      tables.player.where((player) => player.identity.eq(dependencies.identity)),
      tables.playerMotionIdentity.where((presence) => presence.identity.eq(dependencies.identity)),
      tables.playerProfile.where((profile) => profile.identity.eq(dependencies.identity)),
      tables.myGemWallet,
      tables.myDailyGemBonus,
      tables.myBalanceApologyNotice,
      tables.myItemGifts,
      tables.myMailboxV2,
      tables.myOnboarding,
      tables.myUpgradeBench,
      tables.myUpgradeBenchThirdSlot,
      tables.myInventoryCapacity,
      tables.myCutsceneHistory,
      ...(dependencies.includeDeveloperTables ? [tables.devAccessAudit, tables.devBugReports] : []),
      tables.playerAccountStatus.where((status) => status.identity.eq(dependencies.identity)),
      tables.worldStatus,
      tables.releaseNotice,
      tables.playerProgress.where((progress) => progress.identity.eq(dependencies.identity)),
      tables.playerInventory.where((bag) => bag.identity.eq(dependencies.identity)),
      tables.playerResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.playerLuckResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.myResearchRanks,
      tables.activeResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.pausedResearch.where((research) => research.identity.eq(dependencies.identity)),
      // Whole table, not only our row: the level badge beside every name needs
      // everyone's. One small row per prestiged player.
      tables.playerPrestige,
      tables.playerPrestigeChallenge.where(row => row.identity.eq(dependencies.identity)),
      tables.playerPrestigeChallengeParked.where(row => row.identity.eq(dependencies.identity)),
      tables.playerAggroChallenge.where(row => row.identity.eq(dependencies.identity)),
      tables.playerAggroChallengeParked.where(row => row.identity.eq(dependencies.identity)),
      tables.playerFreeRespec.where(row => row.identity.eq(dependencies.identity)),
      tables.playerDailyQuest.where(row => row.identity.eq(dependencies.identity)),
      // Every guild's quest points this week, for the ranking. From this week
      // on, so a tab left open past the turn of the week still gets the new one.
      tables.guildQuestWeek.where(row => row.week.gte(questWeek(questDay(BigInt(Date.now()) * 1000n)))),
      tables.playerPrestigeExpansionPerk.where(row => row.identity.eq(dependencies.identity)),
      tables.playerPrestigeCardPerk.where(row => row.identity.eq(dependencies.identity)),
      tables.playerBonusToggle.where(row => row.identity.eq(dependencies.identity)),
      tables.playerPrestigePerk.where((prestigePerk) => prestigePerk.identity.eq(dependencies.identity)),
      // Prestige asks for a number of cleared Endless stages, and the window
      // that says so opens anywhere, so this is subscribed on every map.
      tables.proceduralProgress.where((row) => row.identity.eq(dependencies.identity)),
      tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgradeSlotTwo.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgradeSlotThree.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.playerItemDrop.where((drop) => drop.identity.eq(dependencies.identity)),
      tables.playerGemDrop.where((drop) => drop.identity.eq(dependencies.identity)),
      tables.playerChatHearts.where(row => row.identity.eq(dependencies.identity)),
      tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dependencies.identity)),
      tables.mySocialHub,
      tables.mySocialMessagesWithReactions,
      tables.socialDuelMessage.where(row => row.recipient.eq(dependencies.identity)),
      tables.socialDuelMessage.where(row => row.sender.eq(dependencies.identity)),
      tables.latestChatMessagesWithReactions,
      tables.myPlayerBlocks,
      tables.duel.where((duel) => duel.challenger.eq(dependencies.identity)),
      tables.duelWideStats.where((wide) => wide.challenger.eq(dependencies.identity)),
]),
    hydrate: () => {
      dependencies.batch(() => {
        for (const row of connection.db.playerNameTag.iter()) handlers.nameTag(row);
        for (const row of connection.db.playerNameColor.iter()) handlers.nameColor(row);
        for (const row of connection.db.playerProfile.iter()) handlers.profile(row);
        for (const row of connection.db.myGemWallet.iter()) handlers.gemWallet(row);
        for (const row of connection.db.myDailyGemBonus.iter()) handlers.dailyGemBonus(row);
        for (const row of connection.db.myBalanceApologyNotice.iter()) handlers.balanceApologyNotice(row);
        for (const row of connection.db.myMailboxV2.iter()) handlers.mailbox(row);
        for (const row of connection.db.myItemGifts.iter()) handlers.itemGift(row);
        for (const row of connection.db.myOnboarding.iter()) handlers.onboarding(row);
        for (const row of connection.db.myUpgradeBench.iter()) handlers.upgradeBench(row);
        for (const row of connection.db.myUpgradeBenchThirdSlot.iter()) handlers.upgradeBenchThirdSlot(row);
        for (const row of connection.db.myInventoryCapacity.iter()) handlers.inventoryCapacity(row);
        for (const row of connection.db.myCutsceneHistory.iter()) handlers.cutsceneHistory(row);
        for (const row of connection.db.devAccessAudit.iter()) handlers.accessAudit(row);
        for (const row of connection.db.devBugReports.iter()) handlers.bugReport(row);
        for (const row of connection.db.playerAccountStatus.iter()) handlers.accountStatus(row);
        for (const row of connection.db.worldStatus.iter()) handlers.worldStatus(row);
        for (const row of connection.db.releaseNotice.iter()) handlers.releaseNotice(row);
        for (const row of connection.db.playerProgress.iter()) handlers.progress(withWideProgress(connection, row));
        for (const row of connection.db.playerResearch.iter()) handlers.research(row);
        for (const row of connection.db.playerLuckResearch.iter()) handlers.luckResearch(row);
        for (const row of connection.db.myResearchRanks.iter()) handlers.researchRank(row);
        for (const row of connection.db.activeResearch.iter()) handlers.activeResearch(row);
        if (![...connection.db.activeResearch.iter()].some(row => row.identity.toHexString() === dependencies.identity.toHexString())) handlers.removeActiveResearch({ identity: dependencies.identity });
        for (const row of connection.db.pausedResearch.iter()) handlers.pausedResearch(row);
        for (const row of connection.db.playerPrestige.iter()) handlers.prestige(row);
        for (const row of connection.db.playerPrestigePerk.iter()) handlers.prestigePerk(row);
        for (const row of connection.db.playerPrestigeChallenge.iter()) handlers.prestigeChallenge(row);
        for (const row of connection.db.playerPrestigeChallengeParked.iter()) handlers.prestigeChallengeParked(row);
        for (const row of connection.db.playerAggroChallenge.iter()) handlers.aggroChallenge(row);
        for (const row of connection.db.playerAggroChallengeParked.iter()) handlers.aggroChallengeParked(row);
        for (const row of connection.db.playerFreeRespec.iter()) handlers.freeRespec(row);
        for (const row of connection.db.playerDailyQuest.iter()) handlers.dailyQuest(row);
        for (const row of connection.db.guildQuestWeek.iter()) handlers.guildQuestWeek(row);
        for (const row of connection.db.playerPrestigeExpansionPerk.iter()) handlers.prestigeExpansionPerk(row);
        if (![...connection.db.playerPrestigeExpansionPerk.iter()].some(row => row.identity.toHexString() === dependencies.identity.toHexString())) handlers.removePrestigeExpansionPerk({ identity: dependencies.identity });
        for (const row of connection.db.playerPrestigeCardPerk.iter()) handlers.prestigeCardPerk(row);
        if (![...connection.db.playerPrestigeCardPerk.iter()].some(row => row.identity.toHexString() === dependencies.identity.toHexString())) handlers.removePrestigeCardPerk({ identity: dependencies.identity });
        for (const row of connection.db.playerBonusToggle.iter()) handlers.bonusToggle(row);
        if (![...connection.db.playerBonusToggle.iter()].some(row => row.identity.toHexString() === dependencies.identity.toHexString())) handlers.removeBonusToggle({ identity: dependencies.identity });
        for (const row of connection.db.playerItemUpgrade.iter()) handlers.itemUpgrade(row);
        for (const row of connection.db.activeItemUpgrade.iter()) handlers.activeItemUpgrade(row, 1);
        for (const row of connection.db.activeItemUpgradeSlotTwo.iter()) handlers.activeItemUpgrade(row, 2);
        for (const row of connection.db.activeItemUpgradeSlotThree.iter()) handlers.activeItemUpgrade(row, 3);
        for (const row of connection.db.playerItemDrop.iter()) handlers.itemDrop(row);
        for (const row of connection.db.playerGemDrop.iter()) handlers.gemDrop(row);
        for (const row of connection.db.playerChatHearts.iter()) handlers.chatHearts(row);
        for (const row of connection.db.playerLifetime.iter()) handlers.lifetime(row);
        for (const row of connection.db.playerMotionIdentity.iter()) handlers.motionIdentity(row);
        for (const row of connection.db.player.iter()) handlers.player(row);
        for (const row of connection.db.myPlayerBlocks.iter()) handlers.playerBlock(row);
        for (const row of connection.db.mySocialHub.iter()) handlers.socialHub(row);
        // Links first, so each duel result arrives with its replay.
        for (const row of connection.db.socialDuelMessage.iter()) handlers.socialDuelLink(row);
        for (const row of connection.db.mySocialMessagesWithReactions.iter()) handlers.socialMessage(row);
        for (const row of connection.db.latestChatMessagesWithReactions.iter()) handlers.chatMessage(row);
        for (const row of connection.db.duel.iter()) handlers.duel(withWideDuel(connection, row));
      });
    },
    ready: () => {
      dependencies.batch(dependencies.onHydrated);
      queueMicrotask(() => { hydrating = false; });
      dependencies.afterHydrated();
    },
  });
}
