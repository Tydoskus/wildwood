import type { EnemyKind } from "./enemy-definitions";
export type EnemyCamp = {
  name: string;
  x: number;
  y: number;
  minRadius: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  ground: string;
  ring: string;
};

export const CAMPS: EnemyCamp[] = [
  // Every camp is one reward track. The health elites keep a separate late
  // destination instead of being folded into the fast starter-health route.
  { name: "Ember Fen", x: 850, y: 1450, minRadius: 230, radius: 420, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Thornshot Rise", x: 2300, y: 800, minRadius: 210, radius: 360, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
  { name: "Glass Thicket", x: 4000, y: 900, minRadius: 210, radius: 360, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 4150, y: 2300, minRadius: 220, radius: 380, count: 7, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
  { name: "Mossfall Ruins", x: 850, y: 2850, minRadius: 230, radius: 400, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
  { name: "Cinder Quarry", x: 2450, y: 2400, minRadius: 230, radius: 400, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 1150, y: 4200, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 2700, y: 4100, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#553334", ring: "#d37362" },
  { name: "Royal Hollow", x: 3750, y: 3550, minRadius: 150, radius: 260, count: 2, types: ["King Slime"], ground: "#405438", ring: "#82bc68" },
];

type SpawnFormation = "scatter" | "crescent" | "shoal" | "ranks";
export type SpawnCamp = {
  name: string;
  x: number;
  y: number;
  minRadius: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  formation?: SpawnFormation;
  rotation?: number;
  ground?: string;
  ring?: string;
};

export const DESERT_CAMPS: SpawnCamp[] = [
  { name: "Sunbaked Burrow", x: 1120, y: 1160, minRadius: 150, radius: 350, count: 6, types: ["Dune Raider"] },
  { name: "Copper Flats", x: 2780, y: 1260, minRadius: 180, radius: 410, count: 6, types: ["Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Archer", "Dune Regent"] },
  { name: "Oracle Mesa", x: 4140, y: 780, minRadius: 90, radius: 230, count: 5, types: ["Blight Oracle"] },
  { name: "Reaper Approach", x: 1740, y: 1420, minRadius: 0, radius: 0, count: 1, types: ["Wastes Reaper"] },
  { name: "Needle Dunes", x: 3950, y: 2550, minRadius: 200, radius: 470, count: 7, types: ["Venom Guard"] },
  { name: "Drybone Basin", x: 2050, y: 3650, minRadius: 210, radius: 490, count: 7, types: ["Venom Guard"] },
];

export const SNOW_CAMPS: SpawnCamp[] = [
  { name: "Rimegate Trail", x: 950, y: 1350, minRadius: 250, radius: 440, count: 6, types: ["Frost Raider"], formation: "crescent", rotation: -.4 },
  { name: "Glacier Crossing", x: 3000, y: 850, minRadius: 220, radius: 400, count: 6, types: ["Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Archer", "Glacier Regent"], formation: "ranks", rotation: .25 },
  { name: "Whiteout Hollow", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Rime Guard"], formation: "crescent", rotation: 1.3 },
  { name: "Aurora Shelf", x: 1350, y: 3750, minRadius: 230, radius: 420, count: 7, types: ["Aurora Oracle"], formation: "ranks", rotation: -.15 },
  { name: "Reaper's Rest", x: 2700, y: 2700, minRadius: 100, radius: 180, count: 1, types: ["Whiteout Reaper"], formation: "crescent", rotation: 1.8 },
];

export const LAVA_CAMPS: SpawnCamp[] = [
  { name: "Searing Approach", x: 950, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Ember Raider"], formation: "crescent", rotation: -.35 },
  { name: "Magma Causeway", x: 3000, y: 850, minRadius: 230, radius: 400, count: 6, types: ["Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Archer", "Cinder Regent"], formation: "ranks", rotation: .2 },
  { name: "Obsidian Crater", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Magma Guard"], formation: "crescent", rotation: 1.2 },
  { name: "Ashen Shelf", x: 1050, y: 3650, minRadius: 240, radius: 420, count: 7, types: ["Ash Reaper"], formation: "ranks", rotation: -.2 },
  { name: "Inferno Caldera", x: 2700, y: 3900, minRadius: 210, radius: 380, count: 6, types: ["Inferno Oracle"], formation: "crescent", rotation: 2.4 },
];

export const INFERNAL_CAMPS: SpawnCamp[] = [
  { name: "Moonless Gate", x: 1050, y: 1500, minRadius: 230, radius: 400, count: 6, types: ["Depth Raider"], formation: "crescent", rotation: -.45 },
  { name: "Blackbough Trail", x: 3150, y: 950, minRadius: 230, radius: 400, count: 6, types: ["Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Archer", "Abyss Regent"], formation: "ranks", rotation: .35 },
  { name: "Hollow Grove", x: 4100, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Obsidian Colossus"], formation: "crescent", rotation: 1.1 },
  { name: "Dreadwood", x: 950, y: 3500, minRadius: 240, radius: 420, count: 7, types: ["Doom Reaper"], formation: "ranks", rotation: -.3 },
  { name: "Witching Glade", x: 2650, y: 4050, minRadius: 210, radius: 380, count: 6, types: ["Nether Oracle"], formation: "crescent", rotation: 2.35 },
];

export const WATER_CAMPS: SpawnCamp[] = [
  { name: "Shallows Landing", x: 1100, y: 1200, minRadius: 230, radius: 400, count: 6, types: ["Tide Raider"], formation: "shoal", rotation: .2 },
  { name: "Kelp Channel", x: 3050, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Archer", "Reef Regent"], formation: "shoal", rotation: .9 },
  { name: "Coral Citadel", x: 4150, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Coral Colossus"], formation: "shoal", rotation: -.35 },
  { name: "Drowned Trench", x: 950, y: 3550, minRadius: 240, radius: 420, count: 7, types: ["Drowned Reaper"], formation: "shoal", rotation: .65 },
  { name: "Mooncurrent Shrine", x: 2600, y: 4000, minRadius: 210, radius: 380, count: 6, types: ["Tidal Oracle"], formation: "shoal", rotation: -.2 },
];

export const SAMURAI_CAMPS: SpawnCamp[] = [
  { name: "Lantern Gate", x: 950, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Sakura Ronin"], formation: "ranks", rotation: 0 },
  { name: "Blossom Walk", x: 2900, y: 850, minRadius: 230, radius: 400, count: 6, types: ["Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Archer", "Petal Regent"], formation: "ranks", rotation: .35 },
  { name: "Bamboo Court", x: 4050, y: 2300, minRadius: 250, radius: 440, count: 7, types: ["Bamboo Guardian"], formation: "ranks", rotation: -.25 },
  { name: "Moonbridge", x: 1150, y: 3650, minRadius: 240, radius: 420, count: 7, types: ["Moonblade Reaper"], formation: "ranks", rotation: .55 },
  { name: "Sakura Shrine", x: 2650, y: 4050, minRadius: 210, radius: 380, count: 6, types: ["Shrine Oracle"], formation: "ranks", rotation: 0 },
];

export const CLOUDSPIRE_CAMPS: SpawnCamp[] = [
  { name: "Zephyr Landing", x: 1050, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Gale Prowler"], formation: "crescent", rotation: -.25 },
  { name: "Nimbus Causeway", x: 3000, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Archer", "Nimbus Regent"], formation: "ranks", rotation: .2 },
  { name: "Sunvault Bastion", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Skyguard Colossus"], formation: "crescent", rotation: 1.15 },
  { name: "Thunderhead", x: 1000, y: 3600, minRadius: 240, radius: 420, count: 7, types: ["Thunder Reaper"], formation: "crescent", rotation: -.45 },
  { name: "Eye of the Storm", x: 2600, y: 4050, minRadius: 210, radius: 380, count: 6, types: ["Tempest Oracle"], formation: "ranks", rotation: .15 },
];

export const MOONFEN_CAMPS: SpawnCamp[] = [
  { name: "Firefly Landing", x: 1050, y: 1350, minRadius: 230, radius: 400, count: 6, types: ["Fen Prowler"], formation: "crescent", rotation: -.3 },
  { name: "Glowcap Crossing", x: 3000, y: 900, minRadius: 230, radius: 400, count: 6, types: ["Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Archer", "Glowcap Regent"], formation: "ranks", rotation: .25 },
  { name: "Sunken Bulwark", x: 4100, y: 2350, minRadius: 250, radius: 440, count: 7, types: ["Bog Colossus"], formation: "crescent", rotation: 1.1 },
  { name: "Moonmire Hollow", x: 1000, y: 3600, minRadius: 240, radius: 420, count: 7, types: ["Moonmire Reaper"], formation: "crescent", rotation: -.5 },
  { name: "Wispwater Shrine", x: 2600, y: 4050, minRadius: 210, radius: 380, count: 6, types: ["Wisp Oracle"], formation: "ranks", rotation: .1 },
];
export const CRYSTAL_HOLLOWS_CAMPS: SpawnCamp[] = [
  { name: "Quartz Landing", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Shard Hopper"], formation: "crescent", rotation: .4 },
  { name: "Amethyst Gallery", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Spitter", "Crystal Regent"], formation: "ranks", rotation: -.35 },
  { name: "Geode Bastion", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Geode Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Prismatic Cut", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Prism Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Resonant Vault", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 6, types: ["Hollow Oracle"], formation: "ranks", rotation: .35 },
];
export const CLOCKWORK_RUINS_CAMPS: SpawnCamp[] = [
  { name: "Foundry Gate", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Gear Prowler"], formation: "crescent", rotation: .4 },
  { name: "Rivet Arcade", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Rivet Spitter", "Gear Regent"], formation: "ranks", rotation: -.35 },
  { name: "Ironworks", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Iron Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Scrap Yard", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Scrap Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Dynamo Vault", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 6, types: ["Spark Oracle"], formation: "ranks", rotation: .35 },
];
export const DUSKFALL_ORCHARD_CAMPS: SpawnCamp[] = [
  { name: "Lantern Landing", x: 1100, y: 1450, minRadius: 230, radius: 400, count: 6, types: ["Gourd Prowler"], formation: "crescent", rotation: .4 },
  { name: "Seedling Rows", x: 3000, y: 1000, minRadius: 230, radius: 400, count: 6, types: ["Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Seed Spitter", "Harvest Regent"], formation: "ranks", rotation: -.35 },
  { name: "Hollow Trunk", x: 3750, y: 2450, minRadius: 250, radius: 440, count: 7, types: ["Husk Guardian"], formation: "crescent", rotation: 1.4 },
  { name: "Briar Patch", x: 1050, y: 3300, minRadius: 240, radius: 420, count: 7, types: ["Thorn Reaver"], formation: "crescent", rotation: -.8 },
  { name: "Harvest Shrine", x: 2600, y: 3950, minRadius: 210, radius: 380, count: 6, types: ["Harvest Oracle"], formation: "ranks", rotation: .35 },
];
export const NEON_BASTION_CAMPS: SpawnCamp[] = [
  { name: "Circuit Gate", x: 940, y: 1350, minRadius: 200, radius: 350, count: 6, types: ["Circuit Prowler"], formation: "ranks", rotation: 0 },
  { name: "Pulse Arcade", x: 2900, y: 740, minRadius: 200, radius: 350, count: 6, types: ["Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Pulse Spitter", "Voltage Regent"], formation: "ranks", rotation: 1.57 },
  { name: "Relay Station", x: 3500, y: 2450, minRadius: 220, radius: 380, count: 7, types: ["Relay Guardian"], formation: "crescent", rotation: 1.57 },
  { name: "Arc Foundry", x: 940, y: 3000, minRadius: 200, radius: 350, count: 7, types: ["Arc Reaver"], formation: "ranks", rotation: 0 },
  { name: "Signal Core", x: 2290, y: 3820, minRadius: 180, radius: 330, count: 6, types: ["Signal Oracle"], formation: "crescent", rotation: 0 },
];
export const VERDANT_CATACOMBS_CAMPS: SpawnCamp[] = [
  { name: "Rootfall Vestibule", x: 1120, y: 1380, minRadius: 190, radius: 340, count: 6, types: ["Mossbound Stalker"], formation: "crescent", rotation: .6 },
  { name: "Luminous Gallery", x: 2750, y: 1040, minRadius: 200, radius: 360, count: 6, types: ["Spore Slinger", "Spore Slinger", "Spore Slinger", "Spore Slinger", "Spore Slinger", "Mycelial Regent"], formation: "ranks", rotation: -.3 },
  { name: "Ossuary Vault", x: 3570, y: 2350, minRadius: 220, radius: 390, count: 7, types: ["Ossuary Guardian"], formation: "crescent", rotation: 1.7 },
  { name: "Briar Sepulcher", x: 990, y: 3190, minRadius: 190, radius: 350, count: 7, types: ["Briar Reaver"], formation: "crescent", rotation: -.5 },
  { name: "Mycelium Sanctum", x: 2650, y: 3600, minRadius: 180, radius: 340, count: 6, types: ["Crypt Oracle"], formation: "ranks", rotation: .4 },
];
export const ION_CITADEL_CAMPS: SpawnCamp[] = [
  { name: "Shield Gate", x: 1100, y: 1350, minRadius: 190, radius: 340, count: 6, types: ["Ion Patrol"], formation: "ranks", rotation: 0 },
  { name: "Capacitor Court", x: 2800, y: 1050, minRadius: 200, radius: 360, count: 6, types: ["Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Capacitor Gunner", "Citadel Marshal"], formation: "crescent", rotation: -.25 },
  { name: "Armored Rampart", x: 3550, y: 2480, minRadius: 230, radius: 400, count: 7, types: ["Bastion Defender"], formation: "ranks", rotation: 1.57 },
  { name: "Flux Assembly", x: 1020, y: 3150, minRadius: 200, radius: 360, count: 7, types: ["Flux Enforcer"], formation: "crescent", rotation: -.4 },
  { name: "Reactor Annex", x: 2550, y: 3700, minRadius: 180, radius: 330, count: 6, types: ["Reactor Warden"], formation: "ranks", rotation: 0 },
];

