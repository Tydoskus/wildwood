import { installSettingsTabs } from "./settings-tabs";

const beforeStartShell = String.raw`
<div id="dailyGemBonus" class="daily-gem-bonus" hidden>
  <section class="daily-gem-bonus-card" role="dialog" aria-modal="true" aria-labelledby="dailyGemBonusTitle" aria-describedby="dailyGemBonusCopy">
    <div class="daily-gem-bonus-kicker">DAILY BONUS</div>
    <div class="daily-gem-bonus-art" aria-hidden="true">
      <img src="assets/wildstat/gems/gem-icon-v2.png" alt="" draggable="false" />
    </div>
    <h2 id="dailyGemBonusTitle">+7 GEMS</h2>
    <p id="dailyGemBonusCopy">WELCOME BACK</p>
    <button id="dailyGemClaimBtn" class="daily-gem-claim-button" type="button">CLAIM</button>
  </section>
</div>

<div id="balanceApologyGift" class="daily-gem-bonus balance-apology-gift" hidden>
  <section class="daily-gem-bonus-card" role="dialog" aria-modal="true" aria-labelledby="balanceApologyGiftTitle" aria-describedby="balanceApologyGiftCopy">
    <div class="daily-gem-bonus-kicker">A NOTE FROM WILDSTAT</div>
    <div class="daily-gem-bonus-art" aria-hidden="true">
      <img src="assets/wildstat/gems/gem-icon-v2.png" alt="" draggable="false" />
    </div>
    <h2 id="balanceApologyGiftTitle">+10 GEMS</h2>
    <p id="balanceApologyGiftCopy" class="balance-apology-gift-copy">WE’RE SORRY FOR THE RECENT MAJOR BALANCE CHANGES.<br />THANK YOU FOR STICKING WITH US.</p>
    <button id="balanceApologyContinueBtn" class="daily-gem-claim-button" type="button">CONTINUE</button>
  </section>
</div>

<div id="chatMessageActions" class="chat-message-actions" hidden>
  <button id="chatMessageActionsBackdrop" class="chat-message-actions-backdrop" type="button" aria-label="Close message actions" tabindex="-1"></button>
  <section id="chatMessageActionSheet" class="chat-message-action-sheet" role="dialog" aria-modal="true" aria-labelledby="chatMessageActionTitle" aria-describedby="chatMessageActionPreview">
    <div id="chatMessageActionDrag" class="chat-message-action-drag" aria-label="Swipe down to close">
      <span class="chat-message-action-handle" aria-hidden="true"></span>
    </div>
    <header class="chat-message-action-header">
      <h2 id="chatMessageActionTitle">Message</h2>
      <p id="chatMessageActionPreview"></p>
    </header>
    <div id="chatMessageActionMenu" class="chat-message-action-menu">
      <button id="chatMessageWatchReplayBtn" class="chat-message-action-button" type="button" hidden><span class="chat-message-watch-replay-icon" aria-hidden="true"></span>Watch Replay</button>
      <button id="chatMessageCopyBtn" class="chat-message-action-button" type="button"><span aria-hidden="true">⧉</span>Copy</button>
      <button id="chatMessageReplyBtn" class="chat-message-action-button" type="button"><span aria-hidden="true">↩</span>Reply</button>
      <button id="chatMessageReportBtn" class="chat-message-action-button is-danger" type="button"><span aria-hidden="true">!</span>Report</button>
    </div>
    <form id="chatMessageReportForm" class="chat-message-report-form" hidden>
      <fieldset>
        <legend>Why are you reporting this message?</legend>
        <div id="chatMessageReportReasons" class="chat-message-report-reasons"></div>
      </fieldset>
      <div class="chat-message-report-actions">
        <button id="chatMessageReportBackBtn" class="secondary-button" type="button">Back</button>
        <button id="chatMessageReportSubmitBtn" class="danger" type="submit" disabled>Submit Report</button>
      </div>
    </form>
  </section>
</div>

<div id="duelCountdown" hidden>3</div>
<div id="joystick"><div id="stick"></div></div>

<div id="bootUpgrade" hidden>
  <div class="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="bootUpgradeTitle">
    <div class="boots-icon" aria-hidden="true"><span></span><span></span></div>
    <h2 id="bootUpgradeTitle">TRAILBLAZER BOOTS</h2>
    <p class="upgrade-stat">MOVE SPEED +25</p>
    <button id="bootUpgradeClose" type="button">CONTINUE</button>
  </div>
</div>

`;

