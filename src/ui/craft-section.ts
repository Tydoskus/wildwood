import { itemDisplayName, itemStats } from "../../shared/items";
import { CRAFTED_REFINE, CRAFT_MAX_LEVEL, CRAFT_SKILLS, CRAFT_SKILL_NAMES, MATERIAL_NAMES, type CraftSkill } from "../../shared/crafting";
import {
  craftMaterialsShort, craftProgress, gradeCraftLevel, gradeCraftMaterials, gradeCraftNeed, gradeCraftOffer, gradeCraftSkill, isCraftable, lineCraftSkill,
} from "../../shared/grade-craft";
import { isSkillWeapon, weaponRollLines, type WeaponSkillRoll } from "../../shared/weapon-skills";
import { ARMOR_CLASS_DETAILS, ARMOR_CLASS_NAMES, BOOT_STYLE_NAMES, GEAR_GRADES, GEAR_GRADE_NAMES, gradeIndex, type GearGrade } from "../../shared/gear-grades";
import { armorClassOf, bootStyleOf, gradeEquipmentKindOf, gradeOf, type GradeItemId } from "../../shared/grade-equipment";
import { GRADE_SHOP_LINES, gradeShopItemId, gradeShopLineKey, masteryLevels, type GradeShopLine, type MasteryLevels } from "../../shared/grade-shop";
import { bagSlotsWithOres } from "../../shared/ore-bag";
import { bagSlotCapacity } from "../../shared/gems";
import type { OreId } from "../../shared/refine";
import type { WeaponSchool } from "../../shared/weapon-mastery";
import { itemArtMarkup } from "../game/item-presentation";
import { itemInspectionButtonLabel, itemInspectionTitle } from "./item-inspection-controller";
import { formatEquipmentStat } from "./equipment-stat-format";
import { refineStars } from "./refine-badge";
import { oreIconSource } from "./ore-icon";
import { formatCompactNumber } from "./number-format";
import type { StationTile } from "./station-grid";
import { CRAFT_TOOL, toolCraftCost, type ToolId } from "../../shared/tools";
import { ARROW_IDS, ARROW_KINDS, isArrowId, type ArrowId } from "../../shared/arrows";

type Result = { ok: boolean; error?: string } | undefined;
type Ores = Readonly<Partial<Record<OreId, number>>>;
/** One thing a piece needs, met or not: "Lv 20 Archery". */
export type GradeNeed = { text: string; met: boolean };
const KIND_NAMES = { bow: "Bow", sword: "Sword", staff: "Staff", dagger: "Dagger", helmet: "Helmet", armor: "Armor", boots: "Boots" } as const;
const nameOf = (itemId: string) => itemInspectionButtonLabel(itemDisplayName(itemId));
const count = (value: number) => Math.floor(value).toLocaleString("en-US");
// Exact below 10,000, compact above, so three fit side by side on a phone.
const short = (value: number) => value < 10_000 ? count(value) : formatCompactNumber(value);
/** How many crafts one arrow craft makes at once; the server takes up to 50. */
const ARROW_CRAFTS: readonly number[] = [1, 10, 50];
const arrowKey = (arrowId: ArrowId) => `arrow:${arrowId}`;

/**
 * A graded piece's row as the Smith lists it: art, then its name on a line of its own, grade and
 * kind, stat and class perk, and what it needs. The caller fills the deal under it, one line per way to get it.
 */
