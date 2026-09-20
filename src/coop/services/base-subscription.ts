import { createSessionSubscriptions } from "./session-subscriptions";
import { PATREON_TICKER_CHANGED } from "../../../shared/patreon-ticker";
import type { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";

type RowHandler = (row: any) => void;

export type BaseSubscriptionHandlers = {
  player: RowHandler;
  removePlayer: RowHandler;
  motionFrame: RowHandler;
  mapFrame: RowHandler;
  deathFrame: RowHandler;
  bossHitResult: RowHandler;
  motionIdentity: RowHandler;
  removeMotionIdentity: RowHandler;
  nameTag: RowHandler;
  removeNameTag: RowHandler;
  profile: RowHandler;
  removeProfile: RowHandler;
  gemWallet: RowHandler;
  removeGemWallet: RowHandler;
  dailyGemBonus: RowHandler;
  removeDailyGemBonus: RowHandler;
  onboarding: RowHandler;
  removeOnboarding: RowHandler;
  mailbox: RowHandler;
  removeMailbox: RowHandler;
  itemGift: RowHandler;
  removeItemGift: RowHandler;
  balanceApologyNotice: RowHandler;
  removeBalanceApologyNotice: RowHandler;
  upgradeBench: RowHandler;
  removeUpgradeBench: RowHandler;
  inventoryCapacity: RowHandler;
  removeInventoryCapacity: RowHandler;
  cutsceneHistory: RowHandler;
  removeCutsceneHistory: RowHandler;
  accessAudit: RowHandler;
  removeAccessAudit: RowHandler;
  bugReport: RowHandler;
  removeBugReport: RowHandler;
  forestPrototype: RowHandler;
  removeForestPrototype: RowHandler;
  accountStatus: RowHandler;
  removeAccountStatus: RowHandler;
  worldStatus: RowHandler;
  releaseNotice: RowHandler;
  progress: RowHandler;
  research: RowHandler;
  removeResearch: RowHandler;
  activeResearch: RowHandler;
  removeActiveResearch: RowHandler;
  itemUpgrade: RowHandler;
  removeItemUpgrade: RowHandler;
  activeItemUpgrade: (row: any, slot: 1 | 2) => void;
  removeActiveItemUpgrade: (row: any, slot: 1 | 2) => void;
  itemDrop: RowHandler;
  gemDrop: RowHandler;
  lifetime: RowHandler;
  chatHearts: RowHandler;
  socialHub: RowHandler;
  removeSocialHub: RowHandler;
  socialMessage: RowHandler;
  removeSocialMessage: RowHandler;
  chatMessage: RowHandler;
  removeChatMessage: RowHandler;
  playerBlock: RowHandler;
  removePlayerBlock: RowHandler;
  duel: RowHandler;
  removeDuel: RowHandler;
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
  };
  profile: {
    upsertNameTag: RowHandler;
    removeNameTag: RowHandler;
    upsertProfile: BaseSubscriptionHandlers["profile"];
    removeProfile: BaseSubscriptionHandlers["removeProfile"];
    upsertAccountStatus: BaseSubscriptionHandlers["accountStatus"];
    removeAccountStatus: BaseSubscriptionHandlers["removeAccountStatus"];
  };
  progression: {
    upsertProgress: BaseSubscriptionHandlers["progress"];
    upsertResearch: BaseSubscriptionHandlers["research"];
    removeResearch: BaseSubscriptionHandlers["removeResearch"];
    upsertActiveResearch: BaseSubscriptionHandlers["activeResearch"];
    removeActiveResearch: BaseSubscriptionHandlers["removeActiveResearch"];
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
    upsertMailbox: RowHandler;
    removeMailbox: RowHandler;
    upsertItemGift: BaseSubscriptionHandlers["itemGift"];
    removeItemGift: BaseSubscriptionHandlers["removeItemGift"];
    upsertBalanceApologyNotice: BaseSubscriptionHandlers["balanceApologyNotice"];
    removeBalanceApologyNotice: BaseSubscriptionHandlers["removeBalanceApologyNotice"];
    upsertUpgradeBench: BaseSubscriptionHandlers["upgradeBench"];
    removeUpgradeBench: BaseSubscriptionHandlers["removeUpgradeBench"];
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
    upsertForestPrototype: BaseSubscriptionHandlers["forestPrototype"];
    removeForestPrototype: BaseSubscriptionHandlers["removeForestPrototype"];
  };
  boss: {
    upsertHitResult: BaseSubscriptionHandlers["bossHitResult"];
  };
  social?: { upsertHub: RowHandler; removeHub: RowHandler; upsertMessage: RowHandler; removeMessage: RowHandler };
  chat: { upsert: BaseSubscriptionHandlers["chatMessage"]; upsertBlock: RowHandler; removeBlock: RowHandler; remove: RowHandler };
  duel: { upsert: BaseSubscriptionHandlers["duel"]; remove: BaseSubscriptionHandlers["removeDuel"] };
};

