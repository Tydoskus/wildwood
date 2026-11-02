import { tables, type DbConnection } from "../../module_bindings";
import { WEAPON_SCHOOLS, isWeaponSchool, type WeaponSchool } from "../../../shared/weapon-mastery";
import { watchTables } from "./table-watch";

const noPoints = (): Record<WeaponSchool, bigint> => Object.fromEntries(WEAPON_SCHOOLS.map(school => [school, 0n])) as Record<WeaponSchool, bigint>;

/** This account's Weapon Mastery points by school (player_weapon_mastery, its own rows); a school with no row has none. */
export function createWeaponMasteryRows(notify: () => void) {
  let points = noPoints();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    points = noPoints();
    const read = () => {
      const next = noPoints();
      for (const row of connection.db.playerWeaponMastery.iter()) if (row.identity.isEqual(me) && isWeaponSchool(row.school)) next[row.school] = row.points;
      points = next;
      notify();
    };
    const me = connection.identity!;
    watchTables(connection, {
      what: "weapon mastery", isCurrent, listen: [connection.db.playerWeaponMastery],
      queries: [tables.playerWeaponMastery.where(row => row.identity.eq(me))], read,
    });
  }

  return {
    watch,
    api: {
      weaponMastery: (): Readonly<Record<WeaponSchool, bigint>> => points,
    },
  };
}
