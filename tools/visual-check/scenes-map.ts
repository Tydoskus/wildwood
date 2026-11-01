// The world and town scenes: whole maps drawn by the game's world renderer at the game's own camera framing.
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { SOUL_MAP_ID } from "../../shared/soul-dimension";
import { WOOD_TREE_NODES } from "../../shared/woodcutting";
import { woodcuttingScene } from "../../src/game/runtime/town/woodcutting-scene";
import { TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_EXCHANGE_PLAZA, TOWN_EXCHANGE_POSITION, TOWN_MAP_ID, TOWN_WALK_AREA, TOWN_WEST_BRIDGE } from "../../shared/town";
import { TOWN_OX_DECOR } from "../../src/game/town-world";
import { attackRangeWithResearch } from "../../shared/utility-research";
import { guildHallMapId } from "../../shared/guild-hall";
import { proceduralMapId } from "../../shared/procedural-maps";
import type { MapId } from "../../src/game/world";
import { createGameBootstrap } from "../../src/game/runtime/game-bootstrap";
import { BOSSES } from "../../src/game/runtime/boss/boss-registry";
import { mapView } from "./game-world";
import type { FakePlayer } from "./world";

const VISITOR = (id: string, x: number, y: number, extra: Partial<FakePlayer & { moving: boolean; facing: number }> = {}) => ({
  id, name: id, power: 840, hp: 1, maxHp: 1, chestItem: "rare_light_armor", rightHandItem: "rare_sword", x, y, ...extra,
});

/** A row of map views that wraps at the page width. */
function strip() {
  const element = document.createElement("div");
  element.style.cssText = "display:flex;flex-wrap:wrap;align-items:flex-start";
  document.body.append(element);
  return element;
}

const PHONE = { width: 390, height: 780 };
const DESKTOP = { width: 1280, height: 800 };

/** Every map where a player arrives, at the phone framing; the Forest and the Night Forest at the desktop framing too. */
export async function world() {
  const phones = strip();
  const maps = [...CAMPAIGN_MAPS.map(map => map.id), proceduralMapId(1), SOUL_MAP_ID, guildHallMapId(1)] as MapId[];
  const views = [];
  for (const mapId of maps) views.push(await mapView({ mapId, ...PHONE, parent: phones, title: `${mapId} · phone` }));
  // Depth order at a gate: one standing in the gateway is drawn over the swirl, one walking through it behind,
  // one beside a pillar and one above the arch in front of and behind the stone.
  const { mapConfig, bosses } = createGameBootstrap();
  const desert = "beginner_desert" as MapId;
  const gate = mapConfig[desert].portal!;
  const inGate = { x: gate.x, y: gate.y - gate.height / 3 };
  views.push(await mapView({
    mapId: desert, ...PHONE, parent: phones, title: "beginner_desert · players at a gate", at: { x: inGate.x + 40, y: inGate.y + 150 },
    others: [VISITOR("standing", inGate.x - 24, inGate.y), VISITOR("walking", inGate.x + 26, inGate.y + 4, { moving: true, facing: -Math.PI / 2 }),
      VISITOR("pillar", gate.x + gate.width * .62, inGate.y), VISITOR("above", gate.x, gate.y - gate.height - 20)],
  }));
  // Depth order at a boss: the player below it is drawn in front, a visitor above it behind.
  const boss = bosses.dragon, bossMap = BOSSES.dragon.mapId as MapId;
  views.push(await mapView({
    mapId: bossMap, ...PHONE, parent: phones, title: `${bossMap} · at its boss`, at: { x: boss.x + 60, y: boss.y + 140 },
    others: [VISITOR("behind", boss.x - 60, boss.y - 90)],
  }));
  for (const mapId of ["tutorial_forest", "infernal_depths"] as MapId[]) views.push(await mapView({ mapId, ...DESKTOP, title: `${mapId} · desktop` }));
  for (const view of views) await view.draw();
}


/**
 * The Town: its baked ground, the river by the west bridge, Ox, the countryside; the framing with attack-range
 * research, the player's zoom at 50% and 150%; and the desktop framing.
 */
