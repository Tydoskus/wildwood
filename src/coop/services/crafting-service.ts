import { tables, type DbConnection } from "../../module_bindings";
import { CRAFT_SKILLS, type CraftSkill } from "../../../shared/crafting";
import { craftMaterialsKey, gradeCraftMaterials } from "../../../shared/grade-craft";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

export type CraftResult = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };

const noExperience = (): Record<CraftSkill, bigint> => Object.fromEntries(CRAFT_SKILLS.map(skill => [skill, 0n])) as Record<CraftSkill, bigint>;
const isCraftSkill = (value: unknown): value is CraftSkill => (CRAFT_SKILLS as readonly unknown[]).includes(value);

/** This account's craft experience by craft (my_craft_skills), crafting (craft_grade_item) and reforging (reforge_weapon); the server judges each. */
export function createCraftingRows(notify: () => void) {
  let target: Target | null = null;
  let experience = noExperience();

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    experience = noExperience();
    const read = () => {
      const next = noExperience();
      for (const row of connection.db.myCraftSkills.iter()) if (isCraftSkill(row.skill)) next[row.skill] = row.experience;
      experience = next;
      notify();
    };
    watchTables(connection, { what: "craft skills", isCurrent, listen: [connection.db.myCraftSkills], queries: [tables.myCraftSkills], read });
  }

  /** Sends a craft or a Reforge with the recipe this client shows, so a changed one is refused rather than charged. */
  async function send(itemId: string, call: (connection: DbConnection, expectedMaterials: string) => Promise<unknown>): Promise<CraftResult> {
    const current = target, materials = gradeCraftMaterials(itemId);
    if (!current || !current.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
    if (!materials) return { ok: false, error: "That cannot be crafted." };
    try {
      await withRequestDeadline(call(current.connection, craftMaterialsKey(materials)));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: reducerErrorMessage(error) };
    }
  }

  return {
    watch,
    api: {
      craftSkills: (): Readonly<Record<CraftSkill, bigint>> => experience,
      /** A new graded piece crafted at the Smith, even one already held. */
      craftGradeItem: (itemId: string) => send(itemId, (connection, expectedMaterials) => connection.reducers.craftGradeItem({ itemId, expectedMaterials })),
      /** One held weapon copy reforged (copy id 0 is the first copy). */
      reforgeWeapon: (itemId: string, copyId: bigint) =>
        send(itemId, (connection, expectedMaterials) => connection.reducers.reforgeWeapon({ itemId, copyId, expectedMaterials })),
    },
  };
}