export function gradeItemRow(itemId: GradeItemId, refine = 0, needs: readonly GradeNeed[] = []) {
  const row = document.createElement("article");
  row.className = "smith-shop-row";
  row.setAttribute("role", "listitem");
  row.dataset.itemId = itemId;
  const armorClass = armorClassOf(itemId), bootStyle = bootStyleOf(itemId), kind = KIND_NAMES[gradeEquipmentKindOf(itemId)!];
  const variant = armorClass ? ARMOR_CLASS_NAMES[armorClass] : bootStyle ? BOOT_STYLE_NAMES[bootStyle] : "";
  row.innerHTML = `<span class="smith-shop-art" aria-hidden="true">${itemArtMarkup(itemId)}</span>`
    + `<span class="smith-shop-copy"><strong></strong><span class="smith-shop-grade"></span><span class="smith-shop-stat"></span></span>`
    + `<div class="smith-shop-deal"></div>`;
  // The grade line below names the grade, so the title leaves it out.
  row.querySelector("strong")!.textContent = `${itemInspectionTitle(itemId)} ${refineStars(refine)}`.trim();
  row.querySelector(".smith-shop-grade")!.textContent = `${GEAR_GRADE_NAMES[gradeOf(itemId)!]} · ${variant ? `${variant} ${kind}` : kind}`;
  const [stat] = itemStats(itemId, refine ? { tier: 0, refine } : 0);
  row.querySelector(".smith-shop-stat")!.textContent = [formatEquipmentStat(itemInspectionButtonLabel(stat ?? "")), armorClass ? ARMOR_CLASS_DETAILS[armorClass].perk : ""]
    .filter(Boolean).join(" · ");
  if (needs.length) {
    // Unmet needs stand out; met ones step back.
    const line = document.createElement("span");
    line.className = "craft-needs";
    needs.forEach((need, index) => {
      if (index) line.append(" · ");
      const part = document.createElement("span");
      part.className = need.met ? "is-met" : "is-unmet";
      part.textContent = need.text;
      line.append(part);
    });
    row.querySelector(".smith-shop-copy")!.append(line);
  }
  return { row, deal: row.querySelector<HTMLElement>(".smith-shop-deal")! };
}

/** Steps through the open grades, lowest to best; two buttons big enough for a thumb. Shared by Buy and Craft rows. */
export function gradeStepperElement(grades: readonly GearGrade[], grade: GearGrade,
  options: { label: string; busy: boolean; name?: string; onPick: (grade: GearGrade) => void }) {
  return stepperElement(grades, grade, { ...options, name: options.name ?? GEAR_GRADE_NAMES[grade], lower: "Lower Grade", higher: "Higher Grade" });
}

/** A ‹ value › stepper through a short list, in the grade stepper's look. */
function stepperElement<T>(steps: readonly T[], value: T,
  options: { label: string; busy: boolean; name: string; lower: string; higher: string; onPick: (value: T) => void }) {
  const group = document.createElement("span");
  group.className = "craft-grade";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", options.label);
  const at = steps.indexOf(value);
  const step = (by: number, symbol: string, label: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "craft-grade-step";
    button.textContent = symbol;
    button.setAttribute("aria-label", label);
    const to = steps[at + by];
    button.disabled = to === undefined || options.busy;
    button.addEventListener("click", () => { if (to !== undefined) options.onPick(to); });
    return button;
  };
  const name = document.createElement("span");
  name.className = "craft-grade-name";
  name.textContent = options.name;
  group.append(step(-1, "‹", options.lower), name, step(1, "›", options.higher));
  return group;
}

/** The top grade, already held: its row says Owned in place of a price. */
export function ownedRow(itemId: GradeItemId) {
  const made = gradeItemRow(itemId);
  const owned = document.createElement("span");
  owned.className = "smith-shop-owned";
  owned.textContent = "Owned";
  made.row.querySelector(".smith-shop-copy")!.append(owned);
  return made;
}

/** One way to get a piece: its terms (a price, materials) on the left, its button on the right. */
export function offerLine(terms: readonly Node[], button: HTMLButtonElement) {
  const line = document.createElement("div");
  line.className = "smith-offer";
  const left = document.createElement("span");
  left.className = "smith-offer-terms";
  left.append(...terms);
  line.append(left, button);
  return line;
}

export function offerButton(text: string, enabled: boolean, onClick: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "farm-start smith-refine smith-shop-buy";
  button.textContent = text;
  button.disabled = !enabled;
  button.addEventListener("click", onClick);
  return button;
}

/** One weapon copy held, for the Reforge tab: copy id 0 is the first copy, the one a slot holds. */
export type HeldWeapon = { itemId: string; copyId: bigint; equipped: boolean; roll: WeaponSkillRoll | null };

export type CraftSectionDeps = {
  craftSkills: () => Readonly<Partial<Record<CraftSkill, bigint>>>;
  /** The craft tool's level for a craft: the bag needs only what it leaves of a recipe. */
  craftToolLevel?: (skill: CraftSkill) => number;
  ores: () => Ores;
  masteryLevels: () => MasteryLevels;
  bagFull: () => boolean;
  craft: (itemId: string) => Promise<Result>;
  /** Makes `crafts` batches of an arrow (craft_arrows); without it the Craft tab lists no arrows. */
  craftArrows?: (arrowId: ArrowId, crafts: number) => Promise<Result>;
  /** Every weapon copy held, worn or in the bag, with its skills. */
  weapons: () => readonly HeldWeapon[];
  refineLevel: (itemId: string, copyId: bigint) => number;
  reforge: (itemId: string, copyId: bigint) => Promise<Result>;
  showMessage: (text: string, color: string) => void;
};

