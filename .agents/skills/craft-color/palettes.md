# Palettes for color-led elements

For elements whose color is the subject, such as a mesh, gradient, chart, or heatmap. Build values with the script, since hand-picked ramps drift.

```bash
node .agents/skills/craft-color/scripts/color.mjs ramp <hue> [--chroma 0.8] [--steps 11]
```

It prints a ramp at one hue, with each step at the given share of what that hue can reach in sRGB. A value that can't fit in sRGB is pulled back to fit.

## What makes a good ramp

- **Hue holds end to end.** A wandering hue reads as two colors blended.
- **Vividness peaks mid-ramp** and falls off toward both ends, which stay short of pure black and white.
- **Steps are finer at the light end:** about 0.04–0.05 of OKLCH `L` apart at the light end, and 0.07–0.10 mid-ramp. Adjacent steps under 0.03 apart are a sign of too many steps.
- **Every step has a job.** Drop any step nothing uses.

## Several hues together

Same step, same brightness: match `L` exactly across hues. Match vividness as a proportion, not a number. Yellow and cyan peak far lower than red and blue, so a copied chroma number makes them look weak or pushes them out of gamut.

## Dark themes

A dark palette isn't the light one reversed. Swap roles first, then lower vividness a step or two, since a confident color on white reads as neon on near-black. Spread the dark end further, because steps that differ as pale backgrounds collapse as dark surfaces. Then re-measure every pair.

## Gradients and meshes

The interpolation space is a look, not a correctness setting:

| Space          | Look                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `in oklab`     | Even brightness across the transition. The default                     |
| `in oklch`     | Stays vivid by traveling around the hue wheel, through hues in between |
| sRGB (default) | Midpoint darkens and mutes                                             |

- **A grey middle** comes from two opposite hues in a rectangular space. Switch to `oklch` or add a stop between them.
- **Long arcs** can bring in hues nobody asked for. Control them with `in oklch shorter hue`.
- **Banding** shows on large low-contrast areas. Widen the contrast, shrink the area, or add subtle noise.
- **Blending many points,** as in a mesh, stays even when each point keeps a similar `L`. A mesh with very different lightness reads as spots rather than a surface.
- **Motion on color** interpolates in the same space, so check the midpoints of the animation as well as its ends.

## Data

- **Categories** need hues that are distinct at a glance and similar in lightness, with a label or shape as backup. Reuse `category-*` when it fits.
- **Ordered values** use a single-hue ramp from light to dark, so more always reads as more.
- **Diverging values** use two hues around a neutral midpoint with matching `L` on each side.
- **Meaning crosses cultures unevenly.** Gains are green in some markets and red in others, so make that a token when it matters.

## Gamut

Stay within sRGB unless the element is about wide color. To go further, declare the sRGB value first, then the vivid one inside `@media (color-gamut: p3)`.
