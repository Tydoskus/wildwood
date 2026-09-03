import type { Identity } from "spacetimedb";
import { tables, type DbConnection } from "../../module_bindings";

type RowHandler = (row: any) => void;

export type BaseSubscriptionHandlers = {
  player: RowHandler;
  removePlayer: RowHandler;
  motionFrame: RowHandler;
  mapFrame: RowHandler;
  deathFrame: RowHandler;
  motionIdentity: RowHandler;
  removeMotionIdentity: RowHandler;
  profile: RowHandler;
  removeProfile: RowHandler;
  gemWallet: RowHandler;
  removeGemWallet: RowHandler;
  dailyGemBonus: RowHandler;
  removeDailyGemBonus: RowHandler;
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
  accountStatus: RowHandler;
  removeAccountStatus: RowHandler;
  worldStatus: RowHandler;
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
  lifetime: RowHandler;
  dragonBoss: RowHandler;
  dragonResult: RowHandler;
  spiderBoss: RowHandler;
  spiderResult: RowHandler;
  frostclawBoss: RowHandler;
  frostclawResult: RowHandler;
  magmaliskBoss: RowHandler;
  magmaliskResult: RowHandler;
  gloomrootBoss: RowHandler;
  gloomrootResult: RowHandler;
  tidewyrmBoss: RowHandler;
  tidewyrmResult: RowHandler;
  koiShogunBoss: RowHandler;
  koiShogunResult: RowHandler;
  tempestKirinBoss: RowHandler;
  tempestKirinResult: RowHandler;
  miremawBoss: RowHandler;
  miremawResult: RowHandler;
  chatMessage: RowHandler;
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
  };
  profile: {
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
    upsertGemWallet: BaseSubscriptionHandlers["gemWallet"];
    removeGemWallet: BaseSubscriptionHandlers["removeGemWallet"];
    upsertDailyGemBonus: BaseSubscriptionHandlers["dailyGemBonus"];
    removeDailyGemBonus: BaseSubscriptionHandlers["removeDailyGemBonus"];
    upsertBalanceApologyNotice: BaseSubscriptionHandlers["balanceApologyNotice"];
    removeBalanceApologyNotice: BaseSubscriptionHandlers["removeBalanceApologyNotice"];
    upsertUpgradeBench: BaseSubscriptionHandlers["upgradeBench"];
    removeUpgradeBench: BaseSubscriptionHandlers["removeUpgradeBench"];
    upsertInventoryCapacity: BaseSubscriptionHandlers["inventoryCapacity"];
    removeInventoryCapacity: BaseSubscriptionHandlers["removeInventoryCapacity"];
    upsertCutsceneHistory: BaseSubscriptionHandlers["cutsceneHistory"];
    removeCutsceneHistory: BaseSubscriptionHandlers["removeCutsceneHistory"];
    upsertItemDrop: BaseSubscriptionHandlers["itemDrop"];
  };
  developer: {
    upsertAccessAudit: BaseSubscriptionHandlers["accessAudit"];
    removeAccessAudit: BaseSubscriptionHandlers["removeAccessAudit"];
    upsertBugReport: BaseSubscriptionHandlers["bugReport"];
    removeBugReport: BaseSubscriptionHandlers["removeBugReport"];
  };
  boss: {
    upsertDragon: BaseSubscriptionHandlers["dragonBoss"];
    upsertDragonResult: BaseSubscriptionHandlers["dragonResult"];
    upsertSpider: BaseSubscriptionHandlers["spiderBoss"];
    upsertSpiderResult: BaseSubscriptionHandlers["spiderResult"];
    upsertFrostclaw: BaseSubscriptionHandlers["frostclawBoss"];
    upsertFrostclawResult: BaseSubscriptionHandlers["frostclawResult"];
    upsertMagmalisk: BaseSubscriptionHandlers["magmaliskBoss"];
    upsertMagmaliskResult: BaseSubscriptionHandlers["magmaliskResult"];
    upsertGloomroot: BaseSubscriptionHandlers["gloomrootBoss"];
    upsertGloomrootResult: BaseSubscriptionHandlers["gloomrootResult"];
    upsertTidewyrm: BaseSubscriptionHandlers["tidewyrmBoss"];
    upsertTidewyrmResult: BaseSubscriptionHandlers["tidewyrmResult"];
    upsertKoiShogun: BaseSubscriptionHandlers["koiShogunBoss"];
    upsertKoiShogunResult: BaseSubscriptionHandlers["koiShogunResult"];
    upsertTempestKirin: BaseSubscriptionHandlers["tempestKirinBoss"];
    upsertTempestKirinResult: BaseSubscriptionHandlers["tempestKirinResult"];
    upsertMiremaw: BaseSubscriptionHandlers["miremawBoss"];
    upsertMiremawResult: BaseSubscriptionHandlers["miremawResult"];
  };
  chat: { upsert: BaseSubscriptionHandlers["chatMessage"] };
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
    motionIdentity: presence.upsertMotionIdentity,
    removeMotionIdentity: presence.removeMotionIdentity,
    profile: profile.upsertProfile,
    removeProfile: profile.removeProfile,
    gemWallet: progression.upsertGemWallet,
    removeGemWallet: progression.removeGemWallet,
    dailyGemBonus: progression.upsertDailyGemBonus,
    removeDailyGemBonus: progression.removeDailyGemBonus,
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
    accountStatus: profile.upsertAccountStatus,
    removeAccountStatus: profile.removeAccountStatus,
    worldStatus: presence.upsertWorldStatus,
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
    lifetime: progression.upsertLifetime,
    dragonBoss: boss.upsertDragon,
    dragonResult: boss.upsertDragonResult,
    spiderBoss: boss.upsertSpider,
    spiderResult: boss.upsertSpiderResult,
    frostclawBoss: boss.upsertFrostclaw,
    frostclawResult: boss.upsertFrostclawResult,
    magmaliskBoss: boss.upsertMagmalisk,
    magmaliskResult: boss.upsertMagmaliskResult,
    gloomrootBoss: boss.upsertGloomroot,
    gloomrootResult: boss.upsertGloomrootResult,
    tidewyrmBoss: boss.upsertTidewyrm,
    tidewyrmResult: boss.upsertTidewyrmResult,
    koiShogunBoss: boss.upsertKoiShogun,
    koiShogunResult: boss.upsertKoiShogunResult,
    tempestKirinBoss: boss.upsertTempestKirin,
    tempestKirinResult: boss.upsertTempestKirinResult,
    miremawBoss: boss.upsertMiremaw,
    miremawResult: boss.upsertMiremawResult,
    chatMessage: chat.upsert,
    duel: duel.upsert,
    removeDuel: duel.remove,
  };
}

