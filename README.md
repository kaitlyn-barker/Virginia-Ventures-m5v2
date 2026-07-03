# The Factory Floor: Building Virginia's Industry

An interactive WebXR classroom game for 5th graders about the rise of factory work
in post–Civil War Virginia. Students step onto a factory floor, pick a business to
run (textiles, ironworks, or lumber), and manage production, workers, and profit
through a day that moves from **growth** to **competition** to **closing**. It ends
with an **End of Day report** scoring Production Output, Worker Satisfaction, and
Profit.

- **Curriculum anchors:** VA SOL USI.8b, VS.13
- **Session length:** ~25–30 minutes, one class block
- **Runs on:** browser (Chromebook / iPad / desktop) and Meta Quest headsets
- **Built with:** [IWSDK](https://github.com/meta-quest/immersive-web-sdk) 0.4.2 · Vite · TypeScript

Companion to Module 4 (the farming module); the game deliberately contrasts
seasonal farm work with year-round factory production.

---

## Running the project

```bash
npm install
npm run dev        # start the dev server + WebXR emulator, opens the browser
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

Other scripts: `npm run dev:down` (stop the dev server), `npm run dev:status`
(resolved runtime URL/port), `npm run reference:warmup` (download the IWSDK code
reference model once).

**Type-check before testing** — type errors can stop systems from initializing
without a visible console error:

```bash
npx tsc --noEmit
```

Deploys to GitHub Pages automatically via `.github/workflows/deploy.yml` on push to
`main`.

---

## How the game plays

1. **Pick a business.** A welcome card floats in front of the player with three
   choices: textile mill, ironworks, or lumber mill. Each has its own product,
   economics, and personality.
2. **Take the tour.** The foreman gives a short guided walkthrough of the control
   desk (a row of cards) and the readout board.
3. **Run production.** Press **Start Line** to run a batch. Set the **speed** (Slow
   is gentle on the crew and machines; Fast makes more but tires workers and wears
   the machine), **hire** workers, **order** raw materials, **repair** the machine,
   and **expand** the factory.
4. **The day advances in phases**, driven by the foreman's news beats plus two
   run-count gates:
   - **Growth** → after `RUNS_BEFORE_COMPETITION` runs, a rival factory opens and
     **competition** begins (a random setback strikes — a breakdown or a shipment
     delay).
   - After `RUNS_BEFORE_CLOSING` runs, the **closing** whistle can sound and the
     day ends.
5. **End of Day report.** Three scored bands — Production, Worker Satisfaction,
   Profit — plus a short history wrap-up tying the day back to real Virginia
   industry.

---

## Where the tunables live

Everything balance-related is data-driven — **edit config, never hardcode numbers
in systems.** All of it is in `src/environment.ts`:

| What | Where (in `src/environment.ts`) |
| --- | --- |
| Global tunables (`CONSTANTS`) | ~line 108 |
| Business definitions (`FACTORY_TYPES`) | ~line 637 |
| Foreman news beats (`FOREMAN_NEWS`) | ~line 725 |
| Phase gates (`RUNS_BEFORE_COMPETITION` = 4, `RUNS_BEFORE_CLOSING` = 7) | ~line 770 |
| Phase-3 setbacks (`PHASE3_CHALLENGES`) | ~line 799 |
| Report text/scoring (`REPORT_*`) | ~lines 833–946 |
| First-time hints & teaching callouts (`HINTS`, `CALLOUTS`) | ~lines 1032–1075 |
| Guided tour (`TOUR_GOAL`, `TOUR_STEPS`) | ~lines 1076–1157 |
| Control-card map (`CONTROL`) | ~line 1022 |

World-setup tunables (eye height, look sensitivity, and the **VR comfort
settings** — vignette, snap turn, walk speeds, no-jump) live in the `CONSTANTS`
block at the top of `src/index.ts`. **The VR comfort configuration is deliberate
and tested — do not change it.**

---

## Project layout

```
src/
├── index.ts          # World.create() — world setup, floor, mouse-look, VR comfort
├── environment.ts    # everything else: config, components, room, stations,
│                     #   foreman, tutorial, and all game systems (see map below)
├── hud.ts            # the 2D DOM dashboard (mirrors the in-world readout board)
├── sfx.ts            # synthesized sound effects (no audio files — all generated)
└── ui-style.ts       # the shared color palette (DOM HUD + in-world panels)
public/               # (currently empty — the game uses procedural canvas textures)
.github/workflows/    # deploy.yml — GitHub Pages deploy
```

### Inside `environment.ts`

The one large file is organized by banner comments, roughly in this order:

- **Config** — `CONSTANTS`, `ROOM`, `FACTORY_TYPES`, `FOREMAN_NEWS`,
  `PHASE3_CHALLENGES`, `REPORT_*`, hints/callouts, tour text
- **Components** — all `createComponent` definitions
- **Room** — `buildEnvironment`, procedural textures, dust, lighting, props
- **Stations** — control desk, readout board, welcome/choice cards, report board
- **Systems** — `DustSystem`, `PlayerBoundsSystem`, `SetupSystem`,
  `ProductionSystem` (the core game loop), `ForemanSystem`, `TutorialSystem`

> **Note:** this file is large. A planned refactor splits it into per-area modules
> (`config.ts`, `components.ts`, `room.ts`, `stations.ts`, `foreman.ts`,
> `tutorial.ts`, `production.ts`, `systems.ts`) with no behavior change.

---

## Conventions

- **One system per file, with its related components.** No barrel `index.ts`.
- **Import Three.js types from `@iwsdk/core`, never from `three` directly.**
- **Data-driven:** new events, text, and economics go in `CONSTANTS`-style config
  blocks — not inline in systems.
- **Player-facing text at a 4th–5th grade reading level:** short sentences, no
  jargon without a one-line explanation.
- **Quest performance budget:** no new real-time shadow-casting lights, no
  per-frame allocation in `update()`, canvas textures over image files.
- **Test in both browser (mouse + keyboard *and* touch) and the WebXR emulator**
  after each change.

See `CLAUDE.md` for the full IWSDK development guide and best practices.