const copyKey = (item: { itemId: string; copyId: bigint }) => `${item.itemId}:${item.copyId}`;

/**
 * The Smith's crafting card: Smithing, Fletching and Enchanting side by side, each with its level and progress. His
 * Craft tab has a tile per line (craftTiles); the line picked shows its craft line (craftDetail), offering the best grade
 * that craft's level opens, with a stepper whose grade every tile then shows (gradeCraftOffer), its materials and a button:
 * "Craft Common Sword ★2", always a new piece. Arrows have tiles of their own (arrowTiles), each a batch from a log and an ore
 * with a stepper for how many batches (craft_arrows). His Reforge tab has a tile per weapon copy held (reforgeTiles), and the
 * one picked shows one Reforge (reforgeDetail). The server decides (craft_grade_item, reforge_weapon).
 */
export function createCraftSection(deps: CraftSectionDeps, options: { onChange?: () => void } = {}) {
  const section = document.createElement("section");
  section.className = "smith-shop craft-section";
  section.setAttribute("aria-label", "Crafting");
  section.innerHTML = `<div class="craft-card"><ul class="craft-skills" aria-label="Crafts">`
    + CRAFT_SKILLS.map(skill => `<li class="craft-skill" data-skill="${skill}"><strong class="craft-name">${CRAFT_SKILL_NAMES[skill]}</strong>`
      + `<span class="craft-level"></span><span class="craft-bar" role="progressbar" aria-valuemin="0" aria-label="${CRAFT_SKILL_NAMES[skill]} progress"><span></span></span>`
      + `<span class="craft-points"></span></li>`).join("")
    + `</ul><p class="craft-note">Crafted gear starts at ${refineStars(CRAFTED_REFINE)} with luckier skills. Higher grades need a higher craft level.</p></div>`;
  /** The piece being crafted, or the copy being reforged. */
  let crafting: string | null = null, rendered = "";
  /** The grade picked for every line at once; each line's best open one until the player steps. */
  let picked: GearGrade | null = null;
  /** Batches picked on each arrow; one until the player steps. */
  const batches = new Map<ArrowId, number>();

  function state() {
    const skills = deps.craftSkills();
    return JSON.stringify([CRAFT_SKILLS.map(skill => String(skills[skill] ?? 0n)), deps.ores(), deps.masteryLevels(), deps.bagFull(), crafting, picked, [...batches],
      reforgeable().map(weapon => [copyKey(weapon), weapon.equipped, weapon.roll, deps.refineLevel(weapon.itemId, weapon.copyId)])]);
  }

  function render() {
    const now = state();
    if (now === rendered) return;
    rendered = now;
    for (const skill of CRAFT_SKILLS) {
      const item = section.querySelector<HTMLElement>(`.craft-skill[data-skill="${skill}"]`)!;
      const { level, into, needed } = craftProgress(deps.craftSkills()[skill] ?? 0n), max = level >= CRAFT_MAX_LEVEL;
      const bar = item.querySelector<HTMLElement>(".craft-bar")!;
      item.querySelector(".craft-level")!.textContent = max ? `Lv ${level} · Max` : `Lv ${level}`;
      bar.setAttribute("aria-valuemax", String(max ? 1 : needed));
      bar.setAttribute("aria-valuenow", String(max ? 1 : into));
      bar.querySelector("span")!.style.width = `${Math.round((max ? 1 : needed > 0 ? Math.min(1, into / needed) : 0) * 1000) / 10}%`;
      item.querySelector(".craft-points")!.textContent = max ? "Max Level" : `${short(into)} / ${short(needed)}`;
    }
  }

  const skillLevel = (skill: CraftSkill) => craftProgress(deps.craftSkills()[skill] ?? 0n).level;
  // What a craft or Reforge takes from the bag: the recipe less what the craft's tool always saves.
  const costOf = (itemId: GradeItemId) => toolCraftCost(gradeCraftMaterials(itemId)!, deps.craftToolLevel?.(gradeCraftSkill(itemId)!) ?? 0);

  /** A line's piece at the grade picked (or its best open), whether its craft level opens it, what it takes, and whether it can be made now. */
  function craftOffer(line: GradeShopLine) {
    const skill = lineCraftSkill(line), offer = gradeCraftOffer(line, skillLevel(skill));
    const grade = picked ?? offer.grade, itemId = gradeShopItemId(line, grade), open = offer.grades.includes(grade);
    const materials = costOf(itemId), lacking = craftMaterialsShort(materials, deps.ores()).length > 0;
    return { skill, offer, grade, itemId, open, materials, lacking, ready: open && !lacking && !deps.bagFull() };
  }

  /** Every grade some line's craft level opens: what the one stepper picks from. */
  const openGrades = () => GEAR_GRADES.filter(grade => GRADE_SHOP_LINES.some(line => gradeCraftOffer(line, skillLevel(lineCraftSkill(line))).grades.includes(grade)));

  /**
   * A line's craft line, by the craft that makes it, at the grade picked (or the best open): a labelled grade stepper
   * with what the next grade needs, the materials held against needed, and a button naming what it makes, or why it waits.
   */
  function craftLine(line: GradeShopLine) {
    const { skill, offer, grade, itemId, open, materials, lacking, ready } = craftOffer(line), ores = deps.ores();
    const piece = `${GEAR_GRADE_NAMES[grade]} ${KIND_NAMES[gradeEquipmentKindOf(itemId)!]}`;
    const text = crafting === itemId ? "Crafting…" : !open ? "Locked" : lacking ? `Need More For ${piece}` : deps.bagFull() ? "Bag Full" : `Craft ${piece} ${refineStars(CRAFTED_REFINE)}`;
    const button = offerButton(text, ready && crafting === null, () => { void craft(itemId); });
    button.classList.add("craft-action");
    const head = document.createElement("span");
    head.className = "craft-head";
    head.append(gradeStepper(grade));
    // The grade past the best open one, and the craft level it waits for.
    if (open && offer.next) head.append(hint(`${GEAR_GRADE_NAMES[gradeOf(offer.next)!]} needs ${CRAFT_SKILL_NAMES[skill]} Lv ${gradeCraftLevel(offer.next)}`, "craft-next"));
    const element = offerLine([head, materialList(materials, ores)], button);
    element.classList.add("craft-offer", "craft-line");
    return { itemId, open, line: element };
  }

  /** An arrow's batches picked: what they take (less the knife's saving), what they make, and whether they can be made now. */
  function arrowOffer(arrowId: ArrowId) {
    const kind = ARROW_KINDS[arrowId], crafts = batches.get(arrowId) ?? ARROW_CRAFTS[0], ores = deps.ores();
    const recipe = Object.fromEntries(Object.entries(kind.recipe).map(([id, each]) => [id, (each ?? 0) * crafts]));
    const materials = toolCraftCost(recipe, deps.craftToolLevel?.("fletching") ?? 0);
    const lacking = craftMaterialsShort(materials, ores).length > 0;
    // A kind already held stacks onto its slot; a new one needs a free slot.
    const noRoom = !(ores[arrowId] ?? 0) && deps.bagFull();
    return { kind, crafts, materials, makes: kind.makes * crafts, lacking, noRoom, ready: !lacking && !noRoom };
  }

  /** Arrows' tiles: one per kind, drawn as the bag's stack with the count held, dimmed while it cannot be made. */
  function arrowTiles(): StationTile[] {
    if (!deps.craftArrows) return [];
    const ores = deps.ores();
    return ARROW_IDS.map(arrowId => ({ key: arrowKey(arrowId), itemId: arrowId, oreCount: ores[arrowId] ?? 0, waits: !arrowOffer(arrowId).ready }));
  }

  /**
   * The arrow picked: its icon, name, effect and batch size, then a stepper for how many batches, the materials held
   * against needed, and one Craft button naming how many it makes, or why it waits.
   */
  function arrowDetail(arrowId: ArrowId) {
    const { kind, crafts, materials, makes, lacking, noRoom, ready } = arrowOffer(arrowId), plural = `${kind.name}s`;
    const row = document.createElement("article");
    row.className = "smith-shop-row is-arrow";
    row.dataset.arrowId = arrowId;
    row.innerHTML = `<span class="smith-shop-art" aria-hidden="true"><span class="inventory-item-art"></span></span>`
      + `<span class="smith-shop-copy"><strong></strong><span class="smith-shop-grade"></span><span class="smith-shop-stat"></span></span>`
      + `<div class="smith-shop-deal"></div>`;
    const source = oreIconSource(arrowId);
    if (source) row.querySelector<HTMLElement>(".inventory-item-art")!.style.backgroundImage = `url(${source})`;
    row.querySelector("strong")!.textContent = kind.name;
    row.querySelector(".smith-shop-grade")!.textContent = `Makes ${count(kind.makes)} · ${count(deps.ores()[arrowId] ?? 0)} Held`;
    row.querySelector(".smith-shop-stat")!.textContent = kind.text;
    const text = crafting === arrowKey(arrowId) ? "Crafting…" : lacking ? `Need More For ${plural}` : noRoom ? "Bag Full" : `Craft ${count(makes)} ${plural}`;
    const button = offerButton(text, ready && crafting === null, () => { void craftArrows(arrowId, crafts, makes); });
    button.classList.add("craft-action");
    const head = document.createElement("span");
    head.className = "craft-head";
    head.append(stepperElement(ARROW_CRAFTS, crafts, {
      label: "Batches to craft", busy: crafting !== null, name: `×${crafts}`, lower: "Fewer", higher: "More",
      onPick: to => { batches.set(arrowId, to); changed(); },
    }));
    const line = offerLine([head, materialList(materials, deps.ores())], button);
    line.classList.add("craft-offer", "craft-line");
    row.querySelector(".smith-shop-deal")!.append(line);
    return row;
  }

  /** The weapon copies a Reforge can take: graded ones a craft makes, worn first, then the best grade. */
  function reforgeable() {
    return deps.weapons().filter(weapon => isCraftable(weapon.itemId) && isSkillWeapon(weapon.itemId))
      .sort((a, b) => Number(b.equipped) - Number(a.equipped) || gradeIndex(gradeOf(b.itemId)!) - gradeIndex(gradeOf(a.itemId)!)
        || a.itemId.localeCompare(b.itemId) || (a.copyId < b.copyId ? -1 : 1));
  }

  /** Reforge's tiles: one per weapon copy held, Worn on the one in hand, dimmed while it cannot be reforged. */
  function reforgeTiles(): StationTile[] {
    const ores = deps.ores();
    return reforgeable().map(weapon => {
      const itemId = weapon.itemId as GradeItemId;
      const ready = skillLevel(gradeCraftSkill(itemId)!) >= gradeCraftLevel(itemId) && !craftMaterialsShort(costOf(itemId), ores).length;
      return {
        key: copyKey(weapon), itemId, copyId: weapon.copyId, refine: deps.refineLevel(itemId, weapon.copyId),
        badge: weapon.equipped ? "Worn" : undefined, waits: !ready,
      };
    });
  }

  /**
   * The weapon copy picked on Reforge: its skills now (so two bows tell apart), the materials a Reforge takes against
   * what is held, and one Reforge button, or why it waits.
   */
  function reforgeDetail(key: string) {
    const weapon = reforgeable().find(each => copyKey(each) === key);
    if (!weapon) return null;
    const ores = deps.ores();
    const itemId = weapon.itemId as GradeItemId, skill = gradeCraftSkill(itemId)!, materials = costOf(itemId);
    const levelMet = skillLevel(skill) >= gradeCraftLevel(itemId), lacking = craftMaterialsShort(materials, ores).length > 0;
    const made = gradeItemRow(itemId, deps.refineLevel(itemId, weapon.copyId), levelMet ? [] : [{ text: `Needs ${gradeCraftNeed(itemId)}`, met: false }]);
    made.row.dataset.copyId = String(weapon.copyId);
    const skills = weaponRollLines(itemId, weapon.roll);
    made.row.querySelector(".smith-shop-copy")!.append(hint([weapon.equipped ? "Worn" : "", skills.length ? skills.join(" · ") : "No Skills Yet"].filter(Boolean).join(" · ")));
    const text = crafting === key ? "Reforging…" : !levelMet ? "Locked" : lacking ? "Need More" : "Reforge";
    const button = offerButton(text, levelMet && !lacking && crafting === null, () => { void reforge(weapon); });
    button.classList.add("craft-action");
    const line = offerLine([materialList(materials, ores)], button);
    line.classList.add("craft-offer", "craft-line");
    made.deal.append(line);
    return made.row;
  }

  /** Craft's tiles: one per line, at the grade picked or the best open, dimmed while it cannot be made. */
  function craftTiles(): StationTile[] {
    return GRADE_SHOP_LINES.map(line => {
      const offer = craftOffer(line);
      return { key: gradeShopLineKey(line), itemId: offer.itemId, waits: !offer.ready, why: offer.open ? undefined : `Needs ${gradeCraftNeed(offer.itemId)}` };
    });
  }

  /** The line or arrow picked on Craft: the piece, then its craft line. */
  function craftDetail(key: string) {
    const arrowId = key.startsWith("arrow:") ? key.slice(6) : "";
    if (isArrowId(arrowId)) return arrowDetail(arrowId);
    const line = GRADE_SHOP_LINES.find(each => gradeShopLineKey(each) === key);
    if (!line) return null;
    const made = craftLine(line), { row, deal } = gradeItemRow(made.itemId, 0, made.open ? [] : [{ text: `Needs ${gradeCraftNeed(made.itemId)}`, met: false }]);
    deal.append(made.line);
    return row;
  }

  function gradeStepper(grade: GearGrade) {
    return gradeStepperElement(openGrades(), grade, {
      label: "Grade to craft", busy: crafting !== null,
      onPick: to => { picked = to; changed(); },
    });
  }

  async function craft(itemId: GradeItemId) {
    if (crafting) return;
    crafting = itemId;
    changed();
    try {
      const result = await deps.craft(itemId);
      if (result?.ok) deps.showMessage(`Crafted · ${nameOf(itemId)} ${refineStars(CRAFTED_REFINE)}. Equip it from your bag.`, "#ffd75e");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      crafting = null;
      changed();
    }
  }

  async function craftArrows(arrowId: ArrowId, crafts: number, makes: number) {
    if (crafting || !deps.craftArrows) return;
    crafting = arrowKey(arrowId);
    changed();
    try {
      const result = await deps.craftArrows(arrowId, crafts);
      if (result?.ok) deps.showMessage(`Crafted · ${count(makes)} ${ARROW_KINDS[arrowId].name}s. Nock them from your bag.`, "#ffd75e");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      crafting = null;
      changed();
    }
  }

  async function reforge(weapon: HeldWeapon) {
    if (crafting) return;
    crafting = copyKey(weapon);
    changed();
    try {
      const result = await deps.reforge(weapon.itemId, weapon.copyId);
      if (result?.ok) deps.showMessage(`Reforged · ${nameOf(weapon.itemId)}. Each skill kept the higher roll.`, "#ffd75e");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      crafting = null;
      changed();
    }
  }

  function changed() {
    render();
    options.onChange?.();
  }

  return {
    element: section,
    render,
    craftTiles,
    arrowTiles,
    craftDetail,
    reforgeTiles,
    reforgeDetail,
    /** What the rows show, for the window that lists them. */
    state,
    /** Each visit starts at each line's best grade, and one batch of arrows. */
    reset() { picked = null; batches.clear(); rendered = ""; },
  };
}

