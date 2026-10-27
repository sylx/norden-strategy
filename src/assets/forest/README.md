# Woodland atlas

`woodland-atlas.webp` is a generated RGBA atlas (1254 × 1254), created with the built-in image_gen tool. Its original alpha is preserved. No external tree pack is required.

Layout: 2 × 2, top-left oak, top-right beech, bottom-left compact broadleaf, bottom-right spruce. UVs are selected in `Forest.ts`. Trunk bases are approximately 9% above the cell bottom. Lighting is baked from the upper left, matching the map's fixed north-facing camera.

Final generation prompt:

> Use case: stylized-concept. Asset: transparent RGBA game tree atlas, square 2048x2048. EXACTLY FOUR isolated trees arranged in an exact 2 by 2 grid. Each quadrant is a square sprite cell. CRITICAL: each whole tree is at most 65% of its cell width and 75% of cell height. Wide empty transparent gutters between trees. Every trunk base at 85% down its own cell, centered horizontally. No pixels from any tree enter an adjacent quadrant. Upper left: asymmetric spreading oak. Upper right: tall irregular beech. Lower left: compact branching broadleaf oak. Lower right: pointed layered spruce. Elevated orthographic view looking down 50 degrees, clear visible canopy tops with short partially hidden trunks. Detailed hand painted realistic medieval fantasy cartography, muted moss green and forest green leaves, warm olive highlights from upper left, deep cool green undersides. Fine irregular sprays of leaves, ragged edges, tiny gaps and branching, no smooth round lobes, no broccoli, no balloons. Genuinely transparent background. No ground, no shadows on ground, no scenery, no border, no grid, no labels, no text. Trees occupy only their central cell area, plenty of empty padding.

The requested size was 2048 × 2048; the generator returned 1254 × 1254. The renderer uses normalized UVs and does not require power-of-two dimensions (WebGL2).

## Seasonal woodland atlases

`woodland-atlas.webp` is the original summer atlas and the basis for winter's
shader colouring. `woodland-atlas-spring.webp` and `woodland-atlas-autumn.webp`
are generated seasonal edits of that image, made with the built-in image_gen
tool. All three files are 1254 × 1254 RGBA WebPs (converted from the generated PNGs) with the same 2 × 2 species
layout and transparent backgrounds. The evergreen uses the original sprite
throughout the year. Seasonal colour and alpha fade with the terrain's season
weights; spring and autumn do not receive the old foliage recolouring.

Initial in-map previews (same camera, default forest and parchment settings;
the spring preview predates the reduced-blossom revision below):
[spring](../../../docs/image/forest-spring.webp),
[autumn](../../../docs/image/forest-autumn.webp).

The prompts below requested a 1280 × 1280 canvas; the generator retained the
reference's actual 1254 × 1254 dimensions. UVs are normalized, so no resizing is
needed.

### Initial spring generation prompt

```text
Use case: lighting-weather
Asset type: transparent 2x2 woodland sprite atlas for an existing strategy game.
Input image: edit target, original summer atlas. Produce the SPRING version.
Primary request: Paint actual spring flowers and new leaves into the three deciduous tree sprites, rather than a uniform pink tint. Upper left ancient spreading oak: fresh small yellow-green leaves with subtle cream catkins. Upper right tall beech: fresh light green foliage with tiny cream blossoms, airy layered branches. Lower left round flowering broadleaf: abundant delicate pale pink and ivory blossom clusters interspersed with young green leaves and visible brown woody branches. Make distinct petal-shaped dabs and flowering masses that read at small map scale. Lower right evergreen spruce: preserve original green appearance.
Style: exactly match the original detailed hand-painted naturalistic fantasy strategy game trees, warm highlights from upper left, shaded right.
CRITICAL invariants: square 1280x1280 canvas; identical 2x2 layout, species order, tree scale, silhouettes, trunk positions, lighting and perspective. Each cell is 640x640; trunk bases at approximately (320,580), (960,580), (320,1220), (960,1220). Keep sprites isolated, generous transparent gutters, no content crossing cell boundaries. Show full trees down to roots, do not clip crowns. Keep bark natural brown, never pink. True transparent alpha background, including gaps between branches; no opaque backdrop, no checkerboard, no ground plane or cast shadow, no border, no text.
```

### Spring revision prompt (reduced blossoms)

The spring atlas was edited with the built-in image_gen tool to reduce pale
blossom coverage and keep green foliage dominant. No new in-map screenshots
were captured; visual review is left to the user.

