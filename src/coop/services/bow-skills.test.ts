import { expect, it, vi } from "vitest";
import { createBowSkills } from "./bow-skills";

type Row = { itemId: string; arrowStorm: number; ricochet: number; piercingShot: number };

function fakeConnection(rows: Row[] = []) {
  const handlers: Array<() => void> = [];
  let applied: (() => void) | null = null;
  const subscribe = vi.fn();
  const view = (source: () => Iterable<unknown>) => ({
    iter: () => source()[Symbol.iterator](),
    onInsert: (handler: () => void) => handlers.push(handler),
    onUpdate: (handler: () => void) => handlers.push(handler),
    onDelete: (handler: () => void) => handlers.push(handler),
  });
  // The service also carries kept copies and duplicate offers on the same connection.
  const connection = {
    db: { myBowSkills: view(() => rows), myEquipmentCopies: view(() => []), myEquipmentOffers: view(() => []) },
    subscriptionBuilder: () => ({ onApplied(callback: () => void) { applied = callback; return this; }, subscribe }),
  };
  return { connection: connection as never, rows, subscribe, settle: () => applied?.(), fire: () => handlers.forEach(handler => handler()) };
}

it("serves this account's roll for each bow once the view settles, and follows changes", () => {
  const notify = vi.fn();
  const skills = createBowSkills(notify);
  const conn = fakeConnection([{ itemId: "iron_bow", arrowStorm: 2.4, ricochet: 0, piercingShot: 0 }]);
  skills.watch(conn.connection, () => true);
  expect(conn.subscribe).toHaveBeenCalledTimes(2);
  expect(skills.bowSkills("iron_bow")).toBeNull();
  conn.settle();
  expect(skills.bowSkills("iron_bow")).toEqual({ arrowStorm: 2.4, ricochet: 0, piercingShot: 0 });
  expect(skills.bowSkills("night_bow")).toBeNull();
  expect(skills.bowSkills("")).toBeNull();
  conn.rows.push({ itemId: "night_bow", arrowStorm: 0, ricochet: 5.1, piercingShot: 0 });
  conn.fire();
  expect(skills.bowSkills("night_bow")).toEqual({ arrowStorm: 0, ricochet: 5.1, piercingShot: 0 });
  expect(notify).toHaveBeenCalled();
});

it("ignores a replaced connection and starts clean on a new one", () => {
  const skills = createBowSkills(() => {});
  let current = true;
  const first = fakeConnection([{ itemId: "iron_bow", arrowStorm: 2, ricochet: 0, piercingShot: 0 }]);
  skills.watch(first.connection, () => current);
  first.settle();
  current = false;
  skills.watch(fakeConnection().connection, () => true);
  first.fire();
  expect(skills.bowSkills("iron_bow")).toBeNull();
});
