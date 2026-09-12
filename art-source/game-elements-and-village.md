# Game Elements banners and ForestVillage

## Window titles

Source: `Game Button Elements PSD 03.psd`, `Elements/title_02`.
The three `title_bg` groups contain separate `ribbon` artwork and sample-text groups.
`scripts/art/export-window-banners.py` exports only the ribbon artwork as transparent,
lossless WebP files into `public/assets/wildstat/ui/window-banners/` (about 19 KB total).
Run it with an authoring Python environment containing `psd-tools[composite]`.
The original PSD is retained locally; it is not needed by the game build.

The reusable `.window-banner` style in `public/assets/wildstat/game.css` supplies
the art behind real HTML headings. Current assignments:

All banner colors share a 1055:157 frame, capped at 300 px and 64% of the viewport
width. Title text scales with that frame (7.3% of banner width), preserving the
same text-to-ribbon proportions across windows and screen sizes.

- Guilds / Friends: green.
- Leaderboards: gold.
- Inventory: brown, with the orange ribbon color-matched to the selected Inventory toolbar surface (`#543822`).
- Settings: gray, using a grayscale green ribbon.
- Shop: purple, using a hue-shifted green ribbon.

Filters apply to the decorative background only. Additional colors can use another
CSS modifier or a new export from the editable source layers.

## ForestVillage, reserved for future map work

Source: `2D Minimal World - ForestVillage.unitypackage`.
`scripts/art/catalog-forest-village.py` catalogs the package and extracts the
original PNGs plus Unity sprite metadata to ignored `vendor/forest-village/`.
It does not install or execute the package's Unity scripts.

The local catalog contains 385 PNG assets, including 108 building images,
110 prop images, and the bundled nature sprites. Useful terrain sources:

- `Pack/Forest/ForestVillage/Tile/Cobblestone.png`
- `Pack/Forest/ForestVillage/Tile/Woodfence.png`
- `Pack/Forest/Nature/Common/Tile/Forest_Field.png`
- `Pack/Forest/Nature/Common/Tile/Forest_Road.png`

Keep the `.png.meta` files with their textures: they contain sprite slicing and
pivot information. Composite house presets remain in the original Unity package;
the catalog lists them, but the PNG extraction does not assemble prefab buildings.
No village artwork has been added to a runtime map yet.
