<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# UI Lab Rules

ui-lab is a personal scratchpad for crafting complex interface elements and screens over one design and motion system: meshes, one-time-code inputs, forms, steppers. The owner reviews every detail, so feel, optical balance, and motion are the requirement. Read `DESIGN.md` before UI work.

## Skills

- **`craft-element`:** read it whenever a component arrives, whether as source code, snapshots, or a drawing. It routes each case and builds the canvas item.
- **`craft-motion`, `craft-color`, `craft-details`:** read the matching one before writing that part of any interface.
- **`/explore-variants`, `/break-element`, `/polish-element`:** the owner starts these. Suggest one when it would help.

## Every element, experiments included

- **Fluid hover:** build every hoverable element on `useFluidHover` and `FluidHoverHighlight`. A lone control uses `useSelfFluidHover`.
- **Press:** every interactive element animates when pressed, through `Button` or `pressMotion()`.
- **Meaningful motion:** a state change shows what changed. Selection travels to the new choice, and a popover morphs out of its trigger through `useMorphFromAnchor`, and the toolbar becomes its panels through `useSurfaceMorph`. A fade supports motion and is never the whole animation.
- **Color:** use semantic OKLCH tokens from `src/index.css`. A nested object takes the next shade of its parent's color.
- **Optical balance:** judge controls as a set. Neighboring icons come from one family and read at one visual size, and neighboring text shares one size.
- **Icons:** read them by role with `useIcons()`, free variants only, with roles overridden in `src/lib/icons.ts`.

## The canvas

- **Minimal:** the canvas, toolbar, and Inspect hold only what the owner asked for. Propose any new demo, sample, explainer, or control first.
- **Plain words:** name things by what people recognize, such as "Small moves" rather than `spring.fast`.
- **Inspect:** settings only, applied live to the real canvas.
- **Items rest clear:** a carried item may pass over anything and follows the pointer exactly. It always lands clear of its neighbors.
- **Canvas focus:** the canvas never takes focus. Its shortcuts apply when no control has focus.

## Working here

- **Done means seen:** run it, then hover, press, and drag it in both themes, and look at screenshots and frame samples. Tests prove logic only. Report what you could not judge.
- **Root causes:** when something looks wrong, find why, then check the same class of problem elsewhere.
- **Registry:** install items without `--overwrite`, because our copies carry edits. Then rename their tokens to the roles in `src/index.css`.
