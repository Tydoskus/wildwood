import { tables, type DbConnection } from "../../module_bindings";
import { WEAPON_SCHOOLS, isWeaponSchool, type WeaponSchool } from "../../../shared/weapon-mastery";

const noPoints = (): Record<WeaponSchool, bigint> => Object.fromEntries(WEAPON_SCHOOLS.map(school => [school, 0n])) as Record<WeaponSchool, bigint>;

/** This account's Weapon Mastery points by school (player_weapon_mastery, its own rows); a school with no row has none. */
export function createWeaponMasteryRows(notify: () => void) {
  let points = noPoints();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    points = noPoints();
    const read = () => {
      if (!isCurrent()) return;
      const next = noPoints();
      for (const row of connection.db.playerWeaponMastery.iter()) if (row.identity.isEqual(me) && isWeaponSchool(row.school)) next[row.school] = row.points;
      points = next;
      notify();
    };
    const me = connection.identity!;
    connection.db.playerWeaponMastery.onInsert(read); connection.db.playerWeaponMastery.onUpdate(read); connection.db.playerWeaponMastery.onDelete(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.playerWeaponMastery.where(row => row.identity.eq(me))]);
  }

  return {
    watch,
    api: {
      weaponMastery: (): Readonly<Record<WeaponSchool, bigint>> => points,
    },
  };
}
