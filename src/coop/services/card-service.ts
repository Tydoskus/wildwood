import { tables, type DbConnection } from "../../module_bindings";
import { cardDefinition, type CardSlot } from "../../../shared/cards";
import { NO_ACTIVE_CARDS, activeCardsOfRow, type ActiveCards } from "../../../shared/active-cards";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { onTableChange, subscribeTables } from "./table-watch";

export type CardDrop = { cardIds: readonly string[]; sequence: bigint };
export type CardResult = { ok: boolean; error?: string };

type Target = { connection: DbConnection; isCurrent: () => boolean };

/** This account's cards, its active cards and new card finds, from the my_* card views; and switching cards on and off. */
export function createCardRows(notify: () => void) {
  let target: Target | null = null;
  let counts: Record<string, number> = {};
  let active: ActiveCards = NO_ACTIVE_CARDS;
  let drop: CardDrop | null = null;
  let dropListener: ((drop: CardDrop) => void) | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    counts = {};
    active = NO_ACTIVE_CARDS;
    drop = null;
    // The standing row on connect is an old find, not one to announce.
    let hydrated = false;
    const readCards = () => {
      const next: Record<string, number> = {};
      for (const row of connection.db.myCards.iter()) if (cardDefinition(row.cardId) && row.count > 0) next[row.cardId] = row.count;
      counts = next;
      notify();
    };
    const readActive = () => {
      active = activeCardsOfRow([...connection.db.myActiveCards.iter()][0]);
      notify();
    };
    const readDrop = () => {
      const [row] = [...connection.db.myCardDrop.iter()];
      const previous = drop;
      drop = row ? { cardIds: row.cardIds.filter(cardId => cardDefinition(cardId)), sequence: row.sequence } : null;
      notify();
      if (hydrated && drop && drop.sequence !== previous?.sequence && drop.cardIds.length) dropListener?.(drop);
    };
    onTableChange([connection.db.myCards], isCurrent, readCards);
    onTableChange([connection.db.myActiveCards], isCurrent, readActive);
    onTableChange([connection.db.myCardDrop], isCurrent, readDrop);
    subscribeTables(connection, "cards", isCurrent, [tables.myCards, tables.myActiveCards, tables.myCardDrop],
      () => { readCards(); readActive(); readDrop(); hydrated = true; });
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>): Promise<CardResult> {
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
    api: {
      /** Cards owned, by card id, active ones included; a card not owned is missing. */
      cards: (): Readonly<Record<string, number>> => counts,
      /** The chosen cards of each type in slot order, waiting ones past the slots in play included. */
      activeCards: (): ActiveCards => active,
      /** Called with each new find, not with the standing row on connect. */
      setOnCardDrop(callback: ((drop: CardDrop) => void) | null) { dropListener = callback; },
      /** `expectedActive` is how many copies the player saw active, so a retried tap switches on one. */
      activateCard: (cardId: string, expectedActive: number) =>
        call(connection => connection.reducers.activateCard({ cardId, expectedActive })),
      deactivateCard: (cardType: CardSlot, index: number, cardId: string) =>
        call(connection => connection.reducers.deactivateCard({ cardType, index, cardId })),
    },
  };
}
