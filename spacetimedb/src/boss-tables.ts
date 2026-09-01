import { table, t } from "spacetimedb/server";

function createBossTableSet() {
  return {
    boss: table(
      { public: true },
      {
        id: t.u32().primaryKey(),
        encounter: t.u64(),
        hp: t.f32(),
        maxHp: t.f32(),
        alive: t.bool(),
        respawnAtMicros: t.u64(),
        lastDamageAtMicros: t.u64().default(0n),
      },
    ),
    contribution: table(
      { public: false },
      {
        identity: t.identity().primaryKey(),
        encounter: t.u64(),
        displayName: t.string(),
        damage: t.f32(),
      },
    ),
    attackWindow: table(
      { public: false },
      {
        identity: t.identity().primaryKey(),
        encounter: t.u64(),
        startedAtMicros: t.u64(),
        hits: t.u32(),
      },
    ),
    result: table(
      { public: true },
      {
        id: t.u32().primaryKey(),
        encounter: t.u64(),
        totalDamage: t.f32(),
        contributorsJson: t.string(),
        createdAt: t.timestamp(),
      },
    ),
  };
}

const dragon = createBossTableSet();
const spider = createBossTableSet();
const frostclaw = createBossTableSet();
const magmalisk = createBossTableSet();
const gloomroot = createBossTableSet();
const tidewyrm = createBossTableSet();
const koiShogun = createBossTableSet();
const tempestKirin = createBossTableSet();

export const dragonBossTables = {
  dragonBoss: dragon.boss,
  dragonContribution: dragon.contribution,
  dragonAttackWindow: dragon.attackWindow,
  dragonResult: dragon.result,
};

export const spiderBossTables = {
  spiderBoss: spider.boss,
  spiderContribution: spider.contribution,
  spiderAttackWindow: spider.attackWindow,
  spiderResult: spider.result,
};

export const frostclawBossTables = {
  frostclawBoss: frostclaw.boss,
  frostclawContribution: frostclaw.contribution,
  frostclawAttackWindow: frostclaw.attackWindow,
  frostclawResult: frostclaw.result,
};

export const magmaliskBossTables = {
  magmaliskBoss: magmalisk.boss,
  magmaliskContribution: magmalisk.contribution,
  magmaliskAttackWindow: magmalisk.attackWindow,
  magmaliskResult: magmalisk.result,
};

export const gloomrootBossTables = {
  gloomrootBoss: gloomroot.boss,
  gloomrootContribution: gloomroot.contribution,
  gloomrootAttackWindow: gloomroot.attackWindow,
  gloomrootResult: gloomroot.result,
};

export const tidewyrmBossTables = {
  tidewyrmBoss: tidewyrm.boss,
  tidewyrmContribution: tidewyrm.contribution,
  tidewyrmAttackWindow: tidewyrm.attackWindow,
  tidewyrmResult: tidewyrm.result,
};

export const koiShogunBossTables = {
  koiShogunBoss: koiShogun.boss,
  koiShogunContribution: koiShogun.contribution,
  koiShogunAttackWindow: koiShogun.attackWindow,
  koiShogunResult: koiShogun.result,
};

export const tempestKirinBossTables = {
  tempestKirinBoss: tempestKirin.boss,
  tempestKirinContribution: tempestKirin.contribution,
  tempestKirinAttackWindow: tempestKirin.attackWindow,
  tempestKirinResult: tempestKirin.result,
};
