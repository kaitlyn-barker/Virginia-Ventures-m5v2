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
   industry, and a recap of orders/predictions/safety.

---

## Where the tunables live

Everything balance-related is data-driven — **edit config, never hardcode numbers
in systems.** All of it lives in `src/config.ts`:

| What | Where (in `src/config.ts`) |
| --- | --- |
| Room dimensions (`ROOM`) | ~line 17 |
| Global tunables (`CONSTANTS`) | ~line 48 |
| Business definitions (`FACTORY_TYPES`) | ~line 612 |
| Foreman news beats (`FOREMAN_NEWS`) | ~line 698 |
| Phase gates (`RUNS_BEFORE_COMPETITION` = 4, `RUNS_BEFORE_CLOSING` = 7) | ~lines 709–710 |
| Idle-nudge messages (`PACING_NUDGE`) | ~line 714 |
| Phase-3 setbacks (`PHASE3_CHALLENGES`) | ~line 756 |
| Report text/scoring (`REPORT_SCORES`, `REPORT_SUMMARY`, `REPORT_WRAP`, `REPORT_CLOSING`) | ~lines 802–946 |
| Control-card map (`CONTROL`) | ~line 899 |
| First-time hints & teaching callouts (`HINTS`, `CALLOUTS`) | ~lines 917–958 |
| Guided tour (`TOUR_GOAL`, `TOUR_STEPS`) | ~lines 959–988 |

World-setup tunables (eye height, look sensitivity, and the **VR comfort
settings** — vignette, snap turn, walk speeds, no-jump) live in the `CONSTANTS`
block at the top of `src/index.ts`. **The VR comfort configuration is deliberate
and tested — do not change it.**

---

## Project layout

```
src/
├── index.ts          # World.create() — world setup, floor, mouse-look, VR comfort
├── environment.ts    # buildEnvironment() — the composition root that assembles
│                     #   the room and registers every system; re-exports for index
├── config.ts         # all tunable data — economics, news, report text, tour script
├── components.ts     # the ECS tag components the systems query on
├── room.ts           # procedural textures + static scenery/mesh builders
├── stations.ts       # text/card/panel builders (desk, boards, welcome, goal, report)
├── systems.ts        # DustSystem, PlayerBoundsSystem, SetupSystem (+ makeDust, Dust)
├── production.ts     # ProductionSystem — the core game loop
├── foreman.ts        # the foreman figure + ForemanSystem (between-phase news)
├── tutorial.ts       # TutorialSystem — opening goal card + guided tour
├── hud.ts            # the 2D DOM dashboard (mirrors the in-world readout board)
├── sfx.ts            # synthesized sound effects (no audio files — all generated)
└── ui-style.ts       # the shared color palette (DOM HUD + in-world panels)
public/               # (currently empty — the game uses procedural canvas textures)
.github/workflows/    # deploy.yml — GitHub Pages deploy
```

### How the modules fit together

The module graph is a clean DAG — the systems never import each other; they
communicate through `world.globals` flags and shared components.

- `config.ts` and `components.ts` are leaves (pure data / tag definitions).
- `room.ts` → uses `config`, `components`.
- `stations.ts` → uses `config`, `components`, `room`.
- The systems (`systems.ts`, `production.ts`, `foreman.ts`, `tutorial.ts`) → use
  `config`, `components`, `room`, `stations`.
- `environment.ts` sits on top: `buildEnvironment()` builds the static room and
  calls `registerSystem(...)` for every system, so it imports from all the above.

**Convention:** one system per file with its related components; no barrel
`index.ts`. Keep new tunables in `config.ts`, not inline in systems.

---

## QA & dev params

Opt-in URL parameters (in `src/dev.ts`) make a full playthrough testable in
minutes instead of a long real-time session. They are harmless in normal use (a
teacher would have to type them):

| Param | Effect |
| --- | --- |
| `?fast=1` | Shrinks the run gates to 1 / 2, so Phase 3 (competitor) and the End of Day report arrive after just a couple of runs. |
| `?challenge=breakdown` \| `delay` \| `walkout` \| `pricewar` | Forces that Phase-3 setback when the competitor opens, instead of the weighted random pick. |

Combine them, e.g. `…/?fast=1&challenge=walkout`.

**QA script** (run after each phase):

1. **Full mouse playthrough:** tour → a few runs → hire ×2 → order materials →
   expand → force each challenge via `?challenge=` → reach the End of Day report →
   check the report bands match the final board numbers → **Play Again** → pick a
   *different* factory and confirm a clean second run.
2. **Touch** (Chrome device mode) and the **WebXR emulator:** confirm board
   legibility, the touch joystick + drag-look, teleport/snap-turn, and that the
   DOM HUD is absent in-headset (the in-world board carries everything).
3. **Skip-tour path:** verify the "press Start" hint appears and nothing references
   tour state.
4. **Run-dry path:** run materials to 0 → the line refuses with a clear message →
   order → runs again.
5. **Performance:** hold the 72 fps target on Quest-class settings — no long GC
   pauses, no new per-frame allocations.

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