/** Adapts service-owned table handlers to the subscription's table names. */
export function createBaseSubscriptionHandlers(sources: BaseSubscriptionHandlerSources): BaseSubscriptionHandlers {
  const { presence, profile, progression, developer, boss, chat, duel } = sources;
  return {
    player: presence.upsertPlayer,
    removePlayer: presence.removePlayer,
    motionFrame: presence.upsertPlayerMotionFrame,
    mapFrame: presence.upsertPlayerMapFrame,
    deathFrame: presence.upsertPlayerDeathFrame,
    bossHitResult: boss.upsertHitResult,
    motionIdentity: presence.upsertMotionIdentity,
    removeMotionIdentity: presence.removeMotionIdentity,
    nameTag: profile.upsertNameTag,
    removeNameTag: profile.removeNameTag,
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
    inventoryCapacity: progression.upsertInventoryCapacity,
    removeInventoryCapacity: progression.removeInventoryCapacity,
    cutsceneHistory: progression.upsertCutsceneHistory,
    removeCutsceneHistory: progression.removeCutsceneHistory,
    accessAudit: developer.upsertAccessAudit,
    removeAccessAudit: developer.removeAccessAudit,
    bugReport: developer.upsertBugReport,
    removeBugReport: developer.removeBugReport,
    forestPrototype: developer.upsertForestPrototype,
    removeForestPrototype: developer.removeForestPrototype,
    accountStatus: profile.upsertAccountStatus,
    removeAccountStatus: profile.removeAccountStatus,
    worldStatus: presence.upsertWorldStatus,
    releaseNotice: presence.upsertReleaseNotice,
    progress: progression.upsertProgress,
    research: progression.upsertResearch,
    removeResearch: progression.removeResearch,
    activeResearch: progression.upsertActiveResearch,
    removeActiveResearch: progression.removeActiveResearch,
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
  connection.db.player.onInsert((_ctx, row) => { if (shouldHandle()) handlers.player(row); });
  connection.db.player.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.player(row); });
  connection.db.player.onDelete((_ctx, row) => {
    if (shouldHandle() && !dependencies.isPresenceSubscriptionTransitioning()) handlers.removePlayer(row);
  });
  // Event-table rows are consumed directly by render buffers. Their handlers
  // intentionally do not trigger application-wide UI fanout.
  connection.db.playerMotionDetailFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.motionFrame(row); });
  connection.db.playerMapFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.mapFrame(row); });
  connection.db.bossHitResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.bossHitResult(row); });
  connection.db.playerDeathFrame.onInsert((_ctx, row) => { if (shouldHandle()) handlers.deathFrame(row); });
  connection.db.playerMotionIdentity.onInsert((_ctx, row) => { if (shouldHandle()) handlers.motionIdentity(row); });
  connection.db.playerMotionIdentity.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.motionIdentity(row); });
  connection.db.playerMotionIdentity.onDelete((_ctx, row) => {
    if (shouldHandle() && !dependencies.isPresenceSubscriptionTransitioning()) handlers.removeMotionIdentity(row);
  });
  connection.db.playerNameTag.onInsert((_ctx, row) => { if (shouldHandle()) handlers.nameTag(row); });
  connection.db.playerNameTag.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.nameTag(row); });
  connection.db.playerNameTag.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeNameTag(row); });
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
  connection.db.devForestRewardPrototype.onInsert((_ctx, row) => { if (shouldHandle()) handlers.forestPrototype(row); });
  connection.db.devForestRewardPrototype.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.forestPrototype(row); });
  connection.db.devForestRewardPrototype.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeForestPrototype(row); });
  connection.db.playerAccountStatus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAccountStatus(row); });
  connection.db.releaseNotice.onInsert((_ctx, row) => { if (shouldHandle()) handlers.releaseNotice(row); });
  connection.db.releaseNotice.onUpdate((_ctx, _old, row) => { if (shouldHandle()) handlers.releaseNotice(row); });
  connection.db.worldStatus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.worldStatus(row); });
  connection.db.worldStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.worldStatus(row); });
  connection.db.playerProgress.onInsert((_ctx, row) => { if (shouldHandle()) handlers.progress(row); });
  connection.db.playerProgress.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.progress(row); });
  connection.db.playerResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.research(row); });
  connection.db.playerResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.research(row); });
  connection.db.playerResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeResearch(row); });
  connection.db.activeResearch.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeResearch(row); });
  connection.db.activeResearch.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeResearch(row); });
  connection.db.activeResearch.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveResearch(row); });
  connection.db.playerItemUpgrade.onInsert((_ctx, row) => { if (shouldHandle()) handlers.itemUpgrade(row); });
  connection.db.playerItemUpgrade.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.itemUpgrade(row); });
  connection.db.playerItemUpgrade.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeItemUpgrade(row); });
  connection.db.activeItemUpgrade.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 1); });
  connection.db.activeItemUpgrade.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 1); });
  connection.db.activeItemUpgrade.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveItemUpgrade(row, 1); });
  connection.db.activeItemUpgradeSlotTwo.onInsert((_ctx, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 2); });
  connection.db.activeItemUpgradeSlotTwo.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.activeItemUpgrade(row, 2); });
  connection.db.activeItemUpgradeSlotTwo.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeActiveItemUpgrade(row, 2); });
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
  connection.db.latestChatMessagesWithReactions.onInsert((_ctx, row) => { if (shouldHandle()) handlers.chatMessage(row); });
  connection.db.latestChatMessagesWithReactions.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.chatMessage(row); });
  connection.db.latestChatMessagesWithReactions.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeChatMessage(row); });
  connection.db.myPlayerBlocks.onInsert((_ctx, row) => { if (shouldHandle()) handlers.playerBlock(row); });
  connection.db.myPlayerBlocks.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.playerBlock(row); });
  connection.db.myPlayerBlocks.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removePlayerBlock(row); });
  connection.db.duel.onInsert((_ctx, row) => { if (shouldHandle()) handlers.duel(row); });
  connection.db.duel.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.duel(row); });
  connection.db.duel.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDuel(row); });

  return createSessionSubscriptions({
    isCurrent: dependencies.isCurrent,
    loading: () => { hydrating = true; dependencies.onLoading(); },
    error: dependencies.onError,
    subscribe: (scope, applied) => connection.subscriptionBuilder()
      .onApplied(applied)
      .onError((ctx) => { if (dependencies.isCurrent()) dependencies.onError(ctx.event); })
      .subscribe(scope.startsWith("boss:")
        ? []
        : scope === "account" ? [
      tables.playerProfile.where((profile) => profile.identity.eq(dependencies.identity)),
      tables.playerProgress.where((progress) => progress.identity.eq(dependencies.identity)),
      tables.playerAccountStatus.where((status) => status.identity.eq(dependencies.identity)),
    ] : [
      tables.playerNameTag,
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
      tables.myInventoryCapacity,
      tables.myCutsceneHistory,
      ...(dependencies.includeDeveloperTables ? [tables.devAccessAudit, tables.devBugReports, tables.devForestRewardPrototype] : []),
      tables.playerAccountStatus.where((status) => status.identity.eq(dependencies.identity)),
      tables.worldStatus,
      tables.releaseNotice,
      tables.playerProgress.where((progress) => progress.identity.eq(dependencies.identity)),
      tables.playerResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.activeResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgradeSlotTwo.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.playerItemDrop.where((drop) => drop.identity.eq(dependencies.identity)),
      tables.playerGemDrop.where((drop) => drop.identity.eq(dependencies.identity)),
      tables.playerChatHearts.where(row => row.identity.eq(dependencies.identity)),
      tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dependencies.identity)),
      tables.mySocialHub,
      tables.mySocialMessagesWithReactions,
      tables.latestChatMessagesWithReactions,
      tables.myPlayerBlocks,
      tables.duel.where((duel) => duel.challenger.eq(dependencies.identity)),
]),
    hydrate: (scope) => {
      if (!scope.startsWith("boss:")) {
        dependencies.batch(() => {
          for (const row of connection.db.playerNameTag.iter()) handlers.nameTag(row);
          for (const row of connection.db.playerProfile.iter()) handlers.profile(row);
          for (const row of connection.db.myGemWallet.iter()) handlers.gemWallet(row);
          for (const row of connection.db.myDailyGemBonus.iter()) handlers.dailyGemBonus(row);
          for (const row of connection.db.myBalanceApologyNotice.iter()) handlers.balanceApologyNotice(row);
          for (const row of connection.db.myMailboxV2.iter()) handlers.mailbox(row);
          for (const row of connection.db.myItemGifts.iter()) handlers.itemGift(row);
          for (const row of connection.db.myOnboarding.iter()) handlers.onboarding(row);
          for (const row of connection.db.myUpgradeBench.iter()) handlers.upgradeBench(row);
          for (const row of connection.db.myInventoryCapacity.iter()) handlers.inventoryCapacity(row);
          for (const row of connection.db.myCutsceneHistory.iter()) handlers.cutsceneHistory(row);
          for (const row of connection.db.devAccessAudit.iter()) handlers.accessAudit(row);
          for (const row of connection.db.devBugReports.iter()) handlers.bugReport(row);
          for (const row of connection.db.devForestRewardPrototype.iter()) handlers.forestPrototype(row);
          for (const row of connection.db.playerAccountStatus.iter()) handlers.accountStatus(row);
          for (const row of connection.db.worldStatus.iter()) handlers.worldStatus(row);
          for (const row of connection.db.releaseNotice.iter()) handlers.releaseNotice(row);
          for (const row of connection.db.playerProgress.iter()) handlers.progress(row);
          for (const row of connection.db.playerResearch.iter()) handlers.research(row);
          for (const row of connection.db.activeResearch.iter()) handlers.activeResearch(row);
          if (![...connection.db.activeResearch.iter()].some(row => row.identity.toHexString() === dependencies.identity.toHexString())) handlers.removeActiveResearch({ identity: dependencies.identity });
          for (const row of connection.db.playerItemUpgrade.iter()) handlers.itemUpgrade(row);
          for (const row of connection.db.activeItemUpgrade.iter()) handlers.activeItemUpgrade(row, 1);
          for (const row of connection.db.activeItemUpgradeSlotTwo.iter()) handlers.activeItemUpgrade(row, 2);
          for (const row of connection.db.playerItemDrop.iter()) handlers.itemDrop(row);
          for (const row of connection.db.playerGemDrop.iter()) handlers.gemDrop(row);
          for (const row of connection.db.playerChatHearts.iter()) handlers.chatHearts(row);
          for (const row of connection.db.playerLifetime.iter()) handlers.lifetime(row);
          for (const row of connection.db.playerMotionIdentity.iter()) handlers.motionIdentity(row);
          for (const row of connection.db.player.iter()) handlers.player(row);
          for (const row of connection.db.myPlayerBlocks.iter()) handlers.playerBlock(row);
          for (const row of connection.db.mySocialHub.iter()) handlers.socialHub(row);
          for (const row of connection.db.mySocialMessagesWithReactions.iter()) handlers.socialMessage(row);
          for (const row of connection.db.latestChatMessagesWithReactions.iter()) handlers.chatMessage(row);
          for (const row of connection.db.duel.iter()) handlers.duel(row);
        });
        return;
      }
      // The "boss:" scope no longer has any tables to subscribe to or hydrate
      // (the shared/server-authoritative boss system was removed; bosses are
      // now client-side and per-player). Nothing to do here.
    },
    ready: () => {
      dependencies.batch(dependencies.onHydrated);
      queueMicrotask(() => { hydrating = false; });
      dependencies.afterHydrated();
    },
  });
}
