// Baked from live balance revision 73 (2026-09-25). Values already include campaign tuning
// and reward boosts. Do not multiply them by the old progression reward scales again.
export const BOSS_DAMAGE_REFERENCE = {
  "dragon": 480,
  "spider": 5759.411936994827,
  "frostclaw": 16756.529600881422,
  "magmalisk": 66033.19993650304,
  "gloomroot": 221186.96759149324,
  "tidewyrm": 740895.1054827704,
  "koiShogun": 2481726.4927747804,
  "tempestKirin": 8312872.280249446,
  "miremaw": 27845069.047264617,
  "prismshell": 93270754.57289095,
  "ironhorn": 312422772.0114435,
  "dreadreaper": 1046501541.8636277,
  "voltwarden": 3505395813.730366,
  "gravebloom": 11741788539.590723,
  "aegisPrime": 39330679168.50915
} as const;

export const BOSS_DAMAGE_PROFILES = {
  "dragon": {
    "rain": 96,
    "cone": 480,
    "contact": 192
  },
  "spider": {
    "web": 4113.86566928202,
    "venom": 5759.411936994827,
    "contact": 3291.092535425615
  },
  "frostclaw": {
    "roar": 8378.264800440711,
    "icefall": 11729.570720616995,
    "rift": 16756.529600881422,
    "contact": 7540.43832039664
  },
  "magmalisk": {
    "bite": 66033.19993650304,
    "eruption": 44022.13329100202,
    "contact": 26413.279974601217
  },
  "gloomroot": {
    "sweep": 221186.96759149324,
    "bloom": 154830.87731404527,
    "contact": 110593.48379574662
  },
  "tidewyrm": {
    "surge": 740895.1054827704,
    "whirlpool": 518626.57383793924,
    "contact": 370447.5527413852
  },
  "koiShogun": {
    "slash": 2481726.4927747804,
    "whirlpool": 1737208.5449423462,
    "contact": 1240863.2463873902
  },
  "tempestKirin": {
    "charge": 8312872.280249446,
    "thunder": 5819010.596174612,
    "contact": 4156436.140124723
  },
  "miremaw": {
    "tongue": 27845069.047264617,
    "bogBurst": 19491548.33308523,
    "contact": 13922534.523632308
  },
  "prismshell": {
    "shatter": 93270754.57289095,
    "crystalBurst": 65289528.20102366,
    "contact": 46635377.286445476
  },
  "ironhorn": {
    "shatter": 312422772.0114435,
    "crystalBurst": 218695940.40801042,
    "contact": 156211386.00572175
  },
  "dreadreaper": {
    "shatter": 1046501541.8636277,
    "crystalBurst": 732551079.3045393,
    "contact": 523250770.93181384
  },
  "voltwarden": {
    "shatter": 3505395813.730366,
    "crystalBurst": 2453777069.611256,
    "contact": 1752697906.865183
  },
  "gravebloom": {
    "shatter": 11741788539.590723,
    "crystalBurst": 8219251977.713506,
    "contact": 5870894269.7953615
  },
  "aegisPrime": {
    "shatter": 39330679168.50915,
    "crystalBurst": 27531475417.9564,
    "contact": 19665339584.254574
  }
} as const;
