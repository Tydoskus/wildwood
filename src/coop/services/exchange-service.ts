import { tables, type DbConnection } from "../../module_bindings";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { onTableChange, subscribeTables } from "./table-watch";

export type ExchangeResult = { ok: boolean; error?: string };
export type ExchangeOfferRow = { id: bigint; identity: string; name: string; nameColor: number; buy: boolean; itemId: string; price: bigint; quantity: number; filled: number; placedAtMs: number };
export type ExchangeListingRow = { id: bigint; identity: string; name: string; nameColor: number; itemId: string; rollJson: string; refine: number; price: bigint; listedAtMs: number };
export type ExchangePriceRow = { itemId: string; lowestAsk: bigint | null; highestBid: bigint | null; forSale: number; lastPrice: bigint | null };
export type ExchangeCollectRow = { id: bigint; itemId: string; count: number; rollJson: string; refine: number };

type Target = { connection: DbConnection; isCurrent: () => boolean };
type Handle = { unsubscribe: () => void };
type Stamp = { microsSinceUnixEpoch: bigint };
const ms = (stamp: Stamp) => Number(stamp.microsSinceUnixEpoch / 1000n);
const orNull = (value: bigint) => value > 0n ? value : null;
/** The most items whose sellers one screen follows at once. */
export const EXCHANGE_WATCHED_ITEMS = 8;

type Seller = { id: bigint; identity: { toHexString(): string }; name: string; nameColor: number; itemId: string; price: bigint };
const offerRow = (row: Seller & { buy: boolean; quantity: number; filled: number; placedAt: Stamp }): ExchangeOfferRow => ({
  id: row.id, identity: row.identity.toHexString(), name: row.name, nameColor: row.nameColor, buy: row.buy, itemId: row.itemId,
  price: row.price, quantity: row.quantity, filled: row.filled, placedAtMs: ms(row.placedAt),
});
const listingRow = (row: Seller & { rollJson: string; refine: number; listedAt: Stamp }): ExchangeListingRow => ({
  id: row.id, identity: row.identity.toHexString(), name: row.name, nameColor: row.nameColor, itemId: row.itemId,
  rollJson: row.rollJson, refine: row.refine, price: row.price, listedAtMs: ms(row.listedAt),
});

/**
 * The Trade Chrysanthemum, sized to stay small however big the market gets: the player's own offers, listings and
 * collection box always (their my_ views); while the window is open, the price table (a row per item); and the
 * sellers of only the few items on screen, never the whole market.
 */
export function createExchangeRows(notify: () => void) {
  let target: Target | null = null;
  let prices: Handle | null = null, items: Handle | null = null, watchedKey = "";

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    prices = null; items = null; watchedKey = "";
    onTableChange([connection.db.myExchangeCollect, connection.db.myExchangeOffers, connection.db.myExchangeListings,
      connection.db.exchangePrice, connection.db.exchangeOffer, connection.db.exchangeListing], isCurrent, () => notify());
    subscribeTables(connection, "exchange", isCurrent, [tables.myExchangeCollect, tables.myExchangeOffers, tables.myExchangeListings], notify);
  }

  async function call(send: (connection: DbConnection) => Promise<unknown>): Promise<ExchangeResult> {
    const current = target;
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    try {
      await withRequestDeadline(send(current.connection));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }
  const live = () => (target?.isCurrent() ? target.connection : null);

  return {
    watch,
    api: {
      /** Follows the price table while the window is open; false stops it and the sellers with it. */
      followExchange(on: boolean) {
        const connection = live();
        if (!on || !connection) { prices?.unsubscribe(); prices = null; items?.unsubscribe(); items = null; watchedKey = ""; return; }
        prices ??= subscribeTables(connection, "exchange prices", target!.isCurrent, [tables.exchangePrice], notify);
      },
      /** Follows the sellers of these items only (a search's matches, or the item opened), replacing the last set. */
      watchExchangeItems(itemIds: readonly string[]) {
        const connection = live();
        const ids = [...new Set(itemIds)].slice(0, EXCHANGE_WATCHED_ITEMS).sort(), key = ids.join(",");
        if (!connection || key === watchedKey) return;
        items?.unsubscribe(); items = null; watchedKey = key;
        if (!ids.length) return;
        items = subscribeTables(connection, "exchange items", target!.isCurrent, ids.flatMap(id => [
          tables.exchangeOffer.where(row => row.itemId.eq(id)), tables.exchangeListing.where(row => row.itemId.eq(id)),
        ]), notify);
      },
      exchangePrices: (): ExchangePriceRow[] => [...(live()?.db.exchangePrice.iter() ?? [])].map(row => ({
        itemId: row.itemId, lowestAsk: orNull(row.lowestAsk), highestBid: orNull(row.highestBid), forSale: row.forSale, lastPrice: orNull(row.lastPrice),
      })),
      /** The followed items' offers and listings. */
      exchangeOffers: (): ExchangeOfferRow[] => [...(live()?.db.exchangeOffer.iter() ?? [])].map(offerRow),
      exchangeListings: (): ExchangeListingRow[] => [...(live()?.db.exchangeListing.iter() ?? [])].map(listingRow),
      myExchangeOffers: (): ExchangeOfferRow[] => [...(live()?.db.myExchangeOffers.iter() ?? [])].map(offerRow),
      myExchangeListings: (): ExchangeListingRow[] => [...(live()?.db.myExchangeListings.iter() ?? [])].map(listingRow),
      exchangeCollect: (): ExchangeCollectRow[] => [...(live()?.db.myExchangeCollect.iter() ?? [])].map(row => ({
        id: row.id, itemId: row.itemId, count: row.count, rollJson: row.rollJson, refine: row.refine,
      })),
      placeExchangeOffer: (buy: boolean, itemId: string, quantity: number, price: bigint) =>
        call(connection => connection.reducers.placeExchangeOffer({ buy, itemId, quantity, price })),
      cancelExchangeOffer: (id: bigint) => call(connection => connection.reducers.cancelExchangeOffer({ id })),
      listExchangeGear: (itemId: string, copyId: bigint, price: bigint) => call(connection => connection.reducers.listExchangeGear({ itemId, copyId, price })),
      buyExchangeGear: (id: bigint) => call(connection => connection.reducers.buyExchangeGear({ id })),
      cancelExchangeListing: (id: bigint) => call(connection => connection.reducers.cancelExchangeListing({ id })),
      collectExchange: () => call(connection => connection.reducers.collectExchange({})),
    },
  };
}
