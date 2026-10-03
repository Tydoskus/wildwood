import type { EnemyKind } from "./enemy-definitions";
export type EnemyCamp = {
  name: string;
  x: number;
  y: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  ground: string;
  ring: string;
};

export const CAMPS: EnemyCamp[] = [
  // Every camp is one reward track. The health elites keep a separate late
  // destination instead of being folded into the fast starter-health route.
  { name: "Ember Fen", x: 480, y: 2020, radius: 840, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Thornshot Rise", x: 2150, y: 520, radius: 720, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
  { name: "Glass Thicket", x: 2950, y: 1760, radius: 720, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 4360, y: 2330, radius: 760, count: 7, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
  { name: "Mossfall Ruins", x: 1900, y: 2910, radius: 800, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
  { name: "Cinder Quarry", x: 4140, y: 740, radius: 800, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 960, y: 4190, radius: 720, count: 4, types: ["Mossback"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 2430, y: 4380, radius: 720, count: 4, types: ["Mossback"], ground: "#553334", ring: "#d37362" },
  { name: "Royal Hollow", x: 3260, y: 3060, radius: 520, count: 2, types: ["King Slime"], ground: "#405438", ring: "#82bc68" },
];

/** A camp's enemies spawn anywhere inside its circle (0.871: no formations, no inner radius). */
export type SpawnCamp = {
  name: string;
  x: number;
  y: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  ground?: string;
  ring?: string;
};

export const DESERT_CAMPS: SpawnCamp[] = [
  { name: "Sunbaked Burrow", x: 1040, y: 1870, radius: 700, count: 6, types: ["Dune Raider"] },
  { name: "Copper Flats", x: 2490, y: 880, radius: 820, count: 6, types: ["Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Regent"] },
  { name: "Oracle Mesa", x: 4150, y: 750, radius: 460, count: 5, types: ["Blight Oracle"] },
  { name: "Reaper Approach", x: 1770, y: 1480, radius: 0, count: 1, types: ["Wastes Reaper"] },
  { name: "Needle Dunes", x: 3800, y: 2230, radius: 940, count: 7, types: ["Venom Guard"] },
  { name: "Drybone Basin", x: 2050, y: 3650, radius: 980, count: 7, types: ["Venom Guard"] },
];

export const SNOW_CAMPS: SpawnCamp[] = [
  { name: "Rimegate Trail", x: 1280, y: 1900, radius: 880, count: 6, types: ["Frost Raider"] },
  { name: "Glacier Crossing", x: 2750, y: 860, radius: 800, count: 6, types: ["Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Regent"] },
  { name: "Whiteout Hollow", x: 3860, y: 2280, radius: 880, count: 7, types: ["Rime Guard"] },
  { name: "Aurora Shelf", x: 1350, y: 3750, radius: 840, count: 7, types: ["Aurora Oracle"] },
  { name: "Reaper's Rest", x: 2580, y: 2740, radius: 360, count: 1, types: ["Whiteout Reaper"] },
];

export const LAVA_CAMPS: SpawnCamp[] = [
  { name: "Searing Approach", x: 1250, y: 1820, radius: 800, count: 6, types: ["Ember Raider"] },
  { name: "Magma Causeway", x: 3000, y: 850, radius: 800, count: 6, types: ["Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Regent"] },
  { name: "Obsidian Crater", x: 4040, y: 2270, radius: 880, count: 7, types: ["Magma Guard"] },
  { name: "Ashen Shelf", x: 760, y: 3600, radius: 840, count: 7, types: ["Ash Reaper"] },
  { name: "Inferno Caldera", x: 2400, y: 3900, radius: 760, count: 6, types: ["Inferno Oracle"] },
];

export const INFERNAL_CAMPS: SpawnCamp[] = [
  { name: "Moonless Gate", x: 1260, y: 1820, radius: 800, count: 6, types: ["Depth Raider"] },
  { name: "Blackbough Trail", x: 3070, y: 820, radius: 800, count: 6, types: ["Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Regent"] },
  { name: "Hollow Grove", x: 4040, y: 2270, radius: 880, count: 7, types: ["Obsidian Colossus"] },
  { name: "Dreadwood", x: 860, y: 3470, radius: 840, count: 7, types: ["Doom Reaper"] },
  { name: "Witching Glade", x: 2390, y: 4100, radius: 760, count: 6, types: ["Nether Oracle"] },
];

export const WATER_CAMPS: SpawnCamp[] = [
  { name: "Shallows Landing", x: 1530, y: 1580, radius: 800, count: 6, types: ["Tide Raider"] },
  { name: "Kelp Channel", x: 3030, y: 850, radius: 800, count: 6, types: ["Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Regent"] },
  { name: "Coral Citadel", x: 4040, y: 2270, radius: 880, count: 7, types: ["Coral Colossus"] },
  { name: "Drowned Trench", x: 820, y: 3500, radius: 840, count: 7, types: ["Drowned Reaper"] },
  { name: "Mooncurrent Shrine", x: 2390, y: 4040, radius: 760, count: 6, types: ["Tidal Oracle"] },
];

export const SAMURAI_CAMPS: SpawnCamp[] = [
  { name: "Lantern Gate", x: 1180, y: 1870, radius: 800, count: 6, types: ["Sakura Ronin"] },
  { name: "Blossom Walk", x: 2900, y: 850, radius: 800, count: 6, types: ["Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Regent"] },
  { name: "Bamboo Court", x: 4040, y: 2270, radius: 880, count: 7, types: ["Bamboo Guardian"] },
  { name: "Moonbridge", x: 840, y: 3530, radius: 840, count: 7, types: ["Moonblade Reaper"] },
  { name: "Sakura Shrine", x: 2390, y: 4130, radius: 760, count: 6, types: ["Shrine Oracle"] },
];

export const CLOUDSPIRE_CAMPS: SpawnCamp[] = [
  { name: "Zephyr Landing", x: 1370, y: 1740, radius: 800, count: 6, types: ["Gale Prowler"] },
  { name: "Nimbus Causeway", x: 2990, y: 880, radius: 800, count: 6, types: ["Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Regent"] },
  { name: "Sunvault Bastion", x: 4040, y: 2270, radius: 880, count: 7, types: ["Skyguard Colossus"] },
  { name: "Thunderhead", x: 840, y: 3540, radius: 840, count: 7, types: ["Thunder Reaper"] },
  { name: "Eye of the Storm", x: 2390, y: 4130, radius: 760, count: 6, types: ["Tempest Oracle"] },
];

export const MOONFEN_CAMPS: SpawnCamp[] = [
  { name: "Firefly Landing", x: 1370, y: 1740, radius: 800, count: 6, types: ["Fen Prowler"] },
  { name: "Glowcap Crossing", x: 2990, y: 880, radius: 800, count: 6, types: ["Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Regent"] },
  { name: "Sunken Bulwark", x: 4040, y: 2270, radius: 880, count: 7, types: ["Bog Colossus"] },
  { name: "Moonmire Hollow", x: 840, y: 3540, radius: 840, count: 7, types: ["Moonmire Reaper"] },
  { name: "Wispwater Shrine", x: 2390, y: 4130, radius: 760, count: 6, types: ["Wisp Oracle"] },
];
export const CRYSTAL_HOLLOWS_CAMPS: SpawnCamp[] = [
  { name: "Quartz Landing", x: 1420, y: 1700, radius: 800, count: 6, types: ["Shard Hopper"] },
  { name: "Amethyst Gallery", x: 2880, y: 820, radius: 800, count: 6, types: ["Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Regent"] },
  { name: "Geode Bastion", x: 3820, y: 2280, radius: 880, count: 7, types: ["Geode Guardian"] },
  { name: "Prismatic Cut", x: 880, y: 3310, radius: 840, count: 7, types: ["Prism Reaver"] },
  { name: "Resonant Vault", x: 2390, y: 4010, radius: 760, count: 6, types: ["Hollow Oracle"] },
];
export const CLOCKWORK_RUINS_CAMPS: SpawnCamp[] = [
  { name: "Foundry Gate", x: 1420, y: 1700, radius: 800, count: 6, types: ["Gear Prowler"] },
  { name: "Rivet Arcade", x: 2880, y: 820, radius: 800, count: 6, types: ["Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Gear Regent"] },
  { name: "Ironworks", x: 3820, y: 2280, radius: 880, count: 7, types: ["Iron Guardian"] },
  { name: "Scrap Yard", x: 880, y: 3310, radius: 840, count: 7, types: ["Scrap Reaver"] },
  { name: "Dynamo Vault", x: 2390, y: 4010, radius: 760, count: 6, types: ["Spark Oracle"] },
];
export const DUSKFALL_ORCHARD_CAMPS: SpawnCamp[] = [
  { name: "Lantern Landing", x: 1420, y: 1700, radius: 800, count: 6, types: ["Gourd Prowler"] },
  { name: "Seedling Rows", x: 2880, y: 820, radius: 800, count: 6, types: ["Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Harvest Regent"] },
  { name: "Hollow Trunk", x: 3820, y: 2280, radius: 880, count: 7, types: ["Husk Guardian"] },
  { name: "Briar Patch", x: 880, y: 3310, radius: 840, count: 7, types: ["Thorn Reaver"] },
  { name: "Harvest Shrine", x: 2390, y: 4010, radius: 760, count: 6, types: ["Harvest Oracle"] },
];
export const NEON_BASTION_CAMPS: SpawnCamp[] = [
  { name: "Circuit Gate", x: 1320, y: 1650, radius: 700, count: 6, types: ["Circuit Prowler"] },
  { name: "Pulse Arcade", x: 2900, y: 760, radius: 700, count: 6, types: ["Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Voltage Regent"] },
  { name: "Relay Station", x: 3500, y: 2450, radius: 760, count: 7, types: ["Relay Guardian"] },
  { name: "Arc Foundry", x: 910, y: 3110, radius: 700, count: 7, types: ["Arc Reaver"] },
  { name: "Signal Core", x: 2290, y: 3820, radius: 660, count: 6, types: ["Signal Oracle"] },
];
export const VERDANT_CATACOMBS_CAMPS: SpawnCamp[] = [
  { name: "Rootfall Vestibule", x: 1330, y: 1620, radius: 680, count: 6, types: ["Mossbound Stalker"] },
  { name: "Luminous Gallery", x: 2730, y: 1010, radius: 720, count: 6, types: ["Spore Slinger", "Spore Slinger", "Spore Slinger", "Spore Slinger", "Spore Slinger", "Mycelial Regent"] },
  { name: "Ossuary Vault", x: 3590, y: 2380, radius: 780, count: 7, types: ["Ossuary Guardian"] },
  { name: "Briar Sepulcher", x: 990, y: 3190, radius: 700, count: 7, types: ["Briar Reaver"] },
  { name: "Mycelium Sanctum", x: 2550, y: 3570, radius: 680, count: 6, types: ["Crypt Oracle"] },
];
export const ION_CITADEL_CAMPS: SpawnCamp[] = [
  { name: "Shield Gate", x: 1330, y: 1610, radius: 680, count: 6, types: ["Ion Patrol"] },
  { name: "Capacitor Court", x: 2760, y: 980, radius: 720, count: 6, types: ["Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Citadel Marshal"] },
  { name: "Armored Rampart", x: 3550, y: 2430, radius: 800, count: 7, types: ["Bastion Defender"] },
  { name: "Flux Assembly", x: 1020, y: 3150, radius: 720, count: 7, types: ["Flux Enforcer"] },
  { name: "Reactor Annex", x: 2530, y: 3700, radius: 660, count: 6, types: ["Reactor Warden"] },
];

