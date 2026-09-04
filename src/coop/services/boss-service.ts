import type {
  DragonBossState,
  DragonContributor,
  DragonResult,
  FrostclawBossState,
  FrostclawResult,
  GloomrootBossState,
  GloomrootResult,
  KoiShogunBossState,
  KoiShogunResult,
  MagmaliskBossState,
  MagmaliskResult,
  MiremawBossState,
  PrismshellBossState,
  MiremawResult,
  PrismshellResult,
  SpiderBossState,
  SpiderResult,
  TempestKirinBossState,
  TempestKirinResult,
  TidewyrmBossState,
  TidewyrmResult,
} from "../contracts";
import type { ReducerPort } from "../ports";
import { normalizePlayerGender } from "../../../shared/player-gender";

type BossServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localPosition: () => { x: number; y: number } | null;
};

type BossRow = {
  encounter: bigint;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnAtMicros: bigint;
};

type BossResultRow = {
  encounter: bigint;
  totalDamage: number;
  contributorsJson: string;
  createdAt: { microsSinceUnixEpoch: bigint };
};

function bossState(row: BossRow): DragonBossState {
  return {
    encounter: row.encounter,
    hp: row.hp,
    maxHp: row.maxHp,
    alive: row.alive,
    respawnAtMs: Number(row.respawnAtMicros / 1_000n),
  };
}

function contributorsFromJson(contributorsJson: string): DragonContributor[] {
  try {
    const parsed = JSON.parse(contributorsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        identity: typeof entry.identity === "string" ? entry.identity : "",
        name: typeof entry.name === "string" ? entry.name : "PLAYER",
        gender: normalizePlayerGender(entry.gender),
        damage: Number(entry.damage) || 0,
        percentage: Number(entry.percentage) || 0,
      }));
  } catch {
    return [];
  }
}

function bossResult(row: BossResultRow): DragonResult {
  return {
    encounter: row.encounter,
    totalDamage: row.totalDamage,
    contributors: contributorsFromJson(row.contributorsJson),
    createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1_000n),
  };
}

function copyResult(result: DragonResult | null) {
  return result
    ? { ...result, contributors: result.contributors.map((entry) => ({ ...entry })) }
    : null;
}

