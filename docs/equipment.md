# Equipment Architecture

Wildwood equipment uses two registries so gameplay rules stay server-safe while browser art stays client-only.

Mobile-first rule: validate equipment silhouettes, tap targets, inventory density, profile preview layering, and combat readability on narrow portrait screens first. Desktop must preserve mobile spacing instead of stretching item or Tech Tree layouts.

## Boundaries

- `shared/items.ts`: canonical item IDs, names, slots, acquisition class, stats, weapon behavior, legacy ID migrations, and slot compatibility. Browser and SpacetimeDB both consume this contract.
- `src/game/item-presentation.ts`: inventory art, equipped-world sprites, draw anchors, leg replacements, and projectile visuals. Browser only.
- `src/game/inventory.ts`: owned-item normalization, saved equipment migration, and equip/unequip operations.
- `spacetimedb/src/index.ts`: authoritative ownership grants, persistence validation, and database migrations. Never grant ownership from client-submitted inventory JSON.
- `src/game/player-appearance.ts`: generic registry-driven layer composition. Helmets, chest pieces, feet, and hand items do not need item-specific branches here.

## Adding equipment

1. Add ID and gameplay definition to `shared/items.ts`.
2. Add inventory and world art entry to `src/game/item-presentation.ts`.
3. Add source asset under `public/assets/wildwood/player-parts/` using `art_style.md`.
4. Add authoritative acquisition rule in SpacetimeDB for progression items. Starter and developer catalog classes already have established paths.
5. Add inventory migration only when replacing an existing item ID.
6. Test ownership, slot compatibility, persistence, world rendering, remote-player rendering, and mobile-size inventory readability.

Weapons declare attack mode and projectile kind in shared catalog. Renderer maps projectile kind to visuals; future server combat behavior can consume same definition without trusting client presentation data.
