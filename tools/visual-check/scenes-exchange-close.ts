// The Trade Chrysanthemum close up: each part of the market at 150%, a square view apiece, to check its small details.
import { TOWN_CENTER, TOWN_EXCHANGE_CENTER, TOWN_EXCHANGE_POSITION, TOWN_EXCHANGE_ROAD, TOWN_MAP_ID } from "../../shared/town";
import type { MapId } from "../../src/game/world";
import { mapView } from "./game-world";

const SQUARE = { width: 560, height: 560 };
/** The minimap always draws; this puts it below the view. */
const OFF_PAGE = { left: 0, top: 10_000, width: 1, height: 1 };

export async function exchangeClose() {
  const views = document.createElement("div");
  views.style.cssText = "display:flex;flex-wrap:wrap;align-items:flex-start";
  document.body.append(views);
  const mapId = TOWN_MAP_ID as MapId;
  const { x: CX, y: CY } = TOWN_EXCHANGE_CENTER, clerk = TOWN_EXCHANGE_POSITION, road = TOWN_EXCHANGE_ROAD[TOWN_EXCHANGE_ROAD.length - 1];
  const town = (dx: number, dy: number) => ({ x: TOWN_CENTER.x + dx, y: TOWN_CENTER.y + dy });
  const areas: [string, { x: number; y: number }][] = [
    ["the gate", { x: road.x + road.w / 2, y: clerk.y - 140 }],
    ["the clerk", { x: clerk.x, y: clerk.y + 30 }],
    ["the hall's west wing", { x: clerk.x - 320, y: clerk.y - 40 }],
    ["the hall's east wing", { x: clerk.x + 320, y: clerk.y - 40 }],
    ["the road in meets the plaza", { x: road.x + road.w / 2, y: CY - 120 }],
    ["the weapon sellers", town(-1_100, 2_660)],
    ["the armourers", town(950, 2_660)],
    ["the north-west pavilion", { x: CX - 300, y: CY - 60 }],
    ["the north-east pavilion", { x: CX + 300, y: CY - 60 }],
    ["the fountain", { x: CX, y: CY + 60 }],
    ["the south-west pavilion", { x: CX - 300, y: CY + 220 }],
    ["the south-east pavilion", { x: CX + 300, y: CY + 220 }],
    ["the plaza's west edge", { x: CX - 620, y: CY + 60 }],
    ["the plaza's east edge", { x: CX + 620, y: CY + 60 }],
    ["the timber street", { x: TOWN_CENTER.x - 1_200, y: CY }],
    ["the fish street", { x: TOWN_CENTER.x - 1_200, y: CY + 280 }],
    ["the west warehouse", { x: TOWN_CENTER.x - 1_960, y: CY + 60 }],
    ["the ore street", { x: TOWN_CENTER.x + 950, y: CY }],
    ["the crystal street", { x: TOWN_CENTER.x + 950, y: CY + 280 }],
    ["the east warehouse", { x: TOWN_CENTER.x + 1_560, y: CY + 60 }],
    ["the avenue", { x: CX, y: CY + 470 }],
    ["the crossing", { x: CX, y: CY + 700 }],
    ["the fletchers", { x: TOWN_CENTER.x - 1_100, y: CY + 700 }],
    ["the benches west", { x: CX - 450, y: CY + 700 }],
    ["the benches east", { x: CX + 450, y: CY + 700 }],
    ["the street's east end", { x: CX + 1_250, y: CY + 700 }],
    ["the lions", { x: CX, y: CY + 860 }],
    ["the west path's end", { x: TOWN_CENTER.x - 2_150, y: CY + 60 }],
  ];
  const drawn = [];
  for (const [title, at] of areas) drawn.push(await mapView({ mapId, ...SQUARE, parent: views, title: `close · ${title}`, at, zoomSteps: 10, minimap: OFF_PAGE }));
  for (const view of drawn) await view.draw();
}
