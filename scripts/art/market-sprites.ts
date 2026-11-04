// Every sprite in the market's sheet: its name, how far it reaches from its foot, and how it paints. Bake time
// only: the sheet is drawn once from these and the game only copies its images.
import { drawBanner, drawFountain, drawGate, drawHall, drawWarehouse } from "./market-buildings";
import { PLAZA_PAINTERS } from "./market-plaza";
import { STALL_PAINTERS } from "./market-stalls";
import { YARD_PAINTERS } from "./market-yard";

export type MarketSprite = { name: string; extents: { left: number; right: number; up: number; down: number }; draw(c: CanvasRenderingContext2D): void };

type Extents = MarketSprite["extents"];
type Paint = (c: CanvasRenderingContext2D) => void;
const box = (left: number, right: number, up: number, down: number): Extents => ({ left, right, up, down });

/** Each paints from its foot with round joins and leaves the context as it found it. */
function sprite(name: string, extents: Extents, paint: Paint | undefined): MarketSprite {
  if (!paint) throw new Error(`No painter for the market sprite ${name}`);
  return { name, extents, draw(c) { c.save(); c.lineJoin = "round"; paint(c); c.restore(); } };
}

const STALL = box(62, 62, 150, 14), PAVILION = box(150, 150, 210, 30), SIGN = box(46, 46, 160, 8);

export const MARKET_SPRITES: readonly MarketSprite[] = [
  sprite("hall", box(400, 400, 380, 14), drawHall),
  sprite("gate", box(130, 130, 270, 10), drawGate),
  sprite("fountain", box(195, 195, 240, 30), drawFountain),
  sprite("banner", box(30, 30, 150, 8), drawBanner),
  sprite("warehouse", box(170, 170, 300, 12), drawWarehouse),
  ...["nw", "ne", "sw", "se"].map(quarter => sprite(`pavilion-${quarter}`, PAVILION, PLAZA_PAINTERS[`pavilion-${quarter}`])),
  ...["ore", "crystal", "timber", "fish", "arrows", "weapons", "armor"].map(kind => sprite(`stall-${kind}`, STALL, STALL_PAINTERS[`stall-${kind}`])),
  sprite("weapon-rack", box(50, 50, 120, 8), YARD_PAINTERS["weapon-rack"]),
  sprite("armor-stand", box(30, 30, 120, 8), YARD_PAINTERS["armor-stand"]),
  sprite("lumber-stack", box(70, 70, 80, 10), YARD_PAINTERS["lumber-stack"]),
  sprite("ore-cart", box(55, 55, 70, 10), YARD_PAINTERS["ore-cart"]),
  sprite("fish-tub", box(34, 34, 46, 8), YARD_PAINTERS["fish-tub"]),
  sprite("arrow-barrel", box(24, 24, 70, 6), YARD_PAINTERS["arrow-barrel"]),
  sprite("crystal-crate", box(48, 60, 82, 8), YARD_PAINTERS["crystal-crate"]),
  sprite("bench", box(52, 52, 40, 8), YARD_PAINTERS.bench),
  ...["ore", "crystal", "timber", "fish", "arrows", "weapons", "armor"].map(kind => sprite(`sign-${kind}`, SIGN, YARD_PAINTERS[`sign-${kind}`])),
  sprite("lion-statue", box(42, 42, 110, 10), YARD_PAINTERS["lion-statue"]),
  sprite("stone-lantern", box(18, 18, 74, 6), YARD_PAINTERS["stone-lantern"]),
  sprite("flower-bed", box(70, 70, 58, 10), YARD_PAINTERS["flower-bed"]),
];
