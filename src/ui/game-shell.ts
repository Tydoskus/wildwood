import { installFeedbackControls } from "./feedback-settings";
import { installSettingsTabs } from "./settings-tabs";
import { hudReminderMarkup } from "./hud-reminders";
import { installGamepadControls } from "./gamepad-controls";
import { applyTextOutlineMode } from "./text-outline-mode";

const beforeStartShell = String.raw`
<div id="chatMessageActions" class="chat-message-actions" hidden>
  <button id="chatMessageActionsBackdrop" class="chat-message-actions-backdrop" type="button" aria-label="Close message actions" tabindex="-1"></button>
  <section id="chatMessageActionSheet" class="chat-message-action-sheet" role="dialog" aria-modal="true" aria-labelledby="chatMessageActionTitle" aria-describedby="chatMessageActionPreview">
    <div id="chatMessageActionDrag" class="chat-message-action-drag" aria-label="Swipe down to close">
      <span class="chat-message-action-handle" aria-hidden="true"></span>
    </div>
    <div id="chatMessageReactions" class="chat-message-reaction-picker" role="group" aria-label="React to message"></div>
    <header class="chat-message-action-header">
      <h2 id="chatMessageActionTitle">Message</h2>
      <p id="chatMessageActionPreview"></p>
    </header>
    <div id="chatMessageActionMenu" class="chat-message-action-menu">
      <button id="chatMessageWatchReplayBtn" class="chat-message-action-button" type="button" hidden><span class="chat-message-watch-replay-icon" aria-hidden="true"></span>Watch Replay</button>
      <button id="chatMessageCopyBtn" class="chat-message-action-button" type="button"><span aria-hidden="true">⧉</span>Copy</button>
      <button id="chatMessageOriginalBtn" class="chat-message-action-button" type="button" aria-label="Go to original message" hidden><span aria-hidden="true">↥</span>Original</button>
      <button id="chatMessageDirectMessageBtn" class="chat-message-action-button" type="button"><span aria-hidden="true">✉</span>Direct message</button>
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
    <button id="shareDuelBtn" class="secondary-button" type="button" hidden>SHARE TO CHAT</button>
    <button id="watchDuelReplayBtn" type="button"><span class="duel-replay-play-icon" aria-hidden="true"></span><span>WATCH REPLAY</span></button>
    <button id="closeDuelResultBtn" class="secondary-button" type="button">CONTINUE</button>
  </div>
</div>

<div id="playerProfile" hidden>
  <div class="modal player-profile-modal" role="dialog" aria-modal="true" aria-labelledby="playerProfileName">
    <div class="player-profile-scroll">
    <header class="player-profile-header">
      <div class="profile-avatar-column">
        <button id="playerProfileIcon" class="profile-icon profile-window-icon" type="button" aria-label="Player profile icon"></button>
        <div class="profile-heart-total" aria-label="Lifetime hearts received"><span aria-hidden="true">❤️</span><span id="playerProfileHearts">0</span></div>
      </div>
      <div class="player-profile-title-row">
        <div class="player-profile-identity">
          <div class="player-profile-name-row">
            <span id="playerProfileGuestLabel" class="player-profile-guest" hidden>(guest)</span>
            <h2 id="playerProfileName">PLAYER</h2>
          </div>
          <div id="playerProfilePresence" class="player-profile-presence">CHECKING STATUS</div>
          <div id="playerProfileChallenge" class="player-profile-challenge" hidden></div>
          <button id="playerProfileGuild" class="player-profile-guild" type="button" hidden></button>
        </div>
      </div>
      <div class="profile-header-actions">
        <button id="editPlayerNameBtn" class="profile-editor-pencil profile-name-edit" type="button" aria-label="Edit profile" aria-haspopup="dialog" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
        <button id="profileMoreBtn" class="profile-editor-pencil profile-name-edit profile-more-button" type="button" aria-label="More actions" aria-haspopup="dialog" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg></button>
        <button id="settingsBtn" class="profile-settings-button" type="button" aria-label="Open settings" aria-expanded="false" aria-controls="settingsPanel" title="Settings" hidden><img src="assets/wildstat/icons/Icon_Settings.webp" alt="" aria-hidden="true"></button>
      </div>
    </header>
    <div id="profileCharacterPreview" class="profile-character-preview character-loadout-preview" aria-label="Player character and equipped items">
      <canvas id="profileCharacterCanvas" class="profile-character-canvas character-preview-canvas" width="240" height="136" aria-hidden="true"></canvas>
      <div id="playerProfilePower" aria-label="Power 0"><span class="power-value">0</span><img class="power-icon" src="assets/wildstat/icons/Icon_Battle_Candy_v2.webp" alt="" aria-hidden="true"></div>
      <button id="profileEquippedHeadSlot" class="equipment-slot profile-equipment-slot slot-head" type="button" data-slot="head"><span>HEAD</span></button>
      <button id="profileEquippedChestSlot" class="equipment-slot profile-equipment-slot slot-chest" type="button" data-slot="chest"><span>ARMOR</span></button>
      <div class="profile-character-stage">
        <button id="previousPlayerSpriteBtn" class="player-sprite-selector previous" type="button" aria-label="Previous character" hidden><span aria-hidden="true"></span></button>
        <button id="nextPlayerSpriteBtn" class="player-sprite-selector next" type="button" aria-label="Next character" hidden><span aria-hidden="true"></span></button>
      </div>
      <button id="profileEquippedRightHandSlot" class="equipment-slot profile-equipment-slot slot-right-hand" type="button" data-slot="right-hand"><span>WEAPON</span></button>
      <button id="profileEquippedFeetSlot" class="equipment-slot profile-equipment-slot slot-feet" type="button" data-slot="feet"><span>BOOTS</span></button>
    </div>
    <button id="profileDuelBtn" class="profile-duel-button" type="button" hidden>DUEL</button>
    <div class="profile-tabs profile-tabs-with-action">
      <div class="profile-tab-list" role="tablist" aria-label="Player profile sections">
        <button id="profileStatsTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="profileStatsPanel">Stats</button>
        <button id="profileSkillsTab" class="profile-tab" type="button" role="tab" aria-selected="false" aria-controls="profileSkillsPanel">Skills</button>
        <button id="profileInfoTab" class="profile-tab" type="button" role="tab" aria-selected="false" aria-controls="profileInfoPanel">Info</button>
        <button id="profileBonusesTab" class="profile-tab" type="button" role="tab" aria-selected="false" aria-controls="profileBonusesPanel" hidden>Bonuses</button>
      </div>
      <div id="profileOwnActions" class="profile-own-actions" hidden>
        <button id="prestigeBtn" class="window-back-button profile-prestige-button" type="button" disabled aria-disabled="true">Prestige</button>
      </div>
    </div>
    <div class="profile-tab-panels">
      <div id="playerProfileLoading" class="profile-loading" role="status" hidden></div>
      <section id="profileInfoPanel" class="profile-panel" role="tabpanel" aria-labelledby="profileInfoTab" hidden>
        <dl class="profile-grid">
          <div><dt>DATE JOINED</dt><dd id="profileJoined">—</dd></div>
          <div><dt>TIME PLAYED</dt><dd id="profileTimePlayed">—</dd></div>
          <div><dt>ENEMIES DEFEATED</dt><dd id="profileKills">—</dd></div>
          <div id="profilePrestigeRow" hidden><dt>PRESTIGE</dt><dd id="profilePrestige">—</dd></div>
          <div><dt>STATUS</dt><dd id="profileOnline">—</dd></div>
        </dl>
        <section id="profileSoulTier" class="profile-soul-tier" hidden></section>
      </section>
      <section id="profileStatsPanel" class="profile-panel" role="tabpanel" aria-labelledby="profileStatsTab">
        <div id="profileStatGrid" class="profile-stat-grid"></div>
      </section>
      <section id="profileSkillsPanel" class="profile-panel profile-skills-panel" role="tabpanel" aria-labelledby="profileSkillsTab" hidden></section>
      <section id="profileBonusesPanel" class="profile-panel profile-bonuses-panel" role="tabpanel" aria-labelledby="profileBonusesTab" hidden></section>
    </div>
    </div>
    <footer class="window-back-footer">
      <button id="closePlayerProfileBtn" class="window-back-button" type="button" aria-label="Back from player profile">Back</button>
    </footer>
  </div>
</div>

<div id="itemInspectionPanel" class="item-inspection-panel" role="dialog" aria-modal="true" aria-labelledby="itemInspectionTitle" hidden>
  <section class="item-inspection-window">
  <div class="item-inspection-tools"></div>
  <div id="itemInspectionContent" class="item-inspection-content">
    <span id="itemInspectionTitle" class="item-inspection-name">Item</span>
  </div>
  <footer class="window-back-footer">
    <button id="itemInspectionBack" class="item-inspection-back window-back-button" type="button">Back</button>
  </footer>
  </section>
</div>

<div id="profileNameEditor" hidden>
  <div class="modal profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="profileEditorTitle">
    <h2 id="profileEditorTitle" class="window-title profile-editor-title">Edit Profile</h2>
    <div class="profile-editor-scroll">
      <div class="profile-editor-item">
        <button id="profileEditorPicture" class="profile-icon profile-editor-picture" type="button" aria-label="Change profile picture"></button>
        <button id="profileEditorPictureBtn" class="profile-editor-pencil" type="button" aria-label="Change picture" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      </div>
      <div class="profile-editor-item">
        <span class="profile-editor-name-pill" data-opens="profileNameToggle"><span id="profileEditorPreview" class="profile-editor-preview"></span></span>
        <button id="profileNameToggle" class="profile-editor-pencil" type="button" aria-label="Change name" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      </div>
      <div class="profile-editor-item">
        <span class="profile-editor-visual" data-opens="profileNameColorToggle"><span class="profile-editor-caption">Name Color:</span><span id="profileNameColorSwatch" class="profile-editor-color-dot" role="img"></span></span>
        <button id="profileNameColorToggle" class="profile-editor-pencil" type="button" aria-label="Change name color" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      </div>
      <div class="profile-editor-item">
        <span class="profile-editor-visual" data-opens="profileGenderToggle"><span class="profile-editor-caption">Gender:</span><span id="profileGenderValue" class="profile-editor-gender"></span></span>
        <button id="profileGenderToggle" class="profile-editor-pencil" type="button" aria-label="Change gender" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      </div>
      <div class="profile-editor-item">
        <span class="profile-editor-visual" data-opens="profileSkinToneToggle"><span class="profile-editor-caption">Skin Tone:</span><span id="profileSkinToneSwatch" class="profile-editor-skin-swatch" role="img"></span></span>
        <button id="profileSkinToneToggle" class="profile-editor-pencil" type="button" aria-label="Change skin tone" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
      </div>
    </div>
    <footer class="window-back-footer">
      <button id="closeProfileEditorBtn" class="window-back-button" type="button">Back</button>
    </footer>
  </div>
  <div id="profileEditorPicker" class="profile-editor-picker-overlay" hidden>
    <div class="modal profile-editor-picker-window" role="dialog" aria-modal="true" aria-labelledby="profileEditorPickerTitle">
      <h2 id="profileEditorPickerTitle" class="window-title profile-editor-title"></h2>
      <form id="profileNameEditorForm" class="profile-editor-picker" aria-label="Change player name" hidden>
        <div class="profile-name-editor-controls">
          <input id="profileNameInput" maxlength="20" autocomplete="off" spellcheck="false" aria-label="Player name" />
          <button id="savePlayerNameBtn" type="submit">Save</button>
        </div>
      </form>
      <div id="profileNameColorChoices" class="profile-name-color-choices" role="group" aria-label="Name color" hidden></div>
      <div id="profileGenderChoices" class="profile-gender-choices" role="group" aria-label="Gender" hidden>
        <button class="profile-gender-choice" type="button" data-gender="1" aria-pressed="false">
          <img data-game-src="assets/wildstat/gender/male-v2.webp" alt="" aria-hidden="true" draggable="false" /><span>Male</span>
        </button>
        <button class="profile-gender-choice" type="button" data-gender="2" aria-pressed="false">
          <img data-game-src="assets/wildstat/gender/female-v2.webp" alt="" aria-hidden="true" draggable="false" /><span>Female</span>
        </button>
      </div>
      <div id="profileSkinToneControl" class="profile-skin-tone" role="group" aria-label="Skin tone" hidden></div>
      <footer class="window-back-footer">
        <button id="profileEditorPickerBack" class="window-back-button" type="button">Back</button>
      </footer>
    </div>
  </div>
</div>

<div id="chatAgeGate" hidden>
  <div class="modal chat-age-gate-modal" role="dialog" aria-modal="true" aria-labelledby="chatAgeGateTitle">
    <h2 id="chatAgeGateTitle" class="window-title">Choose your age</h2>
    <p class="chat-age-gate-note">Chat is for players 13 and older.</p>
    <div class="legal-age-control">
      <output id="chatAgeOutput" class="legal-age-output" for="chatAgeSlider" aria-live="polite"></output>
      <input id="chatAgeSlider" class="is-unset" type="range" min="1" max="100" step="1" value="50" aria-label="Your age" aria-valuetext="Not selected" />
      <div class="legal-age-limits" aria-hidden="true"><span>1</span><span>100+</span></div>
    </div>
    <button id="chatAgeContinueBtn" type="button" disabled>Continue</button>
    <p id="chatAgeStatus" class="legal-gate-status" role="status">Select your age to continue.</p>
    <footer class="window-back-footer">
      <button id="chatAgeBackBtn" class="window-back-button" type="button">Back</button>
    </footer>
  </div>
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
  <div class="modal leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="leaderboardTitle">
    <h2 id="leaderboardTitle" class="window-banner window-banner--gold"><span>Leaderboard</span></h2>
    <section id="leaderboardPodium" class="leaderboard-podium" aria-label="Top three players" hidden></section>
    <div class="profile-tabs leaderboard-tabs" role="tablist" aria-label="Leaderboard stat">
      <button id="leaderboardRivalsTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true" aria-label="Rivals: players at your prestige level, by power">Rivals</button>
      <button id="leaderboardPowerTab" class="profile-tab" type="button" role="tab" aria-selected="false">Power</button>
      <button id="leaderboardPrestigeTab" class="profile-tab" type="button" role="tab" aria-selected="false">Prestige</button>
      <button id="leaderboardTimeTab" class="profile-tab" type="button" role="tab" aria-selected="false">Time Played</button>
    </div>
    <div class="leaderboard-column-headings" aria-hidden="true"><span>Rank</span><span class="leaderboard-player-heading">Player</span><span id="leaderboardValueHeading">Power</span></div>
    <div class="leaderboard-scroll">
    <ol id="leaderboardRows" class="leaderboard-rows"></ol>
    <div id="leaderboardLoading" class="leaderboard-loading" role="status" aria-label="Loading leaderboard" hidden><span class="leaderboard-spinner" aria-hidden="true"></span></div>
    <div id="leaderboardEmpty" class="profile-loading" hidden>NO RANKINGS YET</div>
    </div>
    <div class="leaderboard-prestige">
      <div id="leaderboardPrestigeChips" class="leaderboard-prestige-chips" role="listbox" aria-label="Ranking" hidden></div>
      <button id="leaderboardPrestigeHeading" class="leaderboard-prestige-heading" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="leaderboardPrestigeChips"></button>
    </div>
    <footer class="window-back-footer">
      <button id="closeLeaderboardBtn" class="window-back-button" type="button" aria-label="Back from leaderboard">Back</button>
    </footer>
  </div>
</div>

<div id="mapGuide" hidden>
  <section class="map-guide-window" role="dialog" aria-modal="true" aria-labelledby="mapGuideTitle">
    <header class="map-guide-header">
      <button id="mapGuidePrev" class="map-guide-arrow is-prev" type="button" aria-label="Previous map"></button>
      <div class="map-guide-heading">
        <p id="mapGuideKicker" class="map-guide-kicker">Map 1</p>
        <h2 id="mapGuideTitle" class="window-title">Tutorial Forest</h2>
      </div>
      <button id="mapGuideNext" class="map-guide-arrow is-next" type="button" aria-label="Next map"></button>
    </header>
    <div class="map-guide-scroll">
      <div class="map-guide-content">
        <div class="map-guide-map-frame">
          <canvas id="mapGuideCanvas" aria-hidden="true"></canvas>
          <div id="mapGuideZoneLabels" class="map-guide-zone-labels" role="list" aria-label="Enemy zone rewards"></div>
        </div>
        <section class="map-guide-enemies" aria-labelledby="mapGuideEnemiesTitle">
          <h3 id="mapGuideEnemiesTitle">Enemy Index</h3>
          <table class="enemy-index-table">
            <thead><tr><th scope="col">Enemy</th><th scope="col">HP</th><th scope="col">Atk</th><th scope="col">Reward</th></tr></thead>
            <tbody id="mapGuideEnemyRows"></tbody>
          </table>
          <p class="enemy-index-note">Atk is one hit, before your armor. Rewards are per kill.</p>
        </section>
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
    <p id="devAccessGate" class="dev-access-gate" role="status" hidden></p>
    <div id="devOverview" class="dev-overview" aria-label="Moderation overview" hidden></div>
    <div id="devAuditTabs" class="dev-audit-tabs" role="tablist" aria-label="Developer tools">
      <button id="devReportsTab" class="profile-tab is-active" type="button" role="tab" aria-selected="true">Reports</button>
      <button id="devBugReportsTab" class="profile-tab" type="button" role="tab" aria-selected="false">Bugs</button>
      <button id="devMutedTab" class="profile-tab" type="button" role="tab" aria-selected="false">Muted</button>
      <button id="devBannedTab" class="profile-tab" type="button" role="tab" aria-selected="false">Banned</button>
      <button id="devDeletionsTab" class="profile-tab" type="button" role="tab" aria-selected="false">Deletions</button>
      <button id="devPlayersTab" class="profile-tab" type="button" role="tab" aria-selected="false">Players</button>
      <button id="devModerationTab" class="profile-tab" type="button" role="tab" aria-selected="false">Log</button>
      <button id="devControlsTab" class="profile-tab" type="button" role="tab" aria-selected="false">Controls</button>
      <button id="devBalanceTab" class="profile-tab" type="button" role="tab" aria-selected="false">Balance</button>
      <button id="devPerformanceTab" class="profile-tab" type="button" role="tab" aria-selected="false">Performance</button>
      <button id="devAnalyticsTab" class="profile-tab" type="button" role="tab" aria-selected="false">Analytics</button>
    </div>
    <section id="devReportsPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devReportsTab"></section>
    <section id="devBugReportsPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devBugReportsTab" hidden></section>
    <section id="devMutedPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devMutedTab" hidden></section>
    <section id="devBannedPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devBannedTab" hidden></section>
    <section id="devDeletionsPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devDeletionsTab" hidden></section>
    <section id="devPlayersPanel" class="dev-review-panel" role="tabpanel" aria-labelledby="devPlayersTab" hidden></section>
    <section id="devBalancePanel" role="tabpanel" aria-labelledby="devBalanceTab" hidden></section>
    <section id="devModerationPanel" role="tabpanel" aria-labelledby="devModerationTab" hidden></section>
    <section id="devControlsPanel" role="tabpanel" aria-labelledby="devControlsTab" hidden>
      <div class="setting-row">
        <span>DEVELOPER NAME TAG</span>
        <button id="devNameTagToggle" class="secondary-button" type="button" aria-pressed="true">HIDE [dev]</button>
      </div>
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
    <section id="devAnalyticsPanel" class="dev-analytics-panel" role="tabpanel" aria-labelledby="devAnalyticsTab" hidden></section>
    <footer class="window-back-footer">
      <button id="closeDevAuditBtn" class="window-back-button" type="button" aria-label="Back from developer tools">Back</button>
    </footer>
  </div>
</div>

<div id="prestigeOverlay" hidden>
  <section class="prestige-window" role="dialog" aria-modal="true" aria-labelledby="prestigeTitle">
    <header class="prestige-header">
      <h2 id="prestigeTitle" class="window-banner window-banner--blue"><span>Prestige</span></h2>
      <div id="prestigeLevel" class="prestige-level" aria-live="polite">PRESTIGE 0</div>
    </header>
    <div class="prestige-tabs" role="tablist" aria-label="Prestige view">
      <button id="prestigePerksTabBtn" class="prestige-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="prestigePerksTab">Perks</button>
      <button id="prestigeChallengeTabBtn" class="prestige-tab" type="button" role="tab" aria-selected="false" aria-controls="prestigeChallengeTab" tabindex="-1">Challenge</button>
      <button id="prestigeRunsTabBtn" class="prestige-tab" type="button" role="tab" aria-selected="false" aria-controls="prestigeRunsTab" tabindex="-1">Runs</button>
    </div>
    <div id="prestigePerksTab" class="prestige-tab-panel" role="tabpanel" aria-labelledby="prestigePerksTabBtn">
      <dl class="prestige-summary">
        <div><dt>STAT GAIN</dt><dd id="prestigeBonus">—</dd></div>
        <div><dt>PERK POINTS</dt><dd id="prestigePoints">—</dd></div>
        <div><dt>PEAK POWER</dt><dd id="prestigePeak">—</dd></div>
      </dl>
      <div id="prestigePerks" class="prestige-perks" aria-label="Prestige perks"></div>
      <p id="prestigeCost" class="prestige-cost"></p>
    </div>
    <div id="prestigeChallengeTab" class="prestige-tab-panel" role="tabpanel" aria-labelledby="prestigeChallengeTabBtn" hidden></div>
    <div id="prestigeRunsTab" class="prestige-tab-panel prestige-runs" role="tabpanel" aria-labelledby="prestigeRunsTabBtn" hidden></div>
    <div id="prestigeStatus" class="prestige-status" role="status" aria-live="polite"></div>
    <footer class="prestige-footer">
      <button id="prestigeConfirmBtn" class="prestige-confirm" type="button">Prestige</button>
      <button id="closePrestigeBtn" class="window-back-button" type="button" aria-label="Back from prestige">Back</button>
    </footer>
  </section>
</div>
<div id="techTreeOverlay" hidden>
  <section class="tech-tree-window" role="dialog" aria-modal="true" aria-labelledby="techTreeTitle">
    <header class="tech-tree-header">
      <h2 id="techTreeTitle" class="window-banner window-banner--blue"><span>Tech Research</span></h2>
      <div id="techTreeActive" class="tech-tree-active" aria-live="polite">NO RESEARCH ACTIVE</div>
    </header>
    <div id="techTreeCategories" class="tech-tree-categories" aria-label="Choose a research tree">
      <button class="tech-tree-choice" type="button" data-research-tree="power"><span class="tech-tree-choice-icon" aria-hidden="true">⚔</span><strong>Power</strong><span>Combat and stat research</span><small class="tech-tree-choice-progress"></small></button>
      <button class="tech-tree-choice" type="button" data-research-tree="utility"><span class="tech-tree-choice-icon" aria-hidden="true">✧</span><strong>Utility</strong><span>Timers, respawns and movement</span><small class="tech-tree-choice-progress"></small></button>
    </div>
    <div id="techTreeViewport" class="tech-tree-viewport" hidden>
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
  </div>
  <footer class="window-back-footer">
    <button id="closeDuelReplayBtn" class="window-back-button" type="button">Back</button>
  </footer>
</div>

`;

