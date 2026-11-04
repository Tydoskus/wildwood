import { DOM_SCENES } from "./scenes-dom";
import { WORLD_SCENES } from "./scenes-world";
import { combatHits } from "./scenes-combat";
import { exchange, fishing, forest, grove, town, townGrid, world } from "./scenes-map";
import { exchangeClose } from "./scenes-exchange-close";
import { bosses } from "./scenes-bosses";
import { endlessBosses } from "./scenes-endless";
import { guildBattlefield } from "./scenes-guild";
import { perf } from "./scenes-perf";
import { marketSprites } from "./scenes-market-sprites";
import { marketBake } from "./scenes-market-bake";

/** Every scene, by its URL hash. capture.mjs reads the list from the page. */
export const SCENES: Record<string, () => Promise<void>> = { ...WORLD_SCENES, "combat-hits": combatHits, world, town, "town-grid": townGrid, grove, fishing, exchange, "exchange-close": exchangeClose, "market-sprites": marketSprites, "market-bake": marketBake, forest, bosses, "endless-bosses": endlessBosses, "guild-battlefield": guildBattlefield, perf, ...DOM_SCENES };