export async function town() {
  const phones = strip();
  const mapId = TOWN_MAP_ID as MapId;
  const ox = TOWN_OX_DECOR;
  const views = [
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · arrival" }),
    // Attack-range research reaches further without moving the camera: the same frame as the arrival.
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · range research rank 5", arrange: state => { state.player.attackRange = attackRangeWithResearch(5); } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · zoom 50%", zoomSteps: -10 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · zoom 150%", zoomSteps: 10 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · the river at the west bridge", at: { x: TOWN_WEST_BRIDGE.x, y: TOWN_WEST_BRIDGE.y + 60 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · Ox", at: { x: ox.x + 70, y: ox.y + 90 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "town · countryside", at: { x: TOWN_CENTER.x + 3_000, y: TOWN_CENTER.y - 1_500 } }),
    await mapView({ mapId, ...DESKTOP, title: "town · desktop" }),
  ];
  for (const view of views) await view.draw();
}

/** The cells of the Town's 3×3 grid opened to walk: north of the village, the far corners and the grid's outer wall. */
export async function townGrid() {
  const phones = strip();
  const mapId = TOWN_MAP_ID as MapId;
  const walls = TOWN_WALK_AREA;
  const views = [
    await mapView({ mapId, ...PHONE, parent: phones, title: "grid · north of the village", at: { x: TOWN_CENTER.x, y: TOWN_CENTER.y - 2_600 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "grid · north-east corner", at: { x: walls.right - 600, y: walls.top + 600 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "grid · south-west corner", at: { x: walls.left + 600, y: walls.bottom - 600 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "grid · the top wall", at: { x: TOWN_CENTER.x + 1_000, y: walls.top + 40 } }),
  ];
  for (const view of views) await view.draw();
}

/** Timberwood: pines with one felled (its stump's small shadow among the standing trees'), and the big elders likewise. */
export async function grove() {
  const phones = strip();
  const mapId = TOWN_MAP_ID as MapId;
  const [pine, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , elder] = WOOD_TREE_NODES;
  const felling = (...ids: number[]) => () => { woodcuttingScene.felled.clear(); for (const id of ids) woodcuttingScene.felled.add(id); };
  const views = [
    await mapView({ mapId, ...PHONE, parent: phones, title: "grove · pines standing", at: { x: pine.x - 110, y: pine.y + 40 }, zoomSteps: 6, arrange: felling() }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "grove · one pine felled", at: { x: pine.x - 110, y: pine.y + 40 }, zoomSteps: 6, arrange: felling(pine.id) }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "grove · an elder felled", at: { x: elder.x - 150, y: elder.y + 40 }, zoomSteps: 6, arrange: felling(elder.id) }),
  ];
  for (const view of views) { await view.draw(); }
  woodcuttingScene.felled.clear();
}

/** The Forest's grass and the Town's, side by side at the phone framing and at 150%: the same tufts at one size. */
export async function forest() {
  const phones = strip();
  const mapId = "tutorial_forest" as MapId, town = TOWN_MAP_ID as MapId;
  const countryside = { x: TOWN_CENTER.x + 3_000, y: TOWN_CENTER.y - 1_500 };
  const views = [
    await mapView({ mapId, ...PHONE, parent: phones, title: "forest · arrival" }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "forest · zoom 150%", zoomSteps: 10 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "forest · east", at: { x: 1_400, y: 900 }, zoomSteps: 10 }),
    await mapView({ mapId: town, ...PHONE, parent: phones, title: "town · countryside 150%", at: countryside, zoomSteps: 10 }),
  ];
  for (const view of views) await view.draw();
}

/**
 * The Trade Chrysanthemum, south of the village: the road leaving the village's south edge down to the square, the
 * clerk at his booth and the square at the phone framing, the countryside beside it, and the whole square wide.
 */
export async function exchange() {
  const phones = strip();
  const mapId = TOWN_MAP_ID as MapId;
  const clerk = TOWN_EXCHANGE_POSITION, plaza = TOWN_EXCHANGE_PLAZA;
  const views = [
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the bend at 100%", at: { x: TOWN_CENTER.x - 470, y: TOWN_CENTER.y + 1_800 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the bend at 150%", at: { x: TOWN_CENTER.x - 470, y: TOWN_CENTER.y + 1_800 }, zoomSteps: 10 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the join at 150%", at: { x: TOWN_CENTER.x - 560, y: TOWN_CENTER.y + 1_780 }, zoomSteps: 10 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the village's edge by the portal", at: { x: TOWN_CENTER.x - 520, y: TOWN_CENTER.y + 1_960 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the road from the village", at: { x: TOWN_CENTER.x - 370, y: TOWN_CENTER.y + 2_000 }, zoomSteps: -6 }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the clerk", at: { x: clerk.x + 40, y: clerk.y + 70 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · the square", at: { x: TOWN_EXCHANGE_CENTER.x - 60, y: TOWN_EXCHANGE_CENTER.y + 150 } }),
    await mapView({ mapId, ...PHONE, parent: phones, title: "exchange · countryside beside it", at: { x: plaza.right + 260, y: plaza.bottom + 120 } }),
    await mapView({ mapId, ...DESKTOP, title: "exchange · desktop", at: { x: TOWN_EXCHANGE_CENTER.x, y: TOWN_EXCHANGE_CENTER.y - 150 }, zoomSteps: -4 }),
  ];
  for (const view of views) await view.draw();
}