const afterUpdateGateShell = String.raw`
<div id="gameOver" role="status" aria-live="assertive" aria-atomic="true" hidden>
  <div class="death-screen">
    <h1>You Died</h1>
    <p id="deathCountdown" class="death-countdown" role="timer">returning to spawn in 3</p>
  </div>
</div>

<div id="duelResult" hidden>
  <div class="modal duel-modal" role="dialog" aria-modal="true">
    <h2 id="duelResultTitle" class="window-title">Duel Complete</h2>
    <div id="duelResultStats" class="duel-stats"></div>
    <button id="watchDuelReplayBtn" type="button"><span class="duel-replay-play-icon" aria-hidden="true"></span><span>WATCH REPLAY</span></button>
    <button id="closeDuelResultBtn" class="secondary-button" type="button">CONTINUE</button>
  </div>
</div>

<div id="dragonWorldNotice" role="status" aria-live="polite" hidden>
  <strong>DRAGON DEFEATED</strong>
  <div id="dragonWorldNoticeDetail" class="dragon-world-notice-detail"></div>
</div>

<div id="playerProfile" hidden>
  <div class="modal player-profile-modal" role="dialog" aria-modal="true" aria-labelledby="playerProfileName">
    <header class="player-profile-header">
      <button id="playerProfileIcon" class="profile-icon profile-window-icon" type="button" aria-label="Player profile icon"></button>
      <div class="player-profile-title-row">
        <div class="player-profile-identity">
          <div class="player-profile-name-row">
            <span id="playerProfileGuestLabel" class="player-profile-guest" hidden>(guest)</span>
            <h2 id="playerProfileName">PLAYER</h2>
            <button id="editPlayerNameBtn" class="profile-name-edit" type="button" aria-label="Change player name" hidden>✎</button>
          </div>
          <div id="playerProfilePresence" class="player-profile-presence">CHECKING STATUS</div>
        </div>
        <div id="playerProfilePower"><span class="power-label">Power:</span> <span class="power-value">0</span></div>
      </div>
    </header>
    <div id="profileGenderSetting" class="profile-gender-setting" hidden>
      <span class="profile-gender-label">GENDER</span>
      <span id="profileGenderValue" class="profile-gender-value" aria-live="polite">choose</span>
      <button id="profileGenderEdit" class="profile-gender-edit" type="button" aria-label="Change gender" aria-expanded="false" aria-controls="profileGenderChoices">✎</button>
      <div id="profileGenderChoices" class="profile-gender-choices" role="group" aria-label="Gender" hidden>
        <button class="profile-gender-choice" type="button" data-gender="1" aria-label="Male" aria-pressed="false" title="Male">
          <img data-game-src="assets/wildstat/gender/male-v2.png" alt="" aria-hidden="true" draggable="false" />
        </button>
        <button class="profile-gender-choice" type="button" data-gender="2" aria-label="Female" aria-pressed="false" title="Female">
          <img data-game-src="assets/wildstat/gender/female-v2.png" alt="" aria-hidden="true" draggable="false" />
        </button>
      </div>
    </div>
    <div id="profileCharacterPreview" class="profile-character-preview character-loadout-preview" aria-label="Player character and equipped items">
      <canvas id="profileCharacterCanvas" class="profile-character-canvas character-preview-canvas" width="240" height="136" aria-hidden="true"></canvas>
      <button id="profileEquippedHeadSlot" class="equipment-slot profile-equipment-slot slot-head" type="button" data-slot="head"><span>HEAD</span></button>
      <button id="profileEquippedChestSlot" class="equipment-slot profile-equipment-slot slot-chest" type="button" data-slot="chest"><span>ARMOR</span></button>
      <div class="profile-character-stage">
        <button id="previousPlayerSpriteBtn" class="player-sprite-selector previous" type="button" aria-label="Previous character" hidden><span aria-hidden="true"></span></button>
        <button id="nextPlayerSpriteBtn" class="player-sprite-selector next" type="button" aria-label="Next character" hidden><span aria-hidden="true"></span></button>
        <button id="profileSkinToneEdit" class="profile-skin-tone-edit" type="button" aria-label="Change skin tone" title="Change skin tone" hidden>✎</button>
        <div id="profileSkinToneControl" class="profile-skin-tone" role="group" aria-label="Skin tone" hidden></div>
      </div>
      <button id="profileEquippedRightHandSlot" class="equipment-slot profile-equipment-slot slot-right-hand" type="button" data-slot="right-hand"><span>WEAPON</span></button>
      <button id="profileEquippedFeetSlot" class="equipment-slot profile-equipment-slot slot-feet" type="button" data-slot="feet"><span>BOOTS</span></button>
    </div>
    <button id="profileDuelBtn" class="profile-duel-button" type="button" hidden>DUEL</button>
    <div class="profile-tabs" role="tablist" aria-label="Player profile sections">
      <button id="profileStatsTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="profileStatsPanel">STATS</button>
      <button id="profileOverviewTab" class="profile-tab" type="button" role="tab" aria-selected="false" aria-controls="profileOverviewPanel">INFO</button>
    </div>
    <div id="playerProfileLoading" class="profile-loading">LOADING PLAYER…</div>
    <section id="profileOverviewPanel" class="profile-panel" role="tabpanel" aria-labelledby="profileOverviewTab" hidden>
      <dl class="profile-grid">
        <div><dt>DATE JOINED</dt><dd id="profileJoined">—</dd></div>
        <div><dt>TIME PLAYED</dt><dd id="profileTimePlayed">—</dd></div>
        <div><dt>ENEMIES DEFEATED</dt><dd id="profileKills">—</dd></div>
        <div><dt>STATUS</dt><dd id="profileOnline">—</dd></div>
      </dl>
    </section>
    <section id="profileStatsPanel" class="profile-panel" role="tabpanel" aria-labelledby="profileStatsTab">
      <p class="profile-stat-hint">Select a stat for details.</p>
      <div id="profileStatGrid" class="profile-stat-grid"></div>
    </section>
    <div id="profileSafetyActions" class="profile-safety-actions" hidden>
      <button id="profileReportBtn" type="button">Report Player</button>
      <button id="profileBlockBtn" type="button">Block Player</button>
    </div>
    <footer class="window-back-footer">
      <button id="closePlayerProfileBtn" class="window-back-button" type="button" aria-label="Back from player profile">Back</button>
    </footer>
  </div>
</div>

<div id="itemInspectionPanel" class="item-inspection-panel" role="dialog" aria-modal="true" aria-labelledby="itemInspectionTitle" hidden>
  <div class="item-inspection-header">
    <div class="item-inspection-title-block">
      <div class="item-inspection-kicker">ITEM DETAILS</div>
      <h2 id="itemInspectionTitle" class="window-title">ITEM</h2>
    </div>
  </div>
  <div id="itemInspectionContent" class="item-inspection-content"></div>
  <footer class="window-back-footer">
    <button id="itemInspectionBack" class="item-inspection-back window-back-button" type="button">Back</button>
  </footer>
</div>

<div id="profileNameEditor" hidden>
  <form id="profileNameEditorForm" class="modal profile-name-editor-modal" aria-label="Change player name">
    <label for="profileNameInput">PLAYER NAME</label>
    <div class="profile-name-editor-controls">
      <input id="profileNameInput" maxlength="20" autocomplete="off" spellcheck="false" />
      <button id="savePlayerNameBtn" type="submit">save</button>
    </div>
  </form>
</div>

<div id="profileIconPicker" hidden>
  <div class="modal profile-icon-picker-modal" role="dialog" aria-modal="true" aria-label="Choose profile icon">
    <div id="profileIconChoices" class="profile-icon-choices"></div>
    <footer class="window-back-footer">
      <button id="closeProfileIconPickerBtn" class="window-back-button" type="button" aria-label="Back from profile icon picker">Back</button>
    </footer>
  </div>
</div>

<div id="leaderboard" hidden>
  <div class="modal leaderboard-modal" role="dialog" aria-modal="true" aria-label="Leaderboard">
    <div class="profile-tabs leaderboard-tabs" role="tablist" aria-label="Leaderboard stat">
      <button id="leaderboardPowerTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true">POWER</button>
      <button id="leaderboardDamageTab" class="profile-tab" type="button" role="tab" aria-selected="false">DAMAGE</button>
      <button id="leaderboardHealthTab" class="profile-tab" type="button" role="tab" aria-selected="false">HEALTH</button>
      <button id="leaderboardArmorTab" class="profile-tab" type="button" role="tab" aria-selected="false">ARMOR</button>
      <button id="leaderboardRegenTab" class="profile-tab" type="button" role="tab" aria-selected="false">REGEN</button>
      <button id="leaderboardTimeTab" class="profile-tab" type="button" role="tab" aria-selected="false">TIME</button>
    </div>
    <section id="leaderboardPodium" class="leaderboard-podium" aria-label="Top three players" hidden></section>
    <div class="leaderboard-column-headings" aria-hidden="true"><span>RANK · PLAYER</span><span id="leaderboardValueHeading">POWER</span></div>
    <ol id="leaderboardRows" class="leaderboard-rows"></ol>
    <div id="leaderboardLoading" class="leaderboard-loading" role="status" aria-label="Loading leaderboard" hidden><span class="leaderboard-spinner" aria-hidden="true"></span></div>
    <div id="leaderboardEmpty" class="profile-loading" hidden>NO RANKINGS YET</div>
    <footer class="window-back-footer">
      <button id="closeLeaderboardBtn" class="window-back-button" type="button" aria-label="Back from leaderboard">Back</button>
    </footer>
  </div>
</div>

<div id="mapGuide" hidden>
  <section class="map-guide-window" role="dialog" aria-modal="true" aria-labelledby="mapGuideTitle">
    <header class="map-guide-header">
      <div>
        <p class="map-guide-kicker">World Map</p>
        <h2 id="mapGuideTitle" class="window-title">Tutorial Forest</h2>
      </div>
    </header>
    <div class="map-guide-scroll">
      <div class="map-guide-content">
        <div class="map-guide-map-frame">
          <canvas id="mapGuideCanvas" aria-hidden="true"></canvas>
          <div id="mapGuideZoneLabels" class="map-guide-zone-labels" role="list" aria-label="Enemy zone rewards"></div>
        </div>
        <section class="map-guide-drops" aria-labelledby="mapGuideDropsTitle">
          <header>
            <h3 id="mapGuideDropsTitle">Item Drops</h3>
          </header>
          <div id="mapGuideDropItems" class="map-guide-drop-items"></div>
        </section>
      </div>
    </div>
    <footer class="map-guide-footer">
      <button id="mapGuideBack" class="map-guide-back window-back-button" type="button">Back</button>
    </footer>
  </section>
</div>

<div id="devAudit" hidden>
  <div class="modal dev-audit-modal" role="dialog" aria-modal="true" aria-label="Developer tools">
    <div class="dev-audit-tabs" role="tablist" aria-label="Developer tools">
      <button id="devControlsTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true">Controls</button>
      <button id="devBugReportsTab" class="profile-tab" type="button" role="tab" aria-selected="false">Bug reports</button>
      <button id="devCutscenesTab" class="profile-tab" type="button" role="tab" aria-selected="false">Cutscenes</button>
      <button id="devPerformanceTab" class="profile-tab" type="button" role="tab" aria-selected="false">Performance</button>
    </div>
    <section id="devControlsPanel" role="tabpanel" aria-labelledby="devControlsTab">
      <p class="dev-audit-help">SESSION · SERVER-SAFE DEVELOPER CONTROLS</p>
      <div class="dev-presence-control">
        <div>
          <strong>PLAYER PRESENCE</strong>
          <small id="devPresenceStatus">INVISIBLE · NOT COUNTED ONLINE</small>
        </div>
        <button id="devPresenceToggle" class="secondary-button" type="button">APPEAR ONLINE</button>
      </div>
      <div class="dev-presence-control dev-load-test-control">
        <div>
          <strong>VIRTUAL PLAYER LOAD</strong>
          <small id="devVirtualPlayerStatus" aria-live="polite">OFF · REAL CLIENT TRAFFIC</small>
        </div>
        <div class="dev-load-test-actions">
          <label for="devVirtualPlayerCount">BOTS</label>
          <input id="devVirtualPlayerCount" type="number" min="1" max="200" step="1" value="10" inputmode="numeric" aria-label="Browser virtual player count, 1 to 200" />
          <button id="devVirtualPlayerToggle" class="secondary-button" type="button">START TEST</button>
        </div>
      </div>
    </section>
    <section id="devBugReportsPanel" role="tabpanel" aria-labelledby="devBugReportsTab" hidden>
      <p class="dev-audit-help">PRIVATE QUEUE · /BUG REPORTS</p>
      <div id="devBugReportRows" class="dev-bug-report-rows"></div>
      <div id="devBugReportEmpty" class="profile-loading">NO OPEN BUG REPORTS</div>
    </section>
    <section id="devCutscenesPanel" role="tabpanel" aria-labelledby="devCutscenesTab" hidden>
      <p class="dev-audit-help">LOCAL PREVIEW · MAP-SPECIFIC</p>
      <button id="triggerDragonCutsceneBtn" class="dev-cutscene-trigger" type="button">PLAY DRAGON PORTAL CUTSCENE</button>
      <button id="triggerSnowlandsCutsceneBtn" class="dev-cutscene-trigger" type="button">PLAY SNOWLANDS PORTAL CUTSCENE</button>
      <button id="triggerLavaCutsceneBtn" class="dev-cutscene-trigger" type="button">PLAY LAVA PORTAL CUTSCENE</button>
    </section>
    <section id="devPerformancePanel" class="dev-performance-panel" role="tabpanel" aria-labelledby="devPerformanceTab" hidden>
      <p class="dev-audit-help">LOCAL · LIVE FRAME AND RUNTIME STATS</p>
      <dl class="dev-performance-stats" aria-live="polite">
        <div><dt>FPS</dt><dd id="perfFps">—</dd></div>
        <div><dt>WORK FPS</dt><dd id="perfWorkFps">—</dd></div>
        <div><dt>FRAME P50</dt><dd id="perfFrameP50">—</dd></div>
        <div><dt>FRAME P95</dt><dd id="perfFrameP95">—</dd></div>
        <div><dt>WORST FRAME</dt><dd id="perfFrameWorst">—</dd></div>
        <div><dt>LONG FRAMES</dt><dd id="perfLongFrames">—</dd></div>
        <div><dt>RENDER</dt><dd id="perfRenderMs">—</dd></div>
        <div><dt>SCRIPT</dt><dd id="perfScriptMs">—</dd></div>
        <div><dt>ENEMIES</dt><dd id="perfEnemies">—</dd></div>
        <div><dt>PROJECTILES</dt><dd id="perfProjectiles">—</dd></div>
        <div><dt>PARTICLES</dt><dd id="perfParticles">—</dd></div>
        <div><dt>REMOTE PLAYERS</dt><dd id="perfRemotePlayers">—</dd></div>
        <div><dt>CANVAS DPR</dt><dd id="perfCanvasDpr">—</dd></div>
        <div><dt>CANVAS SIZE</dt><dd id="perfCanvasSize">—</dd></div>
        <div><dt>MEMORY</dt><dd id="perfMemory">—</dd></div>
        <div><dt>SUBSCRIPTIONS</dt><dd id="perfSubscriptions">—</dd></div>
      </dl>
    </section>
    <footer class="window-back-footer">
      <button id="closeDevAuditBtn" class="window-back-button" type="button" aria-label="Back from developer tools">Back</button>
    </footer>
  </div>
</div>

<div id="techTreeOverlay" hidden>
  <section class="tech-tree-window" role="dialog" aria-modal="true" aria-label="Tech tree">
    <header class="tech-tree-header">
      <div id="techTreeActive" class="tech-tree-active" aria-live="polite">NO RESEARCH ACTIVE</div>
    </header>
    <div class="tech-tree-viewport">
      <div id="techTreeMap" class="tech-tree-map" aria-label="Technology tree">
        <canvas id="techTreeCanvas" aria-hidden="true"></canvas>
      </div>
    </div>
    <footer class="window-back-footer">
      <button id="closeTechTreeBtn" class="window-back-button" type="button" aria-label="Back from tech tree">Back</button>
    </footer>
    <section id="techTreeDetail" class="tech-tree-detail" role="dialog" aria-modal="true" aria-label="Research details" hidden>
      <div class="tech-tree-detail-card">
        <div id="techTreeDetailContent" class="tech-tree-detail-content" aria-live="polite"></div>
        <footer class="window-back-footer">
          <button id="closeTechTreeDetailBtn" class="window-back-button" type="button" aria-label="Back from research details">Back</button>
        </footer>
      </div>
    </section>
  </section>
</div>

<div id="duelReplay" hidden>
  <div id="duelReplayHud">
    <span id="duelReplayTitle">Duel Replay · Observer</span>
    <button id="closeDuelReplayBtn" class="secondary-button" type="button">EXIT REPLAY</button>
  </div>
</div>

`;

