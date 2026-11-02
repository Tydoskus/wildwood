import { tables, type DbConnection } from "../../module_bindings";
import { miningGain, miningNode, miningYield, normalizeMining } from "../../../shared/mining";
import type { OreId } from "../../../shared/refine";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { createGatherQueue, createReportGains, gatherExtras, type GatherClock } from "./gather-queue";
import { reducerEventMs } from "./reducer-event-time";
import { boostedYield } from "../../../shared/server-boost";
import { onTableChange, subscribeTables } from "./table-watch";

export type MiningResult = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };
type Ores = Partial<Record<OreId, number>>;
const toMs = (at: { microsSinceUnixEpoch: bigint }) => Number(at.microsSinceUnixEpoch / 1000n);
const U32 = 4_294_967_296;
/** What a break at this server time gives times: the Server Boost (shared/server-boost.ts). */
type BoostAt = (atMs: number) => number;

/** "2 rocks stand again: those breaks were not counted.": breaks the server did not take. */
export const miningRejectedText = (count: number) =>
  count === 1 ? "A rock stands again: that break was not counted." : `${count} rocks stand again: those breaks were not counted.`;

/**
 * What breaks show at once, before cards, luck and the pickaxe's bonus, which the server rolls: each rock's ore,
 * and a Mysterious rock's Starshard.
 */
function shownOres(claims: readonly { id: number; atMs: number }[], boostAt: BoostAt) {
  const ores: Ores = {};
  for (const claim of claims) {
    const node = miningNode(claim.id);
    if (!node) continue;
    const gives = boostedYield(miningYield(node, 1), boostAt(claim.atMs));
    for (const [oreId, count] of Object.entries(gives)) ores[oreId as OreId] = (ores[oreId as OreId] ?? 0) + (count ?? 0);
  }
  return ores;
}

/**
 * This account's mining, from the caller-scoped my_mining and my_mined_nodes views: the Mining stat and when each of
 * the player's bare rocks was broken. Rocks break here at once and go to the server in batches (report_mining, through
 * gather-queue.ts); until it answers, the Mining, the bare rocks and the ores read here include them, as the shared
 * rules give them. A break the server does not take drops out, and its rock stands again.
 */
export function createMiningRows(notify: () => void, clock?: GatherClock, boostAt: BoostAt = () => 1) {
  let target: Target | null = null;
  let mining = 0, rocksBroken = 0;
  let broken = new Map<number, number>();
  /** Breaks not answered yet: when each rock broke, and the Mining and ore they add. */
  let local = { broken: new Map<number, number>(), gain: 0, ores: {} as Ores };
  /** Breaks the server answered since connecting, and how many of them it was told did not count. */
  let counted = { base: 0, sent: 0, reported: 0 };
  let rejectedListener: ((text: string) => void) | null = null;
  let extraListener: ((ores: Ores) => void) | null = null;
  /** What each report really gave, against what was shown at its breaks. */
  const gains = createReportGains(), reports = new WeakMap<readonly unknown[], object>();

  const queue = createGatherQueue({
    clock,
    send(claims) {
      const current = target;
      if (!current || !current.isCurrent() || !current.connection.isActive) return null;
      const args = gains.track({ breaks: claims.map(claim => ({ nodeId: claim.id, atMs: BigInt(Math.round(claim.atMs)) })) });
      reports.set(claims, args);
      return current.connection.reducers.reportMining(args);
    },
    settled(claims, error) {
      const gained = gains.take(reports.get(claims));
      if (error) { rejectedListener?.(error); return; }
      // The server's own rolls beyond what each break showed: bonus Starshards, Ore Find, the pickaxe's extra ore.
      const extra = gained ? gatherExtras(gained, shownOres(claims, boostAt)) : {};
      if (Object.keys(extra).length) extraListener?.(extra);
      // Each break taken counts up rocksBroken, and its row arrives before the reply.
      counted.sent += claims.length;
      const rejected = counted.sent - (rocksBroken - counted.base + U32) % U32;
      if (rejected > counted.reported) rejectedListener?.(miningRejectedText(rejected - counted.reported));
      counted.reported = Math.max(counted.reported, rejected);
    },
    changed() {
      const pending = queue.pending(), next = { broken: new Map<number, number>(), gain: 0, ores: shownOres(pending, boostAt) };
      for (const claim of pending) {
        const node = miningNode(claim.id);
        if (!node) continue;
        next.broken.set(node.id, Math.max(next.broken.get(node.id) ?? -Infinity, claim.atMs));
        next.gain += miningGain(node);
      }
      local = next;
      notify();
    },
  });

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    queue.clear();
    target = { connection, isCurrent };
    mining = 0; rocksBroken = 0; broken = new Map();
    // A report's reply carries the server's time, which the next report's times are read against.
    const readMining = (ctx?: unknown) => {
      const serverAt = reducerEventMs(ctx);
      if (serverAt !== null) clock?.observeServerTime?.(serverAt);
      const [row] = [...connection.db.myMining.iter()];
      mining = normalizeMining(row?.mining);
      rocksBroken = row?.rocksBroken ?? 0;
      notify();
    };
    const readBroken = () => {
      const next = new Map<number, number>();
      for (const row of connection.db.myMinedNodes.iter()) next.set(row.nodeId, toMs(row.brokenAt));
      broken = next;
      notify();
    };
    onTableChange([connection.db.myMining], isCurrent, readMining);
    gains.watch(connection.db.myOres);
    onTableChange([connection.db.myMinedNodes], isCurrent, readBroken);
    subscribeTables(connection, "mining", isCurrent, [tables.myMining, tables.myMinedNodes],
      () => { readMining(); readBroken(); counted = { base: rocksBroken, sent: 0, reported: 0 }; });
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>): Promise<MiningResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await withRequestDeadline(send(current.connection));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    /** Ore from breaks the server has not answered yet, to add to the bag's. */
    pendingOres: (): Readonly<Ores> => local.ores,
    api: {
      /** The Mining stat, with breaks not answered yet: 0 before the first rock. */
      mining: () => mining + local.gain,
      /** When the player last broke this rock, in epoch ms, here or on the server's list; null when neither has it. */
      minedNodeAt: (nodeId: number): number | null => {
        const server = broken.get(nodeId), here = local.broken.get(nodeId);
        return server === undefined ? here ?? null : here === undefined ? server : Math.max(server, here);
      },
      /** A rock broken here at `atMs` (the server's clock), for the next report. */
      queueMiningBreak: (nodeId: number, atMs: number) => queue.add({ id: nodeId, atMs }),
      /** Sends the breaks waiting now, ahead of anything that reads ores on the server. */
      flushMining: () => queue.flush(),
      /** Told when breaks did not count, or a report failed. */
      setOnMiningRejected(callback: ((text: string) => void) | null) { rejectedListener = callback; },
      /** Told what a report gave beyond what its breaks showed. */
      setOnMiningExtra(callback: ((ores: Ores) => void) | null) { extraListener = callback; },
      /** A graded piece from the Smith for gold, at the price the player saw. */
      buyGradeGear: (itemId: string, expectedPrice: number) =>
        call(connection => connection.reducers.buyGradeGear({ itemId, expectedPrice: BigInt(expectedPrice) })),
    },
  };
}
