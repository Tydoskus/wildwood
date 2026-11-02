import { table, t } from "spacetimedb/server";

/**
 * A kill report keeps what it works out from a player's research, perks, cards, gear levels and skill rolls,
 * and uses it again while this stamp is unchanged. Every reducer bumps its sender's stamp unless it is marked
 * with keepsCombatProfile, so a reducer nobody thought about can only cost a recompute, never a stale bound.
 */
export const playerCombatStamp = table({ name: "player_combat_stamp", public: false }, {
  identity: t.identity().primaryKey(),
  version: t.u32(),
});

/** One row: bumped when developer tools or a migration may have changed anyone's rows. */
export const combatStampEpoch = table({ name: "combat_stamp_epoch", public: false }, {
  id: t.u8().primaryKey(),
  version: t.u32(),
});

type Ctx = any;
const nextVersion = (version: number | undefined) => ((version ?? 0) + 1) >>> 0;

/** No row is no kept profile: the row is made when one is first built, so erasing an account never leaves one behind. */
export function touchCombatProfile(ctx: Ctx, identity: any) {
  const row = ctx.db.playerCombatStamp.identity.find(identity);
  if (row) ctx.db.playerCombatStamp.identity.update({ identity, version: nextVersion(row.version) });
}

export function touchAllCombatProfiles(ctx: Ctx) {
  const row = ctx.db.combatStampEpoch.id.find(0);
  if (row) ctx.db.combatStampEpoch.id.update({ id: 0, version: nextVersion(row.version) });
  else ctx.db.combatStampEpoch.insert({ id: 0, version: 1 });
}

const KEEPS = new WeakSet<Function>();
/** Marks a reducer that never writes what a combat profile reads, or bumps the stamp itself when it does. */
export function keepsCombatProfile<F extends Function>(fn: F): F {
  KEEPS.add(fn);
  return fn;
}

/** Every reducer declared after this bumps its sender's stamp once its body has run, unless marked. */
export function touchCombatProfileAfterReducers(spacetimedb: any) {
  const declare = spacetimedb.reducer.bind(spacetimedb);
  spacetimedb.reducer = (...args: any[]) => {
    const fn = args[args.length - 1];
    if (!KEEPS.has(fn)) args[args.length - 1] = (ctx: Ctx, params: any) => {
      const result = fn(ctx, params);
      touchCombatProfile(ctx, ctx.sender);
      return result;
    };
    return declare(...args);
  };
}

// A profile is also rebuilt after this long, in case something changed a row without a stamp.
const PROFILE_MAX_AGE_MICROS = 10n * 60n * 1_000_000n;
const PROFILE_MEMO_SIZE = 4096;

/** Kept profiles, one map per database handle: the host keeps one per module, and each test world has its own. */
export function createCombatProfiles<P>() {
  const kept = new WeakMap<object, Map<string, { stamp: string; builtAt: bigint; profile: P }>>();
  const keptIn = (ctx: Ctx) => {
    let profiles = kept.get(ctx.db);
    if (!profiles) kept.set(ctx.db, profiles = new Map());
    return profiles;
  };
  return {
    /** This player's kept profile while their stamp holds, otherwise a fresh one from `build`. */
    profileFor(ctx: Ctx, identity: any, build: () => P): { profile: P; fresh: boolean } {
      let own = ctx.db.playerCombatStamp.identity.find(identity)?.version;
      // A new row starts a new profile: one kept from a transaction that rolled the row back would match it.
      const made = own === undefined;
      if (made) ctx.db.playerCombatStamp.insert({ identity, version: own = 1 });
      const stamp = `${ctx.db.combatStampEpoch.id.find(0)?.version ?? 0}:${own}`;
      const key = identity.toHexString(), profiles = keptIn(ctx);
      const now = ctx.timestamp.microsSinceUnixEpoch;
      const held = profiles.get(key);
      if (held && !made && held.stamp === stamp && now >= held.builtAt && now - held.builtAt < PROFILE_MAX_AGE_MICROS) return { profile: held.profile, fresh: false };
      const profile = build();
      profiles.delete(key);
      profiles.set(key, { stamp, builtAt: now, profile });
      if (profiles.size > PROFILE_MEMO_SIZE) profiles.delete(profiles.keys().next().value!);
      return { profile, fresh: true };
    },
    /** Drops this player's kept profile: one built from writes this transaction may still roll back. */
    forget(ctx: Ctx, identity: any) {
      keptIn(ctx).delete(identity.toHexString());
    },
  };
}
