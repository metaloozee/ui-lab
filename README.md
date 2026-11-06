# ui-lab

My scratchpad for building interface elements that are fiddly to get right: one-time-code inputs, steppers, forms, meshes. Each one lives on an infinite canvas where I can drag it around, poke at it, and tune it until the motion feels right.

![The ui-lab canvas in dark mode, with a GitHub contributions graph, ASCII bento, wallet, onboarding stepper, and photo delete](docs/canvas.png)

Everything shares one design and motion system. Same tokens, same springs, same hover and press behavior. That consistency is the point. A single good component is easy. A dozen that feel like they belong together takes more work.

## How it works

- Every element is a canvas item, registered in `src/canvas/registry.tsx` with its preview in `src/canvas/previews/`.
- Inspect changes settings live on the real canvas, so I can try a setting without editing code.
- Clicking an item's name copies a prompt with the component, its local imports, and the relevant parts of `DESIGN.md`. Paste it into another project's agent and it rebuilds the element there.

`DESIGN.md` describes the system: colors, type, shapes, motion, interaction. `AGENTS.md` has the rules agents follow when they work here.

## Running it

The project uses [Vite+](https://viteplus.dev).

```sh
vp install
vp dev
```

`vp check` formats, lints, and type checks. `vp test` runs the tests.

## Inspirations

- [Interaction lab by Emil Kowalski](https://x.com/emilkowalski/status/2115789995860517254). This is why the repo exists. Seeing a place built just for experimenting with motion and complex UI made me want my own.
- [Fluid Functionalism](https://fluidfunctionalism.com/). The fluid hover, press motion, and base components come from its registry. The copies here have drifted with local edits.
- [jakubkrehel/skills](https://github.com/jakubkrehel/skills). The agent skills in `.claude/skills` are distilled from these and lean on them heavily.
