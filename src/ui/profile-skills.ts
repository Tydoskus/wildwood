import type { PlayerProfileData } from "../wildstat-coop";
import { WEAPON_SCHOOLS, WEAPON_SCHOOL_NAMES, masteryPointsForLevel, masteryProgress, type WeaponSchool } from "../../shared/weapon-mastery";
import { GEAR_GRADES, GEAR_GRADE_NAMES, GRADE_MASTERY_LEVEL, type GearGrade } from "../../shared/gear-grades";
import { CRAFT_LEVEL, CRAFT_MAX_LEVEL, CRAFT_SKILLS, CRAFT_SKILL_NAMES, MATERIAL_NAMES, craftExperienceForLevel, craftLevel, type CraftSkill } from "../../shared/crafting";
import { MINING_VEINS } from "../../shared/mining";
import { WOOD_STANDS } from "../../shared/woodcutting";
import { FISH, FISHING_MAX_LEVEL, fishingExperienceForLevel, fishingLevel } from "../../shared/fishing";
import { SOUL_STAT_DETAILS, SOUL_STAT_ORDER, SOUL_TIER_COUNT, SOUL_TIER_KILL_TYPES, soulTier, soulTierKillsNeeded, type RewardKillCounts } from "../../shared/soul-dimension";
import { formatCompactNumber } from "../../shared/compact-number";

export type ProfileSkillGroup = "Weapon Mastery" | "Gathering" | "Crafting";
export type ProfileSkillRow = {
  kind: string; group: ProfileSkillGroup; name: string; level: string;
  /** Your own profile only: the way to the next level, or the next rocks or trees. */
  progress?: { into: number; needed: number };
  /** Your own profile only: what the skill opens next. */
  next?: string;
};
/** Your own points, which only your profile has: Mastery points, craft and Fishing experience. */
export type OwnSkillPoints = {
  mastery?: Readonly<Partial<Record<WeaponSchool, bigint | number>>>;
  crafts?: Readonly<Partial<Record<CraftSkill, bigint | number>>>;
  fishing?: number;
};

const KILL_LABELS: Readonly<Record<(typeof SOUL_TIER_KILL_TYPES)[number], string>> = {
  damage: "Damage Enemies", health: "Health Enemies", armor: "Armor Enemies", regen: "Regen Enemies",
};
const whole = (value: number) => Math.floor(value).toLocaleString("en-US");
const nextGrade = (levels: Readonly<Record<GearGrade, number>>, level: number) => {
  const grade = GEAR_GRADES.find(grade => levels[grade] > level);
  return grade ? `Next: ${GEAR_GRADE_NAMES[grade]} at Lv ${levels[grade]}` : undefined;
};

/** Mining and Woodcutting are stats, not levels: the next vein or stand they open is the goal. */
function gatheringRow(kind: string, name: string, value: number | null | undefined, gates: readonly { at: number; name: string }[], own: boolean): ProfileSkillRow {
  const level = value == null ? "Not Started" : whole(value);
  if (!own) return { kind, group: "Gathering", name, level };
  const current = Math.max(0, value ?? 0), gate = gates.find(gate => gate.at > current);
  // Nothing to count before the first rock or tree: the goal alone says it.
  return gate ? { kind, group: "Gathering", name, level, progress: value == null ? undefined : { into: current, needed: gate.at }, next: `Next: ${gate.name} at ${whole(gate.at)}` }
    : { kind, group: "Gathering", name, level, next: "Everything Open" };
}

/** Fishing is a level from 1 to 99: the next fish it opens is the goal. */
function fishingRow(level: number | null | undefined, experience: number | undefined, own: boolean): ProfileSkillRow {
  const base = { kind: "fishing", group: "Gathering" as const, name: "Fishing" };
  if (!own) return { ...base, level: level == null ? "Not Started" : `Lv ${level}` };
  // Before the live experience arrives, the level the profile already has stands in.
  const points = Math.max(0, experience ?? (level ? fishingExperienceForLevel(level) : 0)), reached = fishingLevel(points);
  if (points === 0 && level == null) return { ...base, level: "Not Started", next: `Next: ${FISH[1].name} at Lv ${FISH[1].level}` };
  if (reached >= FISHING_MAX_LEVEL) return { ...base, level: `Lv ${reached} Max` };
  const floor = fishingExperienceForLevel(reached), fish = FISH.find(each => each.level > reached);
  return { ...base, level: `Lv ${reached}`, progress: { into: points - floor, needed: fishingExperienceForLevel(reached + 1) - floor },
    next: fish ? `Next: ${fish.name} at Lv ${fish.level}` : "Every Fish Open" };
}