/** What a piece takes, each material held against needed, with its icon. */
export function materialList(materials: Readonly<Record<string, number>>, ores: Ores) {
  const list = document.createElement("ul");
  list.className = "craft-materials";
  list.setAttribute("aria-label", "Materials");
  list.append(...Object.entries(materials).map(([id, needCount]) => {
    const item = document.createElement("li"), have = ores[id as OreId] ?? 0;
    item.className = have >= needCount ? "craft-material" : "craft-material is-short";
    item.dataset.material = id;
    const icon = document.createElement("span");
    icon.className = "craft-material-icon";
    icon.setAttribute("aria-hidden", "true");
    const source = oreIconSource(id as OreId);
    if (source) icon.style.backgroundImage = `url(${source})`;
    const label = document.createElement("span");
    label.textContent = `${count(have)} / ${count(needCount)} ${MATERIAL_NAMES[id] ?? id}`;
    item.append(icon, label);
    return item;
  }));
  return list;
}

/** A short muted line of its own under an offer's terms. */
function hint(text: string, className = "craft-hint") {
  const line = document.createElement("span");
  line.className = className;
  line.textContent = text;
  return line;
}

/** What the Smith's crafting reads from the coop session. */
export type CraftCoop = {
  craftSkills?: () => Readonly<Record<CraftSkill, bigint>>;
  toolLevel?: (tool: ToolId) => number;
  craftGradeItem?: (itemId: string) => Promise<Result>;
  craftArrows?: (arrowId: ArrowId, crafts: number) => Promise<Result>;
  reforgeWeapon?: (itemId: string, copyId: bigint) => Promise<Result>;
  itemRefine?: (itemId: string, copyId?: bigint) => number;
  weaponSkills?: (itemId: string) => WeaponSkillRoll | null;
  ores?: () => Ores;
  weaponMastery?: () => Readonly<Record<WeaponSchool, bigint>>;
  activeItemUpgrades?: () => readonly { itemId: string }[];
  inventorySlotsUnlocked?: () => number;
  research?: () => { inventorySlots?: number };
  equipmentCopies?: () => readonly { id: bigint; itemId: string; roll?: WeaponSkillRoll }[];
};
export type CraftInventory = { itemIds: string[]; equippedHead: string; equippedChest: string; equippedFeet?: string; equippedRightHand: string; equippedLeftHand: string };

