# Ion Citadel artwork

## Reused enemy

`public/assets/wildstat/enemies/ion-guardian/guardian.svg` is an exact copy of `art-source/reserved/neon-sentries/guardian.svg`, the green shield sentry generated during the original neon enemy set. It has eight frames each for idle, walking, and attacking. The same sprite serves every Ion Citadel stat-farming role, with normal elite sizing where applicable.

`node scripts/build-neon-sentries.mjs` regenerates the original sheets and also writes the active Ion Citadel guardian. The archived copy remains available as provenance. The other four unused designs are prowler, spitter, regent, and oracle. Neon Bastion continues using reaver.

## Boss and terrain

`public/assets/wildstat/aegis-prime-boss-v1.svg` is an original vector command robot with a large shield, mint reactor, ion cannon, and paired capacitor pylons. Its colors and outlines match the original shield sentry. The runtime adds idle motion, charging motion, and damage flashes.

Ground panels and attack telegraphs are drawn in code. The telegraphs share their ranges and timings with `shared/ion-attacks.ts`. No raster generation or external art was used for this expansion.