/** Every skill on the Skills tab: levels for anyone, progress and the next unlock on your own (`own`). */
export function profileSkillRows(profile: Pick<PlayerProfileData, "mastery" | "mining" | "woodcutting" | "fishing" | "crafts">, own?: OwnSkillPoints): ProfileSkillRow[] {
  const rows: ProfileSkillRow[] = [];
  for (const school of WEAPON_SCHOOLS) {
    const base = { kind: school, group: "Weapon Mastery" as const, name: WEAPON_SCHOOL_NAMES[school] };
    if (!own) { rows.push({ ...base, level: `Lv ${profile.mastery?.[school] ?? 0}` }); continue; }
    // Before the live points arrive, the level the profile already has stands in.
    const progress = masteryProgress(own.mastery?.[school] ?? masteryPointsForLevel(profile.mastery?.[school] ?? 0));
    rows.push({ ...base, level: progress.needed ? `Lv ${progress.level}` : `Lv ${progress.level} Max`,
      progress: progress.needed ? { into: progress.into, needed: progress.needed } : undefined, next: nextGrade(GRADE_MASTERY_LEVEL, progress.level) });
  }
  rows.push(gatheringRow("mining", "Mining", profile.mining, MINING_VEINS.map(vein => ({ at: vein.mining, name: MATERIAL_NAMES[vein.ore] })), Boolean(own)));
  rows.push(gatheringRow("woodcutting", "Woodcutting", profile.woodcutting, WOOD_STANDS.map(stand => ({ at: stand.woodcutting, name: `${stand.name}s` })), Boolean(own)));
  rows.push(fishingRow(profile.fishing, own?.fishing, Boolean(own)));
  for (const skill of CRAFT_SKILLS) {
    const base = { kind: skill, group: "Crafting" as const, name: CRAFT_SKILL_NAMES[skill] };
    const known = profile.crafts?.[skill];
    const experience = Math.max(0, Number(own?.crafts?.[skill] ?? (known ? craftExperienceForLevel(known) : 0)) || 0);
    const started = experience > 0 || known != null, level = own ? craftLevel(experience) : known ?? 1;
    if (!own) { rows.push({ ...base, level: started ? `Lv ${level}` : "Not Started" }); continue; }
    const floor = craftExperienceForLevel(level), ceiling = craftExperienceForLevel(level + 1);
    const max = level >= CRAFT_MAX_LEVEL;
    rows.push({ ...base, level: !started ? "Not Started" : max ? `Lv ${level} Max` : `Lv ${level}`,
      progress: max || !started ? undefined : { into: experience - floor, needed: ceiling - floor }, next: nextGrade(CRAFT_LEVEL, level) });
  }
  return rows;
}

/** The Soul Portal's tier goal for your own profile: the tier, and each kill type toward the next one. */
export function profileSoulTier(kills: Partial<RewardKillCounts>) {
  const tier = soulTier(kills);
  if (tier >= SOUL_TIER_COUNT) return { title: `Soul Tier ${tier}: Every Soul Enemy Awake`, note: "", rows: [] };
  const needed = soulTierKillsNeeded(tier + 1);
  return {
    title: `Soul Tier ${tier} of ${SOUL_TIER_COUNT}`,
    note: `Tier ${tier + 1} wakes ${SOUL_STAT_DETAILS[SOUL_STAT_ORDER[tier]].label} enemies. Kill ${formatCompactNumber(needed)} of each:`,
    rows: SOUL_TIER_KILL_TYPES.map(type => {
      const count = Math.max(0, Number(kills[type] ?? 0) || 0);
      return { label: KILL_LABELS[type], value: `${formatCompactNumber(Math.min(count, needed))} / ${formatCompactNumber(needed)}`, done: count >= needed };
    }),
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function renderProfileSkills(panel: HTMLElement, rows: readonly ProfileSkillRow[]) {
  const groups = new Map<ProfileSkillGroup, HTMLElement>();
  const nodes: HTMLElement[] = [];
  for (const row of rows) {
    let group = groups.get(row.group);
    if (!group) {
      group = element("section", "profile-skill-group");
      group.append(element("h3", "profile-skill-heading", row.group));
      groups.set(row.group, group); nodes.push(group);
    }
    const item = element("div", `profile-skill profile-skill-${row.kind}`);
    const head = element("div", "profile-skill-head");
    head.append(element("span", "profile-skill-name", row.name), element("strong", "profile-skill-level", row.level));
    item.append(head);
    if (row.progress) {
      const fill = row.progress.needed > 0 ? Math.max(0, Math.min(1, row.progress.into / row.progress.needed)) : 0;
      const bar = element("span", "profile-skill-bar");
      bar.setAttribute("aria-hidden", "true");
      const inner = element("span", "");
      inner.style.width = `${Math.round(fill * 1000) / 10}%`;
      bar.append(inner);
      item.append(bar);
    }
    if (row.progress || row.next) {
      const detail = element("div", "profile-skill-detail");
      detail.append(element("span", "", row.progress ? `${whole(row.progress.into)} / ${whole(row.progress.needed)}` : ""), element("span", "", row.next ?? ""));
      item.append(detail);
    }
    group.append(item);
  }
  panel.replaceChildren(...nodes);
}

/** The soul tier block under Info, on your own profile; hidden on anyone else's (`kills` undefined). */
export function renderProfileSoulTier(container: HTMLElement, kills: Partial<RewardKillCounts> | undefined) {
  container.hidden = !kills;
  if (!kills) { container.replaceChildren(); return; }
  const goal = profileSoulTier(kills);
  const list = element("dl", "profile-grid profile-soul-tier-kills");
  for (const row of goal.rows) {
    const cell = element("div", row.done ? "is-done" : "");
    cell.append(element("dt", "", row.label), element("dd", "", row.value));
    list.append(cell);
  }
  container.replaceChildren(element("h3", "profile-skill-heading", goal.title), ...(goal.note ? [element("p", "profile-soul-tier-note", goal.note), list] : []));
}
