# Woodland atlas

`woodland-atlas.png` is a generated RGBA atlas (1254 × 1254), created with the built-in image_gen tool. Its original alpha is preserved. No external tree pack is required.

Layout: 2 × 2, top-left oak, top-right beech, bottom-left compact broadleaf, bottom-right spruce. UVs are selected in `Forest.ts`. Trunk bases are approximately 9% above the cell bottom. Lighting is baked from the upper left, matching the map's fixed north-facing camera.

Final generation prompt:

> Use case: stylized-concept. Asset: transparent RGBA game tree atlas, square 2048x2048. EXACTLY FOUR isolated trees arranged in an exact 2 by 2 grid. Each quadrant is a square sprite cell. CRITICAL: each whole tree is at most 65% of its cell width and 75% of cell height. Wide empty transparent gutters between trees. Every trunk base at 85% down its own cell, centered horizontally. No pixels from any tree enter an adjacent quadrant. Upper left: asymmetric spreading oak. Upper right: tall irregular beech. Lower left: compact branching broadleaf oak. Lower right: pointed layered spruce. Elevated orthographic view looking down 50 degrees, clear visible canopy tops with short partially hidden trunks. Detailed hand painted realistic medieval fantasy cartography, muted moss green and forest green leaves, warm olive highlights from upper left, deep cool green undersides. Fine irregular sprays of leaves, ragged edges, tiny gaps and branching, no smooth round lobes, no broccoli, no balloons. Genuinely transparent background. No ground, no shadows on ground, no scenery, no border, no grid, no labels, no text. Trees occupy only their central cell area, plenty of empty padding.

The requested size was 2048 × 2048; the generator returned 1254 × 1254. The renderer uses normalized UVs and does not require power-of-two dimensions (WebGL2).
