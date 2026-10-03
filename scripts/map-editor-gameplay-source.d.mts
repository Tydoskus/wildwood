type Point = { x: number; y: number };
type MapDesignDocument = { maps?: Record<string, { name: string; gameplayEdited?: boolean; decor: { type: string; x: number; y: number }[]; gameplay: { arrival: Point; boss: Point; bootsPickup?: Point; portals: unknown[] } }> };

/** The text of shared/map-editor-overrides.ts for a map-designs.json document. */
export function generatedGameplaySource(document: MapDesignDocument): string;
export function upgradeBenchPosition(map: { decor: { type: string; x: number; y: number }[] } | null | undefined): Point | null;