export function installGameShell(doc: Document = document) {
  if (!doc.getElementById("blockedPlayersSetting")) {
    doc.getElementById("accountStatus")?.insertAdjacentHTML("afterend", `
      <details id="blockedPlayersSetting" class="setting-support" hidden>
        <summary>Blocked players</summary><div id="blockedPlayersList"></div>
      </details>
      <div class="setting-support">
        <span>HELP &amp; SUPPORT</span>
        <a href="mailto:support@wildstatmmo.com">support@wildstatmmo.com</a>
        <small>Report bugs with /bug in chat. For player concerns, use Report or Block on their profile.</small>
      </div>`);
  }
  installSettingsTabs(doc);
  const start = doc.getElementById("start");
  if (!start) throw new Error("WildStat startup shell is missing #start");
  if (!doc.getElementById("dailyGemBonus")) {
    start.insertAdjacentHTML("beforebegin", beforeStartShell);
  }

  const coopScript = doc.getElementById("wildstatCoopScript");
  if (!coopScript) throw new Error("WildStat startup shell is missing #wildstatCoopScript");
  if (!doc.getElementById("gameOver")) {
    coopScript.insertAdjacentHTML("beforebegin", afterUpdateGateShell);
  }
}

if (typeof document !== "undefined") installGameShell(document);