export function createBossService(dependencies: BossServiceDependencies) {
  let dragon: DragonBossState | null = null;
  let dragonResult: DragonResult | null = null;
  let spider: SpiderBossState | null = null;
  let spiderResult: SpiderResult | null = null;
  let frostclaw: FrostclawBossState | null = null;
  let frostclawResult: FrostclawResult | null = null;
  let magmalisk: MagmaliskBossState | null = null;
  let magmaliskResult: MagmaliskResult | null = null;
  let gloomroot: GloomrootBossState | null = null;
  let gloomrootResult: GloomrootResult | null = null;
  let tidewyrm: TidewyrmBossState | null = null;
  let tidewyrmResult: TidewyrmResult | null = null;
  let koiShogun: KoiShogunBossState | null = null;
  let koiShogunResult: KoiShogunResult | null = null;
  let tempestKirin: TempestKirinBossState | null = null;
  let tempestKirinResult: TempestKirinResult | null = null;
  let miremaw: MiremawBossState | null = null;
  let prismshell: PrismshellBossState | null = null;
  let miremawResult: MiremawResult | null = null;
  let prismshellResult: PrismshellResult | null = null;

  function damage(
    action: string,
    reducer: (connection: NonNullable<ReturnType<ReducerPort["connection"]>>, hits: number, x: number, y: number) => unknown,
    hits = 1,
    x = dependencies.localPosition()?.x ?? Number.NaN,
    y = dependencies.localPosition()?.y ?? Number.NaN,
  ) {
    const connection = dependencies.reducers.connection();
    if (dependencies.reducers.protocolBlocked() || !connection || !Number.isFinite(x) || !Number.isFinite(y)) return;
    dependencies.reducers.sendReducer(action, (current) => reducer(current, hits, x, y));
  }

  return {
    tables: {
      upsertDragon(row: BossRow) {
        dragon = bossState(row);
      },
      upsertDragonResult(row: BossResultRow) {
        dragonResult = bossResult(row);
        dependencies.notify();
      },
      upsertSpider(row: BossRow) {
        spider = bossState(row);
      },
      upsertSpiderResult(row: BossResultRow) {
        spiderResult = bossResult(row);
        dependencies.notify();
      },
      upsertFrostclaw(row: BossRow) {
        frostclaw = bossState(row);
      },
      upsertFrostclawResult(row: BossResultRow) {
        frostclawResult = bossResult(row);
        dependencies.notify();
      },
      upsertMagmalisk(row: BossRow) {
        magmalisk = bossState(row);
      },
      upsertMagmaliskResult(row: BossResultRow) {
        magmaliskResult = bossResult(row);
        dependencies.notify();
      },
      upsertGloomroot(row: BossRow) {
        gloomroot = bossState(row);
      },
      upsertGloomrootResult(row: BossResultRow) {
        gloomrootResult = bossResult(row);
        dependencies.notify();
      },
      upsertTidewyrm(row: BossRow) {
        tidewyrm = bossState(row);
      },
      upsertTidewyrmResult(row: BossResultRow) {
        tidewyrmResult = bossResult(row);
        dependencies.notify();
      },
      upsertKoiShogun(row: BossRow) {
        koiShogun = bossState(row);
      },
      upsertKoiShogunResult(row: BossResultRow) {
        koiShogunResult = bossResult(row);
        dependencies.notify();
      },
      upsertTempestKirin(row: BossRow) {
        tempestKirin = bossState(row);
      },
      upsertTempestKirinResult(row: BossResultRow) {
        tempestKirinResult = bossResult(row);
        dependencies.notify();
      },
      upsertMiremaw(row: BossRow) {
        miremaw = bossState(row);
      },
      upsertPrismshell(row: BossRow) {
        prismshell = bossState(row);
      },
      upsertMiremawResult(row: BossResultRow) {
        miremawResult = bossResult(row);
        dependencies.notify();
      },
      upsertPrismshellResult(row: BossResultRow) {
        prismshellResult = bossResult(row);
        dependencies.notify();
      },
    },
    api: {
      dragonBoss: () => dragon ? { ...dragon } : null,
      dragonResult: () => copyResult(dragonResult),
      spiderBoss: () => spider ? { ...spider } : null,
      spiderResult: () => copyResult(spiderResult),
      frostclawBoss: () => frostclaw ? { ...frostclaw } : null,
      frostclawResult: () => copyResult(frostclawResult),
      magmaliskBoss: () => magmalisk ? { ...magmalisk } : null,
      magmaliskResult: () => copyResult(magmaliskResult),
      gloomrootBoss: () => gloomroot ? { ...gloomroot } : null,
      gloomrootResult: () => copyResult(gloomrootResult),
      tidewyrmBoss: () => tidewyrm ? { ...tidewyrm } : null,
      tidewyrmResult: () => copyResult(tidewyrmResult),
      koiShogunBoss: () => koiShogun ? { ...koiShogun } : null,
      koiShogunResult: () => copyResult(koiShogunResult),
      tempestKirinBoss: () => tempestKirin ? { ...tempestKirin } : null,
      tempestKirinResult: () => copyResult(tempestKirinResult),
      miremawBoss: () => miremaw ? { ...miremaw } : null,
      prismshellBoss: () => prismshell ? { ...prismshell } : null,
      miremawResult: () => copyResult(miremawResult),
      prismshellResult: () => copyResult(prismshellResult),
      damageDragon(hits = 1, x?: number, y?: number) {
        damage("dragon damage", (connection, count, px, py) => connection.reducers.damageDragonFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageSpider(hits = 1, x?: number, y?: number) {
        damage("spider damage", (connection, count, px, py) => connection.reducers.damageSpiderFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageFrostclaw(hits = 1, x?: number, y?: number) {
        damage("frostclaw damage", (connection, count, px, py) => connection.reducers.damageFrostclawFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageMagmalisk(hits = 1, x?: number, y?: number) {
        damage("magmalisk damage", (connection, count, px, py) => connection.reducers.damageMagmaliskFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageGloomroot(hits = 1, x?: number, y?: number) {
        damage("gloomroot damage", (connection, count, px, py) => connection.reducers.damageGloomrootFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageTidewyrm(hits = 1, x?: number, y?: number) {
        damage("tidewyrm damage", (connection, count, px, py) => connection.reducers.damageTidewyrmFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageKoiShogun(hits = 1, x?: number, y?: number) {
        damage("Koi Shogun damage", (connection, count, px, py) => connection.reducers.damageKoiShogunFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageTempestKirin(hits = 1, x?: number, y?: number) {
        damage("Tempest Kirin damage", (connection, count, px, py) => connection.reducers.damageTempestKirinFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damageMiremaw(hits = 1, x?: number, y?: number) {
        damage("Miremaw damage", (connection, count, px, py) => connection.reducers.damageMiremawFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
      damagePrismshell(hits = 1, x?: number, y?: number) {
        damage("Prismshell damage", (connection, count, px, py) => connection.reducers.damagePrismshellFromPosition({ hits: count, x: px, y: py }), hits, x, y);
      },
    },
    resetSession() {
      dragon = null;
      dragonResult = null;
      spider = null;
      spiderResult = null;
      frostclaw = null;
      frostclawResult = null;
      magmalisk = null;
      magmaliskResult = null;
      gloomroot = null;
      gloomrootResult = null;
      tidewyrm = null;
      tidewyrmResult = null;
      koiShogun = null;
      koiShogunResult = null;
      tempestKirin = null;
      tempestKirinResult = null;
      miremaw = null;
      prismshell = null;
      miremawResult = null;
      prismshellResult = null;
    },
  };
}