```text
Use case: lighting-weather
Asset type: transparent 2x2 tree sprite atlas for a strategy game.
Input image: edit target, the current spring woodland atlas.
Primary request: Make a restrained revision of this spring atlas because it looks too white in a forest on the map. Reduce the amount and brightness of pale flowers; make fresh natural green foliage the dominant impression, while preserving a small spring blossom accent.
Upper-left oak: replace most of the bright cream catkins and pale flower clusters with young moss-green and fresh leaf-green leaves; retain only a few muted, small yellow-green catkins.
Upper-right beech: replace most of the cream blossoms with green leaves; keep only occasional tiny subdued buds.
Lower-left flowering broadleaf: reduce blossom coverage by approximately 60 percent, replacing removed clusters with green leaves. Keep small, scattered soft dusty-pink blossoms nestled among the leaves. At least 80 percent of the crown should read as green foliage. Avoid ivory-white petals and large pale masses. Preserve flower detail and the spring character without an overall whitish canopy.
Lower-right spruce: leave unchanged.
Style: preserve the detailed hand-painted naturalistic fantasy-game artwork, original brushwork, bark and upper-left lighting. Fresh greens with moderate highlights and deep green shadows; no pale yellow wash, no bleached or fluorescent highlights. Do not just darken the entire atlas or tint the bark.
CRITICAL invariants: preserve the input's exact 1254x1254 square canvas, 2x2 sprite arrangement with 627x627 cells, tree species, silhouettes, scale, trunk-base locations and transparent gutters. Keep all trees aligned with the input for drop-in replacement. Preserve natural brown branches and roots, and the existing evergreen sprite. Genuine transparent alpha background and transparent branch gaps. No ground, no scenery, no shadow plane, no text, no border.
```

### Pink blossom revision prompt (current spring texture)

The built-in image_gen tool edited the reduced-blossom spring atlas to make
the flowers rose-pink against the green foliage. Visual review remains manual.

```text
Use case: lighting-weather
Asset type: transparent 2x2 woodland tree sprite atlas, a drop-in game texture.
Input image: edit target, the current green-dominant spring atlas.
Primary request: Make the existing flowers visibly PINK rather than pale cream or whitish, so spring flowers stand out among green leaves at small map scale. Change flower color, keeping the current restrained flower coverage and dominant green foliage.
Lower-left flowering broadleaf: recolor every existing blossom cluster to clear medium rose-pink, with warm pink lit petals and deeper raspberry-pink inner petals and shadows. Pink should remain unmistakably visible when the sprite is small, not fade to white. Slightly strengthen the definition of these existing flower clusters without covering the tree in more flowers. No white/ivory petals.
Upper-left oak and upper-right beech: recolor their small existing flower clusters and buds to subdued but distinct warm pink accents, retaining green leaves. Preserve long yellow-green oak catkins as they are. No pink tint on the leaves.
Lower-right spruce: preserve unchanged.
Constraints: preserve exact input 1254x1254 canvas, 2x2 cells each 627x627, all four tree positions, silhouettes, size, trunk-base alignment, branches, bark, natural green leaves, existing coverage and transparent gutters. Preserve hand-painted detail, original upper-left light direction and shadow depth. Keep brown wood brown and green leaves green; change only blossom colors and definition. True transparent alpha background and transparent gaps between branches. No ground, no background, no text, no border, no shadows on a ground plane. Avoid white highlights on petals, washed-out pastels, neon magenta or a uniformly pink canopy.
```

### Autumn generation prompt

```text
Use case: lighting-weather
Asset type: transparent 2x2 woodland sprite atlas for an existing strategy game.
Input image: edit target, original summer atlas. Produce the AUTUMN version.
Primary request: Paint actual autumn foliage and partial leaf loss into the three deciduous trees. Upper left spreading oak: rich burnt orange and rusty copper leaves, some empty twigs around outer crown and a few crisp fallen leaves gathered tightly against roots. Upper right tall beech: golden ochre and amber leaves with conspicuous transparent gaps showing slender bare branch tips. Lower left round broadleaf: deep crimson and orange foliage with yellow highlights, about one quarter of outer leaves lost so more branches are exposed, a small scattering of fallen red leaves at trunk base. Create leaf-level multicolored detail, natural irregular fading and ragged thinning crowns; do not just tint a summer canopy. Lower right evergreen spruce: preserve original green appearance.
Style: match original detailed hand-painted naturalistic fantasy strategy game trees, warm highlights from upper left, shaded right. Natural rich but restrained autumn colors.
CRITICAL invariants: square 1280x1280 canvas, identical 2x2 layout, species order, tree scale, trunk positions, lighting and perspective. Each cell is 640x640, trunk bases at approximately (320,580),(960,580),(320,1220),(960,1220). Keep each tree in its own cell with transparent gutters and no overlap between cells. Full trees down to roots; maintain original alignment and proportions. Keep bark brown, never orange/red. Fallen leaves sparse and tightly adjacent to roots, not a ground plane. True transparent alpha background including branch gaps, no opaque backdrop, no checkerboard, no grass, no ground shadow, no border, no text.
```
