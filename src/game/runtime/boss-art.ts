import catalog from "../boss-art.json";
export const BOSS_ART = catalog;
export type RegisteredBossArtId = keyof typeof BOSS_ART;