export function installGameShell(doc: Document = document) {
  // A gear beside power that opens Settings; the card itself still opens the profile,
  // which keeps its own Settings gear. Injected so the entry page keeps its byte budget.
  if (!doc.getElementById("playerHudProfileGear")) {
    doc.getElementById("playerPower")?.insertAdjacentHTML("afterend", `<button id="playerHudProfileGear" class="hud-settings-button" type="button" aria-label="Open settings" title="Settings"><img src="assets/wildstat/icons/Icon_Settings.webp" alt="" aria-hidden="true"></button>`);
  }
  // Research Ready and Smith upgrades; the timer column takes them in once it is built.
  if (!doc.getElementById("researchReadyHint")) doc.getElementById("enemyRespawnAdBtn")?.insertAdjacentHTML("beforebegin", hudReminderMarkup());
  if (!doc.getElementById("playerVisibilityToggle")) {
    doc.getElementById("hudGemWallet")?.insertAdjacentHTML("afterend", `<button id="playerVisibilityToggle" class="player-visibility-toggle" type="button" aria-label="Show other players" aria-pressed="false"></button>`);
  }
  if (!doc.getElementById("mailboxToggle")) {
    doc.getElementById("playerVisibilityToggle")?.insertAdjacentHTML("afterend", `<button id="mailboxToggle" class="mailbox-toggle" type="button" aria-label="Mailbox" hidden></button>`);
  }
  // Gold sits right of the gems, in the same chip; the coin is drawn here rather than shipped as art.
  if (!doc.getElementById("hudGoldWallet")) {
    doc.getElementById("hudGemWallet")?.insertAdjacentHTML("afterend", `<div id="hudGoldWallet" class="hud-gem-wallet hud-gold-wallet" aria-label="0 Gold"><svg class="hud-gem-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#e3b23c" stroke="#7a4f12" stroke-width="1.5"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#a8741d" stroke-width="1.2"/><path d="M6.5 7.5a4.5 4.5 0 0 1 3-2.5" fill="none" stroke="#fff3c4" stroke-width="1.2" stroke-linecap="round"/></svg><strong id="hudGoldBalance" class="hud-gem-balance">0</strong></div>`);
  }
  // The nocked arrow beside gold, shown while a bow is in hand (hud-arrow-chip.ts).
  if (!doc.getElementById("hudArrowChip")) {
    doc.getElementById("hudGoldWallet")?.insertAdjacentHTML("afterend", `<button id="hudArrowChip" class="hud-gem-wallet hud-arrow-chip" type="button" aria-label="Nocked arrow" hidden><img class="hud-gem-icon" alt="" aria-hidden="true" draggable="false"><strong class="hud-gem-balance">0</strong></button>`);
  }
  const toolbar = doc.getElementById("toolbar");
  for (const [id, label, icon] of [
    ["guildBtn", "Guilds", "Icon_Guild.svg"],
  ]) {
    if (!toolbar || doc.getElementById(id)) continue;
    const button = doc.createElement("button");
    button.id = id;
    button.className = "settings-button";
    button.type = "button";
    button.setAttribute("aria-label", `Open ${label.toLowerCase()}`);
    button.setAttribute("aria-expanded", "false");
    const image = doc.createElement("img");
    image.className = "toolbar-icon";
    image.src = `assets/wildstat/icons/${icon}`;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    const text = doc.createElement("span");
    text.className = "toolbar-label";
    text.textContent = label;
    button.append(image, text);
    toolbar.insertBefore(button, doc.getElementById("leaderboardBtn"));
  }
  if (!doc.getElementById("blockedPlayersSetting")) {
    doc.getElementById("accountStatus")?.insertAdjacentHTML("afterend", `
      <details id="blockedPlayersSetting" class="setting-support" hidden>
        <summary>Blocked players</summary><div id="blockedPlayersList"></div>
      </details>
      <div class="setting-support">
        <span>Help &amp; Support</span>
        <a href="mailto:support@wildstatmmo.com">support@wildstatmmo.com</a>
        <small>Report bugs with /bug in chat. For player concerns, use Report or Block on their profile.</small>
      </div>`);
  }
  // Settings opens above the profile, outside the toolbar’s lower stacking context.
  const settingsPanel = doc.getElementById("settingsPanel");
  if (settingsPanel && settingsPanel.parentElement !== doc.body) doc.body.append(settingsPanel);
  installFeedbackControls(doc);
  if (!doc.getElementById("questTrackerToggle")) {
    doc.getElementById("statTrackerToggle")?.closest(".setting-row")?.insertAdjacentHTML("afterend", `
      <div class="setting-row"><span>Quest Tracker</span>
      <button id="questTrackerToggle" class="setting-toggle" type="button" aria-label="Quest tracker on the HUD" aria-pressed="true">ON</button></div>`);
  }
  if (!doc.getElementById("baseStatRewardsToggle")) {
    doc.getElementById("statTrackerToggle")?.closest(".setting-row")?.insertAdjacentHTML("afterend", `
      <div class="setting-row"><span>Base Stat Rewards</span>
      <button id="baseStatRewardsToggle" class="setting-toggle" type="button" aria-label="Show base stat rewards under enemies, in autofarm and reward popups" aria-pressed="false">OFF</button></div>`);
  }
  if (!doc.getElementById("slotUpgradesQueueThree")) {
    doc.getElementById("slotUpgradesQueueTwo")?.insertAdjacentHTML("afterend", `
      <button id="slotUpgradesQueueThree" class="inventory-item slot-upgrades-queue is-locked" type="button" aria-label="Unlock A Third Queue For 200 Gems" aria-pressed="false" hidden></button>`);
  }
  installSettingsTabs(doc);
  // From the title screen on, so a controller can sign in too.
  installGamepadControls(doc);
  const start = doc.getElementById("start");
  if (!start) throw new Error("WildStat startup shell is missing #start");
  if (!doc.getElementById("chatMessageActions")) {
    start.insertAdjacentHTML("beforebegin", beforeStartShell);
  }

  const coopScript = doc.getElementById("wildstatCoopScript");
  if (!coopScript) throw new Error("WildStat startup shell is missing #wildstatCoopScript");
  if (!doc.getElementById("gameOver")) {
    coopScript.insertAdjacentHTML("beforebegin", afterUpdateGateShell);
  }
}

if (typeof document !== "undefined") {
  applyTextOutlineMode(document, navigator.userAgent);
  installGameShell(document);
}
