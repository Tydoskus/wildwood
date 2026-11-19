import { tables, type DbConnection } from "../../module_bindings";
import {
  NO_FOOD_BUFF, foodBuffFactors, type ActiveFoodBuff, type CookedFishId, type FoodBuffFactors,
} from "../../../shared/cooking";
import { ALL_CRAFT_SKILLS, isPlayerCraftSkill, type PlayerCraftSkill } from "../../../shared/crafting";
import { fishById, type FishId } from "../../../shared/fishing";
import { craftMaterialsKey, gradeCraftMaterials } from "../../../shared/grade-craft";
import { reducerErrorMessage } from "./reducer-errors";
import { withRequestDeadline } from "./request-deadline";
import { watchTables } from "./table-watch";

export type CraftResult = { ok: boolean; error?: string };
type Target = { connection: DbConnection; isCurrent: () => boolean };

const noExperience = (): Record<PlayerCraftSkill, bigint> => Object.fromEntries(ALL_CRAFT_SKILLS.map(skill => [skill, 0n])) as Record<PlayerCraftSkill, bigint>;

/** This account's craft experience (my_craft_skills), active food buff (my_food_buff), cooking, eating, selling cooked fish, crafting and reforging. */
export function createCraftingRows(notify: () => void) {
  let target: Target | null = null;
  let experience = noExperience();
  let foodBuff: ActiveFoodBuff | null = null;

  function watch(connection: DbConnection, isCurrent: () => boolean) {
    target = { connection, isCurrent };
    experience = noExperience();
    foodBuff = null;
    const read = () => {
      const next = noExperience();
      for (const row of connection.db.myCraftSkills.iter()) if (isPlayerCraftSkill(row.skill)) next[row.skill] = row.experience;
      experience = next;
      notify();
    };
    const readFood = () => {
      const row = [...connection.db.myFoodBuff.iter()][0];
      foodBuff = row && fishById(row.fishId) ? { fishId: row.fishId as FishId, endsAtMs: row.endsAtMs } : null;
      notify();
    };
    watchTables(connection, { what: "craft skills", isCurrent, listen: [connection.db.myCraftSkills], queries: [tables.myCraftSkills], read });
    watchTables(connection, { what: "food buff", isCurrent, listen: [connection.db.myFoodBuff], queries: [tables.myFoodBuff], read: readFood });
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
      async cookFish(fishId: string, recipeId: string, begin = false): Promise<CraftResult> {
        const current = target;
        if (!current?.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
        try {
          const reducers = current.connection.reducers;
          await withRequestDeadline(begin ? reducers.beginCooking({ fishId, recipeId }) : reducers.cookFish({ fishId, recipeId }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: reducerErrorMessage(error) };
        }
      },
      async eatFish(fishId: FishId): Promise<CraftResult> {
        const current = target;
        if (!current?.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
        try {
          await withRequestDeadline(current.connection.reducers.eatFish({ fishId }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: reducerErrorMessage(error) };
        }
      },
      async sellCookedFish(oreId: CookedFishId, count: number): Promise<CraftResult> {
        const current = target;
        if (!current?.isCurrent() || !current.connection.isActive) return { ok: false, error: "NOT CONNECTED" };
        try {
          await withRequestDeadline(current.connection.reducers.sellCookedFish({ oreId, count }));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: reducerErrorMessage(error) };
        }
      },
      activeFoodBuff: (): ActiveFoodBuff | null => foodBuff && foodBuff.endsAtMs > Date.now() ? foodBuff : null,
      activeFoodBuffFactors: (): FoodBuffFactors => foodBuff ? foodBuffFactors(foodBuff, Date.now()) : NO_FOOD_BUFF,
      craftSkills: (): Readonly<Record<PlayerCraftSkill, bigint>> => experience,
      /** A new graded piece crafted at the Smith, even one already held. */
      craftGradeItem: (itemId: string) => send(itemId, (connection, expectedMaterials) => connection.reducers.craftGradeItem({ itemId, expectedMaterials })),
      /** One held weapon copy reforged (copy id 0 is the first copy). */
      reforgeWeapon: (itemId: string, copyId: bigint) =>
        send(itemId, (connection, expectedMaterials) => connection.reducers.reforgeWeapon({ itemId, copyId, expectedMaterials })),
    },
  };
}
