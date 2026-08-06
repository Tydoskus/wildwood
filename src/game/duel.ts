export const DUEL_REQUEST_RANGE = 250;
export const DUEL_ARENA = { x: 6000, y: 6000, r: 430 } as const;
export const DUEL_REPLAY_COUNTDOWN_SECONDS = 3;
export const DUEL_SHOT_LIFETIME = 0.38;
export const DUEL_SHOT_SPEED = 620;

type ReplayCombatantFields = {
  durationSeconds: number;
  challengerMaxHp: number;
  opponentMaxHp: number;
  challengerAttackRate: number;
  opponentAttackRate: number;
  challengerAttacks: number;
  opponentAttacks: number;
  challengerRegen: number;
  opponentRegen: number;
  challengerDamage: number;
  opponentDamage: number;
  challengerArmor: number;
  opponentArmor: number;
  challengerFinalHp: number;
  opponentFinalHp: number;
};

export function duelStatLine(subject: string, attacks: number, damage: number, regen: number, blocked: number) {
  return `<div class="duel-stat-row"><span class="duel-stat-name">${subject}</span><br>` +
    `ATTACKED ${attacks} TIMES<br>DID ${Math.round(damage)} DMG<br>` +
    `REGENERATED ${Math.round(regen)} HP<br>BLOCKED ${Math.round(blocked)} DMG</div>`;
}

export function replayState(replay: ReplayCombatantFields, seconds: number) {
  const elapsed = Math.min(replay.durationSeconds, seconds);
  let time = 0;
  let challengerHp = replay.challengerMaxHp;
  let opponentHp = replay.opponentMaxHp;
  let challengerAttacks = 0;
  let opponentAttacks = 0;
  const challengerRate = Math.max(0.001, replay.challengerAttackRate);
  const opponentRate = Math.max(0.001, replay.opponentAttackRate);

  while (time < elapsed && challengerHp > 0 && opponentHp > 0) {
    const nextChallengerAttack = challengerAttacks < replay.challengerAttacks
      ? (challengerAttacks + 1) * challengerRate
      : Infinity;
    const nextOpponentAttack = opponentAttacks < replay.opponentAttacks
      ? (opponentAttacks + 1) * opponentRate
      : Infinity;
    const nextEvent = Math.min(elapsed, nextChallengerAttack, nextOpponentAttack);
    const delta = nextEvent - time;
    challengerHp = Math.min(replay.challengerMaxHp, challengerHp + replay.challengerRegen * delta);
    opponentHp = Math.min(replay.opponentMaxHp, opponentHp + replay.opponentRegen * delta);
    time = nextEvent;
    const challengerHits = nextChallengerAttack <= time + 0.00001 && challengerAttacks < replay.challengerAttacks;
    const opponentHits = nextOpponentAttack <= time + 0.00001 && opponentAttacks < replay.opponentAttacks;
    const challengerDamage = challengerHits ? Math.max(1, replay.challengerDamage - replay.opponentArmor) : 0;
    const opponentDamage = opponentHits ? Math.max(1, replay.opponentDamage - replay.challengerArmor) : 0;
    opponentHp = Math.max(0, opponentHp - challengerDamage);
    challengerHp = Math.max(0, challengerHp - opponentDamage);
    if (challengerHits) challengerAttacks += 1;
    if (opponentHits) opponentAttacks += 1;
    if (!challengerHits && !opponentHits) break;
  }

  if (elapsed >= replay.durationSeconds) {
    challengerHp = replay.challengerFinalHp;
    opponentHp = replay.opponentFinalHp;
  }
  return { challengerHp, opponentHp, challengerAttacks, opponentAttacks };
}