/** Every item held: the bag and worn, and the pieces in a Slot Upgrade. */
export const heldItemsFor = (coop: CraftCoop | null | undefined, inventory: CraftInventory) =>
  [...inventory.itemIds, ...(coop?.activeItemUpgrades?.() ?? []).map(active => active.itemId)];

/** The bag as the server counts it (freeBagSlots): items, kept copies, ore stacks. */
export function bagFullFor(coop: CraftCoop | null | undefined, inventory: CraftInventory) {
  const capacity = bagSlotCapacity(coop?.inventorySlotsUnlocked?.() ?? 0, coop?.research?.().inventorySlots ?? 0);
  const equipped = [inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet ?? "", inventory.equippedRightHand, inventory.equippedLeftHand];
  return bagSlotsWithOres({ owned: inventory.itemIds, equipped, extraCopies: coop?.equipmentCopies?.().length ?? 0, ores: coop?.ores?.() ?? {}, capacity }) >= capacity;
}

/** Every weapon copy held: the bag's first copies, worn or not, and the kept copies, each with its skills. */
export function heldWeaponsFor(coop: CraftCoop | null | undefined, inventory: CraftInventory): HeldWeapon[] {
  const worn = new Set([inventory.equippedRightHand, inventory.equippedLeftHand]);
  const firsts = [...new Set(inventory.itemIds)].filter(isSkillWeapon)
    .map(itemId => ({ itemId, copyId: 0n, equipped: worn.has(itemId), roll: coop?.weaponSkills?.(itemId) ?? null }));
  const kept = (coop?.equipmentCopies?.() ?? []).filter(copy => isSkillWeapon(copy.itemId) && inventory.itemIds.includes(copy.itemId))
    .map(copy => ({ itemId: copy.itemId, copyId: copy.id, equipped: false, roll: copy.roll ?? null }));
  return [...firsts, ...kept];
}

/** The Smith's crafting deps from the coop session and the bag. */
export function craftDepsFor(coop: () => CraftCoop | null | undefined, inventory: CraftInventory, showMessage: CraftSectionDeps["showMessage"]): CraftSectionDeps {
  return {
    craftSkills: () => coop()?.craftSkills?.() ?? {},
    craftToolLevel: skill => coop()?.toolLevel?.(CRAFT_TOOL[skill]) ?? 0,
    ores: () => coop()?.ores?.() ?? {},
    masteryLevels: () => masteryLevels(coop()?.weaponMastery?.() ?? {}),
    bagFull: () => bagFullFor(coop(), inventory),
    craft: async itemId => coop()?.craftGradeItem?.(itemId) ?? { ok: false, error: "Not Connected" },
    craftArrows: async (arrowId, crafts) => coop()?.craftArrows?.(arrowId, crafts) ?? { ok: false, error: "Not Connected" },
    weapons: () => heldWeaponsFor(coop(), inventory),
    refineLevel: (itemId, copyId) => coop()?.itemRefine?.(itemId, copyId) ?? 0,
    reforge: async (itemId, copyId) => coop()?.reforgeWeapon?.(itemId, copyId) ?? { ok: false, error: "Not Connected" },
    showMessage,
  };
}