type BaseSubscriptionDependencies = {
  connection: DbConnection;
  identity: Identity;
  includeDeveloperTables: boolean;
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
  connection.db.player.onInsert((_ctx, row) => { if (shouldHandle()) handlers.player(row); });
  connection.db.player.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.player(row); });
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
  connection.db.playerProfile.onInsert((_ctx, row) => { if (shouldHandle()) handlers.profile(row); });
  connection.db.playerProfile.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.profile(row); });
  connection.db.playerProfile.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeProfile(row); });
  connection.db.myGemWallet.onInsert((_ctx, row) => { if (shouldHandle()) handlers.gemWallet(row); });
  connection.db.myGemWallet.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.gemWallet(row); });
  connection.db.myGemWallet.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeGemWallet(row); });
  connection.db.myDailyGemBonus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.dailyGemBonus(row); });
  connection.db.myDailyGemBonus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.dailyGemBonus(row); });
  connection.db.myDailyGemBonus.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDailyGemBonus(row); });
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
  connection.db.playerAccountStatus.onInsert((_ctx, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.accountStatus(row); });
  connection.db.playerAccountStatus.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeAccountStatus(row); });
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
  connection.db.playerLifetime.onInsert((_ctx, row) => { if (shouldHandle()) handlers.lifetime(row); });
  connection.db.playerLifetime.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.lifetime(row); });
  connection.db.dragonBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.dragonBoss(row); });
  connection.db.dragonBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.dragonBoss(row); });
  connection.db.dragonResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.dragonResult(row); });
  connection.db.dragonResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.dragonResult(row); });
  connection.db.spiderBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.spiderBoss(row); });
  connection.db.spiderBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.spiderBoss(row); });
  connection.db.spiderResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.spiderResult(row); });
  connection.db.spiderResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.spiderResult(row); });
  connection.db.frostclawBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.frostclawBoss(row); });
  connection.db.frostclawBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.frostclawBoss(row); });
  connection.db.frostclawResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.frostclawResult(row); });
  connection.db.frostclawResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.frostclawResult(row); });
  connection.db.magmaliskBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.magmaliskBoss(row); });
  connection.db.magmaliskBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.magmaliskBoss(row); });
  connection.db.magmaliskResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.magmaliskResult(row); });
  connection.db.magmaliskResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.magmaliskResult(row); });
  connection.db.gloomrootBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.gloomrootBoss(row); });
  connection.db.gloomrootBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.gloomrootBoss(row); });
  connection.db.gloomrootResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.gloomrootResult(row); });
  connection.db.gloomrootResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.gloomrootResult(row); });
  connection.db.tidewyrmBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.tidewyrmBoss(row); });
  connection.db.tidewyrmBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.tidewyrmBoss(row); });
  connection.db.tidewyrmResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.tidewyrmResult(row); });
  connection.db.tidewyrmResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.tidewyrmResult(row); });
  connection.db.koiShogunBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.koiShogunBoss(row); });
  connection.db.koiShogunBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.koiShogunBoss(row); });
  connection.db.koiShogunResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.koiShogunResult(row); });
  connection.db.koiShogunResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.koiShogunResult(row); });
  connection.db.tempestKirinBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.tempestKirinBoss(row); });
  connection.db.tempestKirinBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.tempestKirinBoss(row); });
  connection.db.tempestKirinResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.tempestKirinResult(row); });
  connection.db.tempestKirinResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.tempestKirinResult(row); });
  connection.db.miremawBoss.onInsert((_ctx, row) => { if (shouldHandle()) handlers.miremawBoss(row); });
  connection.db.miremawBoss.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.miremawBoss(row); });
  connection.db.miremawResult.onInsert((_ctx, row) => { if (shouldHandle()) handlers.miremawResult(row); });
  connection.db.miremawResult.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.miremawResult(row); });
  connection.db.chatMessage.onInsert((_ctx, row) => { if (shouldHandle()) handlers.chatMessage(row); });
  connection.db.duel.onInsert((_ctx, row) => { if (shouldHandle()) handlers.duel(row); });
  connection.db.duel.onUpdate((_ctx, _oldRow, row) => { if (shouldHandle()) handlers.duel(row); });
  connection.db.duel.onDelete((_ctx, row) => { if (shouldHandle()) handlers.removeDuel(row); });

  return connection
    .subscriptionBuilder()
    .onApplied(() => {
      if (!dependencies.isCurrent()) return;
      dependencies.batch(() => {
        for (const row of connection.db.playerProfile.iter()) handlers.profile(row);
        for (const row of connection.db.myGemWallet.iter()) handlers.gemWallet(row);
        for (const row of connection.db.myDailyGemBonus.iter()) handlers.dailyGemBonus(row);
        for (const row of connection.db.myBalanceApologyNotice.iter()) handlers.balanceApologyNotice(row);
        for (const row of connection.db.myUpgradeBench.iter()) handlers.upgradeBench(row);
        for (const row of connection.db.myInventoryCapacity.iter()) handlers.inventoryCapacity(row);
        for (const row of connection.db.myCutsceneHistory.iter()) handlers.cutsceneHistory(row);
        for (const row of connection.db.devAccessAudit.iter()) handlers.accessAudit(row);
        for (const row of connection.db.devBugReports.iter()) handlers.bugReport(row);
        for (const row of connection.db.playerAccountStatus.iter()) handlers.accountStatus(row);
        for (const row of connection.db.worldStatus.iter()) handlers.worldStatus(row);
        for (const row of connection.db.playerProgress.iter()) handlers.progress(row);
        for (const row of connection.db.playerResearch.iter()) handlers.research(row);
        for (const row of connection.db.activeResearch.iter()) handlers.activeResearch(row);
        for (const row of connection.db.playerItemUpgrade.iter()) handlers.itemUpgrade(row);
        for (const row of connection.db.activeItemUpgrade.iter()) handlers.activeItemUpgrade(row, 1);
        for (const row of connection.db.activeItemUpgradeSlotTwo.iter()) handlers.activeItemUpgrade(row, 2);
        for (const row of connection.db.playerItemDrop.iter()) handlers.itemDrop(row);
        for (const row of connection.db.playerLifetime.iter()) handlers.lifetime(row);
        for (const row of connection.db.playerMotionIdentity.iter()) handlers.motionIdentity(row);
        for (const row of connection.db.player.iter()) handlers.player(row);
        for (const row of connection.db.dragonBoss.iter()) handlers.dragonBoss(row);
        for (const row of connection.db.dragonResult.iter()) handlers.dragonResult(row);
        for (const row of connection.db.spiderBoss.iter()) handlers.spiderBoss(row);
        for (const row of connection.db.spiderResult.iter()) handlers.spiderResult(row);
        for (const row of connection.db.frostclawBoss.iter()) handlers.frostclawBoss(row);
        for (const row of connection.db.frostclawResult.iter()) handlers.frostclawResult(row);
        for (const row of connection.db.magmaliskBoss.iter()) handlers.magmaliskBoss(row);
        for (const row of connection.db.magmaliskResult.iter()) handlers.magmaliskResult(row);
        for (const row of connection.db.gloomrootBoss.iter()) handlers.gloomrootBoss(row);
        for (const row of connection.db.gloomrootResult.iter()) handlers.gloomrootResult(row);
        for (const row of connection.db.tidewyrmBoss.iter()) handlers.tidewyrmBoss(row);
        for (const row of connection.db.tidewyrmResult.iter()) handlers.tidewyrmResult(row);
        for (const row of connection.db.koiShogunBoss.iter()) handlers.koiShogunBoss(row);
        for (const row of connection.db.koiShogunResult.iter()) handlers.koiShogunResult(row);
        for (const row of connection.db.tempestKirinBoss.iter()) handlers.tempestKirinBoss(row);
        for (const row of connection.db.tempestKirinResult.iter()) handlers.tempestKirinResult(row);
        for (const row of connection.db.miremawBoss.iter()) handlers.miremawBoss(row);
        for (const row of connection.db.miremawResult.iter()) handlers.miremawResult(row);
        for (const row of connection.db.chatMessage.iter()) handlers.chatMessage(row);
        for (const row of connection.db.duel.iter()) handlers.duel(row);
        dependencies.onHydrated();
      });
      queueMicrotask(() => { hydrating = false; });
      dependencies.afterHydrated();
    })
    .onError((ctx) => {
      if (dependencies.isCurrent()) dependencies.onError(ctx.event);
    })
    .subscribe([
      tables.player.where((player) => player.identity.eq(dependencies.identity)),
      tables.playerMotionIdentity.where((presence) => presence.identity.eq(dependencies.identity)),
      tables.playerProfile.where((profile) => profile.identity.eq(dependencies.identity)),
      tables.myGemWallet,
      tables.myDailyGemBonus,
      tables.myBalanceApologyNotice,
      tables.myUpgradeBench,
      tables.myInventoryCapacity,
      tables.myCutsceneHistory,
      ...(dependencies.includeDeveloperTables ? [tables.devAccessAudit, tables.devBugReports] : []),
      tables.playerAccountStatus.where((status) => status.identity.eq(dependencies.identity)),
      tables.worldStatus,
      tables.playerProgress.where((progress) => progress.identity.eq(dependencies.identity)),
      tables.playerResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.activeResearch.where((research) => research.identity.eq(dependencies.identity)),
      tables.playerItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgrade.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.activeItemUpgradeSlotTwo.where((upgrade) => upgrade.identity.eq(dependencies.identity)),
      tables.playerItemDrop.where((drop) => drop.identity.eq(dependencies.identity)),
      tables.playerLifetime.where((lifetime) => lifetime.identity.eq(dependencies.identity)),
      tables.dragonBoss,
      tables.dragonResult,
      tables.spiderBoss,
      tables.spiderResult,
      tables.frostclawBoss,
      tables.frostclawResult,
      tables.magmaliskBoss,
      tables.magmaliskResult,
      tables.gloomrootBoss,
      tables.gloomrootResult,
      tables.tidewyrmBoss,
      tables.tidewyrmResult,
      tables.koiShogunBoss,
      tables.koiShogunResult,
      tables.tempestKirinBoss,
      tables.tempestKirinResult,
      tables.miremawBoss,
      tables.miremawResult,
      tables.chatMessage,
      tables.duel.where((duel) => duel.challenger.eq(dependencies.identity)),
    ]);
}
