// =============================================================================
// environment.ts
// -----------------------------------------------------------------------------
// Everything you can SEE but cannot touch lives here: the brick room, the
// timber roof, the glowing windows, the warm lights, the hazy fog, the floating
// dust, and a couple of teal accent details. It is the empty stage set for
// "The Factory Floor: Building Virginia's Industry."
//
// There is no game logic in this file — just scenery. `index.ts` calls
// `buildEnvironment(world)` once, right after the world is created.
//
// IMPORTANT: we import every Three.js building block from "@iwsdk/core" (never
// from "three" directly). Importing from "three" would load a SECOND copy of
// Three.js and cause very confusing bugs.
// =============================================================================

import {
  // --- Core / ECS helpers ---
  World,
  createComponent,
  createSystem,
  Types, // the field types used when declaring a component
  RayInteractable, // tag that marks an entity as clickable by a pointer ray
  Pressed, // transient tag the InputSystem adds while an entity is being clicked
  LocomotionEnvironment, // tag that marks a mesh group as solid ground/walls for locomotion
  EnvironmentType, // STATIC (fixed) vs KINEMATIC (moving) locomotion geometry
  LocomotionSystem, // the built-in movement system; we read its engine to keep the player in bounds
  // --- Three.js building blocks (re-exported by @iwsdk/core) ---
  Group,
  Mesh,
  Object3D,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  PlaneGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Color,
  Fog,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  Points,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  CanvasTexture,
  RepeatWrapping,
  LinearFilter,
  SRGBColorSpace,
  AdditiveBlending,
  DoubleSide,
  Vector3,
} from "@iwsdk/core";

// All the SOUND lives in its own little module, synthesized in code (no audio
// files). We call into it at the moments worth hearing: a run starting, a control
// clicked, a batch sold, the foreman speaking, the closing report.
import { Sfx } from "./sfx.js";

// The shared UI look (cream/navy/gold palette + per-meter icons & colors) and the
// top-left HTML dashboard. Keeping the palette in its own tiny module lets the
// in-world panels here and the DOM dashboard agree on every color.
import { UI, METER_STYLE } from "./ui-style.js";
import {
  createFactoryHud,
  updateFactoryHud,
  setFactoryHudStatus,
} from "./hud.js";

// -----------------------------------------------------------------------------
// ROOM — the shared shape of the building.
// This is exported because `index.ts` needs the same width/length to build the
// walkable floor, and the floor color so the floor matches the walls. Keeping
// the dimensions in ONE place means the walls and the floor can never drift
// out of sync.
// -----------------------------------------------------------------------------
export const ROOM = {
  width: 12, // size of the room left-to-right (the X axis), in meters
  length: 28, // size of the room front-to-back (the Z axis), in meters
  height: 7, // how tall the walls are, floor to ceiling, in meters
  floorColor: 0x5a4632, // plank wood floor — a warm worn brown
};

// The player always spawns at the world origin (0, 0, 0). Instead of trying to
// move the player rig, we slide the WHOLE room so the origin lands near the
// front (+Z) end of the building — `START_INSET` meters in from the near wall —
// with the long axis stretching away toward the far (-Z) wall. So the player
// begins at one end, looking down the length of the factory. (The origin is
// also where the foreman's control station will go in a later step.)
export const START_INSET = 2; // meters from the near wall to the player's start
export const ROOM_CENTER_Z = -(ROOM.length / 2 - START_INSET); // where the room's center sits in the world

// The factory is an enclosed building — the player must never leave it. These
// two numbers tune the "keep the player inside" safety layers (the inner bounds
// in CONSTANTS.bounds below are derived from them):
//   WALL_INSET  — how far INSIDE the brick walls the invisible barrier + the
//                 safety-net clamp sit, so the player stops with a small gap
//                 before the wall instead of with their face in the bricks.
//   FLOOR_MARGIN — how far the walkable floor extends BEYOND the walls, so there
//                 is always solid ground under the player, even right at a wall.
export const WALL_INSET = 0.5; // meters of clearance kept between the player and the walls
export const FLOOR_MARGIN = 1.0; // meters of extra walkable floor past the walls (hidden behind them)

// -----------------------------------------------------------------------------
// CONSTANTS — every other tunable number for the scenery, in one place.
// Want a warmer room, a hazier far wall, or more dust? Change it here.
// -----------------------------------------------------------------------------
const CONSTANTS = {
  // --- Play area: the inner bounds the player is kept inside (WORLD coords) ---
  // The smallest and largest X (side to side) and Z (front to back) the player
  // can reach, plus the floor height they stand on. The invisible wall barrier
  // and the PlayerBoundsSystem safety net both keep the player within these.
  // Tweak any line to grow or shrink the walkable play area later. (They are
  // derived from ROOM + WALL_INSET so they stay lined up with the brick walls by
  // default — replace an expression with a plain number to override it.)
  bounds: {
    minX: -ROOM.width / 2 + WALL_INSET, // left edge of the play area (world X)
    maxX: ROOM.width / 2 - WALL_INSET, // right edge of the play area (world X)
    minZ: ROOM_CENTER_Z - ROOM.length / 2 + WALL_INSET, // far edge (toward -Z)
    maxZ: ROOM_CENTER_Z + ROOM.length / 2 - WALL_INSET, // near edge (toward +Z)
    floorY: 0, // floor surface height — the player stands here (world Y)
  },

  // --- Colors (hex, like CSS #rrggbb but written 0xrrggbb) ---
  brickColor: 0x8a4636, // warm red-brown brick for the walls
  beamColor: 0x4a3422, // dark timber for the roof and its beams
  windowColor: 0xf0c178, // warm honey glass that glows with daylight
  glassFrameColor: 0x3a2817, // dark wood trim around each window
  dustColor: 0xe8e4dc, // off-white motes floating in the air
  tealColor: 0x1b6a6a, // course accent color (ties Module 5 to the rest)
  fogColor: 0x6e4d3a, // hazy warm air at the far end of the room

  // --- Key light: the "sun coming through the windows" ---
  sunColor: 0xffdca8, // warm golden light
  sunIntensity: 2.6, // how strong the key light is
  sunPosition: [-7, 10, 9] as [number, number, number], // up high, off to one side, so it rakes across the walls

  // --- Fill light: gentle sky/ground bounce so nothing is pure black ---
  hemiSkyColor: 0xffe9cf, // soft warm light from above
  hemiGroundColor: 0x40301f, // dim warm bounce from the floor
  hemiIntensity: 1.0, // how strong the soft fill is

  // --- Shadows (tuned to run well on the Quest, same as the farm module) ------
  // Only the main DirectionalLight (the "sun") casts shadows — point-light
  // shadows are expensive, so the warm glows below stay shadowless. One mid-size
  // shadow map covering the whole room is cheap and reads as a soft grounding.
  shadowMapSize: 1024, // shadow texture resolution (1024² is plenty AND Quest-friendly)
  shadowBias: -0.002, // nudge the shadow back a hair so flat walls/floor don't speckle
  shadowExtent: 24, // half-size of the shadow camera box — big enough to cover the whole room
  shadowNear: 1, // nearest distance the shadow camera sees
  shadowFar: 80, // farthest distance the shadow camera sees

  // --- Warm local light: a few small PointLights that pool warm amber light in
  //     places (by the main machine, near the windows), so the room feels lit
  //     from within, not just flatly. Kept LOW intensity and FEW so the Quest
  //     stays smooth; none of them cast shadows.
  warmLightColor: 0xf0a050, // soft amber for every local pool of light
  machineLightIntensity: 9, // glow by the main machine (doubles as its "furnace opening" glow)
  machineLightDistance: 7, // how far that machine glow reaches before fading to nothing
  machineLightHeight: 1.1, // how high off the floor the machine glow sits (low, at the opening)
  machineLightForward: 0.5, // how far in FRONT of the machine the glow sits (toward the player)
  windowLightIntensity: 6, // glow near the windows
  windowLightDistance: 9, // how far each window glow reaches before fading
  windowLightHeight: 2.6, // how high the window glows sit off the floor (near the panes)
  windowLightInset: 1.6, // how far in from the side walls the window glows sit

  // --- Fog: makes the far wall melt softly into the air ---
  fogNear: 6, // closer than this, the air is perfectly clear
  fogFar: 30, // farther than this, surfaces fade fully into haze

  // --- Windows ---
  windowWidth: 1.8, // width of each pane, in meters
  windowHeight: 3.2, // height of each pane, in meters
  windowSill: 1.4, // height of the bottom of each window off the floor
  windowsPerSide: 4, // how many windows run along each long wall
  windowEmissive: 0.95, // how brightly the glass glows on its own

  // --- Soft pools of light on the floor beneath the windows ---
  poolWidth: 3.6, // size of each light pool across the floor (X)
  poolDepth: 2.6, // size of each light pool into the room (Z)
  poolOpacity: 0.55, // how strong the glow is (0 = invisible, 1 = full)

  // --- Roof beams ---
  beamCount: 7, // number of cross-beams along the length of the roof
  beamHeight: 0.4, // how tall each beam is
  beamThickness: 0.3, // how thick each beam is

  // --- Drifting dust ---
  dustCount: 260, // how many motes float in the air
  dustSize: 0.04, // size of each mote
  dustOpacity: 0.3, // how visible the motes are (kept subtle)
  dustRiseMin: 0.05, // slowest upward drift speed (meters/second)
  dustRiseMax: 0.18, // fastest upward drift speed (meters/second)
  dustSwirl: 0.02, // how fast the whole cloud slowly turns

  // --- Set dressing: extra props that make the shell read as a real factory ---
  // Built from the same textured boxes and cylinders as the rest of the room.
  // The SOLID pieces (wall columns, corner crates, barrels) hug the walls and
  // get real collision, so the player bumps into them instead of ghosting
  // through; the light shafts and hanging lamps are pure glow (no collision,
  // no extra real lights — Quest-friendly).
  props: {
    columnWidth: 0.42, // timber wall column size along the wall (meters)
    columnDepth: 0.34, // how far each column sticks out from the brick
    crateSize: 0.62, // the corner stockpile crates (cubes, this big)
    barrelRadius: 0.3, // the corner barrels
    barrelHeight: 0.72,
    barrelColor: 0x6b4a2f, // barrel wood (matches the line's structural timber)
    bandColor: 0x2f2a26, // the dark iron hoops around each barrel
    shaftOpacity: 0.12, // window light shafts: soft, additive (0 = none, 1 = solid light)
    shaftInward: 2.0, // how far into the room a shaft's foot lands (matches the floor pools)
    lampShadeColor: 0x35302b, // dark metal of the hanging lamp shades + cords
    lampGlowColor: 0xffd9a0, // the warm bulb + its halo
    lampShadeY: 3.4, // how high the lamp shades hang off the floor
    lampXs: [-3, 0, 3], // where the lamps hang along the production line (line X)
    lampHaloSize: 0.9, // the soft glow square around each bulb (meters)
    lampHaloOpacity: 0.5,
  },

  // --- Production line (scenery only — no motion yet) ---
  machineIronColor: 0x3a3f44, // dark cast iron for the machine
  lineTimberColor: 0x6b4a2f, // pale structural timber for plinths and pallets
  conveyorColor: 0x2b2e31, // dark conveyor belt body
  slatColor: 0x4a4f54, // slightly lighter slats across the belt
  binColor: 0x7a5a32, // raw-materials bin wood
  crateColor: 0x7a5a32, // finished-goods crate wood
  beltHeight: 0.8, // height of the belt surface off the floor, in meters
  conveyorLength: 7.0, // how long the belt is, left to right (the X axis)
  intakeX: -4.3, // left end of the line: raw materials come in here
  outputX: 4.4, // right end of the line: finished goods collect here
  lineCenterZ: ROOM_CENTER_Z + 3, // a few meters in front of the player, near room center

  // --- Foreman's control station (a desk + FOUR clickable control cards) ---
  deskWoodColor: 0x6e4a2b, // sturdy warm oak for the desk
  deskZ: -2.1, // how far in front of the player the desk sits (meters, toward -Z). Pulled back from -1.5 so the control cards aren't crammed at the bottom of the view — they sit comfortably in front without the player having to step back to use them.
  deskWidth: 3.9, // desk size left-to-right (X) — widened to seat six cards
  deskHeight: 0.95, // desk top height — about waist height — floor to top
  deskDepth: 0.62, // desk size front-to-back (Z)
  consoleTilt: 0.7, // how far the top + cards tip UP toward the player (radians)
  cardWidth: 0.56, // width of each control card
  cardHeight: 0.36, // height of each control card
  cardSpacing: 0.62, // distance between card centers across the console
  cardLift: 0.07, // how far the cards float above the desk top
  cardTextColor: 0xf4ecd6, // cream label text on the cards
  startCardColor: 0xc77d2a, // warm amber for the "Start Line" card, so the GO button stands out from the teal ones

  // --- Readout board (the live meters, mounted above the production line) ---
  boardColor: 0xf3e9d6, // parchment panel
  boardTextColor: 0x1f3a5f, // navy text + bar outlines
  boardTrackColor: 0xd9c9a8, // the empty part of each meter bar (muted tan)
  boardWidth: 4.4, // board size left-to-right (X) — trimmed so it doesn't loom/clip in the browser's narrower view
  boardHeight: 2.4, // board size up-and-down (Y) — sized to carry the five meters
  boardY: 4.25, // how high the board hangs off the floor (lowered a touch so its top stays in view)
  boardTilt: 0.12, // tip the board down a little so it faces the player below (radians)
  boardHighlightColor: 0xf6b73c, // bright gold flash behind a score the instant it changes (fades out)
  // The six meters and their STARTING numbers. `fill` is how full the bar is
  // (0 = empty, 1 = full). Raw Materials starts full; the ProductionSystem drains
  // it as the line runs and the "Order Materials" control refills it. Price is
  // seeded to the chosen business's selling price when the board appears (see
  // placeReadoutBoard) and DROPS when a competitor opens nearby in Phase 3.
  //
  // "Costs" and "Profit" replace the old "Profit Margin %": they show the COIN
  // breakdown of each run's sale — of every batch you sell, this many coins go to
  // costs (materials, wages, recent one-time costs) and this many are profit. They
  // always add up to the sale (revenue = costs + profit), so each bar shows that
  // part's SHARE of the sale while the number shows the actual coins. Seeded to a
  // reference 100-coin sale at the starting margin (see CONSTANTS.profitDisplay).
  readouts: [
    { label: "Production Output", value: "120", fill: 0.55 },
    { label: "Raw Materials", value: "120", fill: 1.0 },
    { label: "Worker Satisfaction", value: "68%", fill: 0.68 },
    { label: "Price", value: "$8", fill: 0.4 },
    { label: "Costs", value: "$78", fill: 0.78 },
    { label: "Profit", value: "$22", fill: 0.22 },
  ],

  // Seeds for the Costs/Profit meters before the first run (a reference sale, so
  // the dashboard looks populated). The margin (profit share) matches the old
  // Profit Margin seed; the line's first run replaces these with real numbers.
  profitDisplay: {
    seedRevenue: 100, // coins of the reference sale used to seed Costs/Profit
    seedMargin: 0.22, // starting profit share of a sale (0..1)
  },

  // --- Name-tags on the production line (intake / machine / output) ---
  // Small teal tags, in the same crisp style as the control cards. They start
  // with generic words ("Material" / "Machine" / "Product") and get filled in
  // with the chosen business's material, machine, and product when the student
  // picks a business in the opening Setup phase.
  labelTextColor: 0xf4ecd6, // cream text on the teal tags (matches the cards)
  machineLabelW: 1.0, // machine name-tag size, in meters
  machineLabelH: 0.32,
  ioLabelW: 0.86, // intake / output name-tag size, in meters
  ioLabelH: 0.3,

  // --- Opening Setup: the welcome screen (pick-a-business) ---
  // The welcome floats directly in front of where the player spawns (the world
  // origin), centered near eye height and facing the player. It sits far enough
  // back to read as a contained panel with margins around it (not edge-to-edge
  // filling the whole view). Move it toward 0 to make it bigger/closer, or more
  // negative to make it smaller/farther. Every number here is easy to nudge.
  // Pushed back far enough that the WHOLE welcome (modal + cards) fits inside the
  // browser's narrower view on load — at -2.8 the modal's top spilled above the
  // top of the screen. The panel + cards are also centered around eye height
  // (~1.6 m) so there's even margin top and bottom.
  welcomeZ: -3.6, // how far ahead the welcome floats, in meters (toward -Z)
  // The welcome is ONE cream "modal" card up top (eyebrow + big title + an amber
  // inner box) with the three business cards in a row beneath it.
  welcomePanelW: 3.7, // the modal header card's size (meters)
  welcomePanelH: 1.0, // trimmed (was 1.2) so the card hugs its text — see makeWelcomePanel
  welcomePanelY: 2.4, // height of the modal header card's center off the floor
  choiceY: 0.95, // height of the row of choice cards off the floor (just below the modal)
  choiceW: 0.95, // each choice card's size (meters)
  choiceH: 1.45,
  choiceGap: 1.05, // distance between choice-card centers, left to right (X)

  // --- Production loop (the core game: set the speed, then run the line) -----
  // The three machine-speed settings the "Machine Speed" card cycles through.
  // Each setting bundles everything that speed affects, so the whole feel of a
  // setting can be balanced in one place:
  //   multiplier        — how many products one run makes, as a multiple of the
  //                       business's `throughput` (Slow ×1, Medium ×2, Fast ×3)
  //   runSeconds        — how long one run takes (faster setting = quicker run)
  //   beltSpeed         — how fast the belt slats scroll during a run (the look)
  //   marginBonus       — how much the speed nudges the Profit Margin up or down
  //                       (running flat-out earns a little more per batch)
  //   satisfactionDrift — how Worker Satisfaction drifts each run at this pace:
  //                       a calm pace lifts spirits (+), flat-out strains them (−)
  //   strainsCrew       — true for the hardest pace; running it run after run
  //                       wears the crew down more and more (see fastStreakPenalty)
  //   wearAdd           — how much this pace wears the MACHINE each run: Fast piles
  //                       on wear (a breakdown grows likely), Slow lets it recover (−)
  speeds: [
    { label: "Slow", multiplier: 1, runSeconds: 4.0, beltSpeed: 0.9, marginBonus: -0.05, satisfactionDrift: 0.06, strainsCrew: false, wearAdd: -0.04 },
    { label: "Medium", multiplier: 2, runSeconds: 3.0, beltSpeed: 1.7, marginBonus: 0.0, satisfactionDrift: 0.03, strainsCrew: false, wearAdd: 0.03 },
    { label: "Fast", multiplier: 3, runSeconds: 2.0, beltSpeed: 2.8, marginBonus: 0.06, satisfactionDrift: -0.06, strainsCrew: true, wearAdd: 0.12 },
  ] as SpeedSetting[],
  defaultSpeedIndex: 0, // start on "Slow" so speeding up feels like a real choice

  outputMax: 220, // the Production Output value that fills the bar all the way (matches the board's starting 120 / 0.55 look)
  priceMax: 20, // the Price value that fills the Price bar all the way (the priciest business, Ironworks, starts at 16 coins)
  scoreTweenSeconds: 0.7, // how long a score glides from its old number to its new one
  highlightSeconds: 1.0, // how long the gold flash behind a changed score lingers

  // The little finished good that rides the line during a run.
  productSize: 0.34, // size of the traveling good (a small cube), in meters
  rawMaterialColor: 0xb8a07a, // pale tan — the good looks like raw material until it passes the machine, then turns the business color

  // A soft halo that glows around the finished good as it reaches the output
  // crate, so the moment a good is "done" catches the eye. A finishing touch only
  // — it never changes what a run makes.
  goodGlow: {
    size: 2.6, // halo diameter as a multiple of the good's size (a soft aura around the cube)
    maxOpacity: 0.8, // how bright the halo gets right at the output (0 = none, 1 = full)
    startFrac: 0.6, // how far along the line (0 = intake, 1 = output) the glow begins to swell
  },

  // The farm-vs-factory note that appears under the board after a run.
  noteWidth: 4.4, // note panel size, in meters
  noteHeight: 1.0,
  noteY: 2.55, // height of the note off the floor (just below the readout board)
  noteForward: 1.4, // how far the note floats toward the player from the board's depth. Pulled well forward (was 0.5) so it sits clearly IN FRONT of the machine — at 0.5 the machine's hopper/drum stuck toward the player and rendered through the note's lower text.
  noteFadeSeconds: 0.5, // how long the note takes to fade in the first time

  // --- Workforce: the "Hire Worker" control puts people on the line ----------
  // Each hire drops a simple worker figure (boxes + cylinders) at the next open
  // station along the front of the belt, raises how much a run can make, and adds
  // a little wage cost that trims the Profit Margin. The cap keeps the floor tidy
  // — it limits BOTH the workers and the stations they stand at.
  maxWorkers: 6, // most workers (and stations) the floor will ever hold
  workerOutputPerRun: 6, // extra goods each worker adds to a run (more hands, more made)
  workerWageMargin: 0.02, // how much each worker's wages trim the Profit Margin (a little each)
  workerKeepUp: 6, // goods of machine pace one worker can comfortably keep up with

  // Where the workers stand: a single neat row just in front of the conveyor,
  // evenly spaced left-to-right and filled as you hire. These are line-local
  // numbers (the line group sits at lineCenterZ), so +Z is toward the player.
  workerStationMinX: -3.6, // leftmost station (just past the intake)
  workerStationMaxX: 3.6, // rightmost station (just shy of the output crate)
  workerStationZ: 0.95, // how far in front of the belt the row stands, toward the player

  // The little worker figure, built from a few boxes and cylinders (meters). Its
  // origin is at the feet, so placing it at floor level (y = 0) stands it upright.
  workerClothesColor: 0x3e5266, // denim-blue work coveralls (stands out from the warm room)
  workerHeadColor: 0xd9b38c, // tan head
  workerCapColor: 0x1b6a6a, // teal cap (the course accent color)
  workerLegRadius: 0.075, // leg cylinder radius
  workerLegHeight: 0.5, // leg cylinder height
  workerLegSpread: 0.1, // half the gap between the two legs
  workerTorsoWidth: 0.36, // torso box size
  workerTorsoHeight: 0.5,
  workerTorsoDepth: 0.22,
  workerArmRadius: 0.06, // arm cylinder radius
  workerArmHeight: 0.46, // arm cylinder height
  workerHeadSize: 0.22, // head box (a cube)
  workerCapRadius: 0.16, // cap cylinder radius
  workerCapHeight: 0.07, // cap cylinder height

  // --- Worker Satisfaction: how happy the crew is with how you run things -----
  // It starts from the readout above and shifts a little after every run: a calm,
  // well-staffed pace lifts it; pushing Fast (especially run after run) or running
  // short-handed drags it down. The drift per pace lives in `speeds` above; these
  // are the extra penalties and the band the score stays within.
  fastStreakPenalty: 0.05, // extra drop for each Fast run in a row beyond the first
  understaffPenalty: 0.05, // drop per worker the run is short of what its pace needs
  satisfactionMin: 0.05, // never quite empties...
  satisfactionMax: 0.99, // ...nor quite fills
  safetyNoteThreshold: 0.4, // show the worker-safety note the first time satisfaction falls below this

  // --- Raw materials: the supply the line eats as it runs --------------------
  // The line turns raw material into product one-for-one, so a run uses as many
  // units as it makes. Stock drains every run and the "Order Materials" control
  // tops it back up for a cost (a dip in Profit Margin). Run dry and the line
  // cannot produce until you reorder — the supply chain made visible.
  materials: {
    start: 120, // units of raw material in stock at the start (matches the board's "120")
    max: 120, // a full Raw Materials meter
    orderMarginCost: 0.06, // how much one order trims Profit Margin (you spent coins to restock)
    lowThreshold: 30, // at/below this the stock is "running low" — triggers the one-time supply teaching note (display only; no effect on the run/scores)
  },

  // --- Machine wear + breakdowns: the cost of running fast -------------------
  // Each run adds the pace's `wearAdd` to a hidden wear level; the chance of a
  // breakdown each run is the business's own breakdownRisk PLUS that wear. So
  // pushing Fast makes a breakdown grow likely "later," while easing off (Slow's
  // negative wearAdd) lets the machine recover. A breakdown costs you the batch.
  breakdown: {
    maxChance: 0.85, // wear can raise the breakdown chance up to here (never a sure thing)
    seconds: 1.8, // how long the machine is down (a short stall) when it breaks
    marginCost: 0.08, // repairs trim Profit Margin (recovers over later runs)
    satisfactionHit: 0.06, // a breakdown frustrates the crew a little
    lightColor: 0xd23b2a, // the warning-red the gauge lamps flash while it is down
    blinkSpeed: 14, // how fast the warning lamps pulse while down
  },

  // --- Expand the Line: the one-time big scaling decision --------------------
  // Unlocked by the foreman's "demand is rising" news. It costs an upfront
  // investment (a margin dip) and pays NOTHING for a few runs while it is built —
  // then every run makes a chunk more, for good. Slow to start, strong to finish.
  expand: {
    runsToPayoff: 3, // runs the expansion is "under construction" before it helps
    outputBonus: 14, // extra goods every run makes once the expansion is finished
    marginCost: 0.05, // upfront investment — Profit Margin dips when you start it
  },

  // How fast any one-time cost (an order, a repair, the expansion investment)
  // heals back out of Profit Margin over later runs, so the factory recovers.
  costRecover: 0.02, // margin the cost burden eases off by each finished run

  // --- Phase 3: a competitor opens nearby (prices fall) + a random challenge --
  // When the foreman delivers the Phase 3 news, a rival factory has opened down
  // the road, so we must drop our price to keep buyers (the Price meter falls,
  // which squeezes the Profit Margin on the next run). At the SAME moment ONE
  // random challenge strikes — chosen once, the way the farming module rolls a
  // random market event — and the student copes with it using the controls they
  // already have. Every number for the price cut and both challenges lives here.
  competition: {
    priceDrop: 0.25, // how far the selling price falls when the rival opens (25% off)

    // — MACHINE BREAKDOWN challenge — the machine stops with a puff of smoke and
    //   an amber warning lamp; the new "Repair" control fixes it after a moment.
    repairSeconds: 2.0, // how long the Repair control takes to fix the machine
    repairMarginCost: 0.1, // repairs cost a little Profit Margin (recovers over later runs)
    warningColor: 0xf0a020, // gentle amber warning lamp while it is down (warm, not an alarming red)
    warningBlinkSpeed: 6, // a slow, calm pulse for the warning lamp (kid-friendly)
    smokeColor: 0xb4b4b4, // soft grey smoke
    smokeAt: [0, 1.6, 0.7] as [number, number, number], // where the smoke rises from (line-local): just in FRONT of the machine, low enough to clear the status note above and the tall readout board behind, so it stays visible AND readable from the desk
    smokePuffs: 4, // how many little smoke puffs rise off the machine
    smokeRadius: 0.13, // size of each puff (meters)
    smokeRise: 0.4, // how far a puff drifts up before it fades and restarts (meters) — kept short so it stays a small puff under the note
    smokeGrow: 0.6, // how much a puff swells as it rises
    smokeMinScale: 0.5, // a puff's size the instant it appears
    smokeOpacity: 0.5, // a fresh puff's see-through-ness (it fades to 0 as it rises)
    smokeRate: 0.4, // how quickly the puffs cycle (slow = lazy curls of smoke)

    // — DELAYED SHIPMENT challenge — raw materials drop sharply, and every reorder
    //   now takes a while to arrive (a shipment in transit) for the rest of the phase.
    shipmentLoss: 0.7, // chunk of a FULL stock lost the moment the delay hits (a sharp drop)
    orderDelaySeconds: 4.0, // how long a reordered shipment now takes to arrive
  },

  // --- The foreman: a stationary figure beside the desk who delivers news ----
  // Built simply like the workers, in a brown coat + hat so he reads as the boss.
  // He stands just past the right end of the control desk and shares news through
  // a small speech panel above him. Step up to him (within `range`) or click his
  // "Next" prompt card to hear the next beat. His first beat: demand is rising.
  foreman: {
    // Moved out from beside the desk to a spot clearly IN the player's forward
    // view (he used to sit ~60° off to the right, easy to miss). He now stands a
    // few meters ahead on the right of the floor, facing the player, so he reads
    // as overseeing the line and is always in sight.
    x: 1.3, // world X: to the right, but comfortably inside the (narrower browser) view cone
    z: -4.0, // world Z: a few meters ahead, beyond the desk (open floor)
    range: 2.2, // step within this many meters of him to hear the next news beat — generous enough that landing on his gold floor ring (see spotOffset) counts
    coatColor: 0x6e4a2b, // warm brown coat (the desk-oak tone — clearly the boss, not a worker)
    hatColor: 0x2e1f14, // dark brown hat
    hatBrimRadius: 0.2, // wide brim of the foreman's hat
    hatCrownRadius: 0.14, // the rounded crown on top
    hatCrownHeight: 0.16, // how tall the crown sits
    clipboardColor: 0xe8dcc0, // the pale clipboard he holds in front
    panelWidth: 1.7, // his speech panel size (meters)
    panelHeight: 1.0,
    panelX: 0.7, // shift the speech bubble to his upper-RIGHT (local meters). He stands at x1.3 (center-right); a centered bubble overlapped the readout board + status note, so it's nudged right into the clear wall space beside them.
    panelY: 2.15, // panel height above his feet (floats over his head)
    panelFadeSeconds: 0.5, // how long the panel takes to fade in the first time
    promptWidth: 0.62, // the clickable "Next" prompt card beside him
    promptHeight: 0.36,
    promptX: 1.3, // world X of the prompt card (lined up with the foreman)
    promptY: 1.3, // chest height, easy to click
    promptZ: -3.3, // a little toward the player from the foreman (foreman.z + 0.7), so it is clickable

    // The glowing "stand here" ring on the floor beside him — a clear landing
    // target for the hop (teleport), so finding him is never a puzzle. It sits
    // well to his RIGHT (world x 3.2, on the open floor past the desk's right
    // edge) because at standing eye height the desk hides everything nearer:
    // the sight line from spawn only clears the desk's right edge (x 1.95)
    // for floor spots at roughly x 3 or beyond. Standing on it also gives a
    // clear view OF him, and it stays inside his (widened) news `range`.
    spotRadius: 0.55, // ring radius on the floor (meters)
    spotOffset: [1.9, 0.4] as [number, number], // where the ring sits, relative to his feet (local X toward his right, local Z toward the player)
    spotColor: 0xf6b73c, // warm gold — the same "this is your next step" color as his button
    spotOpacity: 0.9, // bright enough to read as a target even on shadowed planks
  },

  // --- End of Day Production Report: the foreman's closing wrap-up board ------
  // When the foreman calls the end of the day, a clean report board fades in
  // front of the player showing the three FINAL scores (read straight from the
  // live board) with a short, encouraging line for each. These numbers are only
  // the board's SIZE, PLACE, and LOOK — the wording and the score bands live in
  // their own clearly-labeled lists (REPORT_SCORES + REPORT_SUMMARY) further down.
  report: {
    width: 4.2, // report board size left-to-right (meters) — widened so the longer history lines fit on few lines
    height: 2.4, // report board size up-and-down (meters) — fits the per-score history line + the closing band while staying above the desk
    y: 2.3, // how high the board floats off the floor — raised so the whole board (incl. the bottom closing band) clears the desk in front of the player and is not occluded by it
    z: -3.8, // how far in front of the player it hangs (meters, toward -Z) — pulled just IN FRONT of the foreman (z -4.0) so his figure can't poke over the report's bottom-right corner
    fadeSeconds: 0.6, // how long the report takes to fade in the first time
    titleColor: 0x1b6a6a, // teal title band across the top (the course accent)
    titleTextColor: 0xf4ecd6, // cream title text on the teal band
    summaryColor: 0x1b6a6a, // teal summary band across the bottom (ties it together)
    summaryTextColor: 0xf4ecd6, // cream summary text on the teal band
  },

  // --- Celebration: a burst of confetti when the day's report appears ---------
  // The end-of-day report is the game's "you did it!" screen — the confetti
  // makes it FEEL like one. One Points object (a single draw call), built when
  // the report fades in, animated with simple gravity, then disposed.
  celebration: {
    count: 130, // how many confetti flecks burst out
    size: 0.05, // each fleck's size (meters)
    riseSpeed: 2.4, // the upward pop, in m/s (flecks jump UP first, then rain down)
    spread: 1.6, // sideways scatter speed, in m/s
    gravity: 3.2, // how hard the flecks are pulled back down
    seconds: 2.8, // how long the shower lasts before it fades away
    colors: [0xf6b73c, 0x1b6a6a, 0x3d78c8, 0x4e9a51, 0x8a5fb8], // gold, teal, blue, green, purple — the dashboard's own meter palette
  },

  // --- Gentle guidance: a "breathing" pulse on the control to use next --------
  // So a brand-new player always knows what to do, the single most useful control
  // right now slowly grows and shrinks, like a calm breath. This is presentation
  // only — it never clicks anything for the student, it just points the eye.
  guidance: {
    pulseRate: 1.7, // how fast the breathing goes (radians/second — about one breath every ~3.5s)
    pulseDepth: 0.06, // how much the card grows and shrinks at the extremes (0.06 = ±6%)
  },

  // --- First-time hints: one short line at a time, then they fade away --------
  // A small parchment banner that floats just above the desk. The ProductionSystem
  // shows a brand-new player the next thing to do, one line at a time; each hint
  // holds for a moment and fades. After the last one, the breathing pulse alone
  // carries the guidance, so the floor never stays cluttered with text.
  hints: {
    width: 2.0, // banner size left-to-right (meters) — a touch smaller + high-res, so it's crisp and less in-your-face
    height: 0.35, // banner size up-and-down (meters) — same proportions as before, just smaller
    y: 1.55, // how high it floats off the floor (just above the desk top)
    forward: 0.45, // how far toward the player it sits from the desk (meters)
    fadeIn: 0.4, // seconds to fade a hint in
    hold: 4.5, // seconds to keep it fully readable
    fadeOut: 0.7, // seconds to fade it back out before the next one
  },

  // --- The opening goal card + the foreman's guided tour ----------------------
  // Right after a business is picked, a "Your Factory, Your Goal" card floats in
  // front of the player on the still-clear floor (the cockpit has not appeared
  // yet). "Start the tour" reveals the cockpit and the foreman walks the student
  // through the controls one line at a time; "Skip tour" jumps straight to the
  // game. Every size/place here is easy to nudge; the words live in TOUR_GOAL and
  // TOUR_STEPS further down, and the whole flow is driven by the TutorialSystem.
  tour: {
    // The goal card panel (text only) — floats where the welcome did, on the
    // clear floor, so nothing overlaps it.
    goalPanelW: 3.8, // panel size left-to-right (meters)
    goalPanelH: 2.8, // panel size up-and-down (meters)
    goalPanelY: 2.35, // center height off the floor
    goalPanelZ: -3.6, // how far ahead it floats (toward -Z)

    // The two buttons beneath the goal card (their own clickable entities).
    startButtonW: 1.6, // the gold "Start the tour" button
    startButtonH: 0.46,
    startButtonPos: [-0.6, 0.82, -3.45] as [number, number, number],
    skipButtonW: 1.05, // the smaller "Skip tour" button beside it
    skipButtonH: 0.36,
    skipButtonPos: [1.0, 0.82, -3.45] as [number, number, number],

    // The tutorial's own "Next ▸" + "Skip tour" buttons (shown while the foreman
    // talks, once the cockpit is up). They sit just above the desk, in front of
    // the control cards, so they are easy to click without hiding the controls.
    nextButtonW: 1.25, // the gold "Next ▸" button
    nextButtonH: 0.42,
    nextButtonPos: [-0.55, 1.42, -2.72] as [number, number, number],
    tourSkipButtonW: 0.98, // the smaller "Skip tour" button beside it
    tourSkipButtonH: 0.34,
    tourSkipButtonPos: [0.95, 1.4, -2.72] as [number, number, number],

    panelFadeSeconds: 0.4, // how long the foreman's panel fades in when the tour begins
    pulseRate: 1.7, // breathing speed of the highlight (radians/second)
    cardPulseDepth: 0.08, // how much a highlighted control card grows/shrinks (±8%)
    boardPulseDepth: 0.035, // a gentler pulse for the big readout board (±3.5%)
    lockedDim: 0.45, // brightness of a control card that is still LOCKED during the tour (1 = full); it also can't be clicked until the foreman unlocks it
  },
};

// One machine-speed setting. Spelled out as a type so the `speeds` list above
// stays self-documenting (and so the ProductionSystem reads it type-safely).
type SpeedSetting = {
  label: string; // shown on the Machine Speed card ("Slow" / "Medium" / "Fast")
  multiplier: number; // products per run = round(business throughput × this)
  runSeconds: number; // how long one run takes
  beltSpeed: number; // how fast the belt slats scroll during a run
  marginBonus: number; // added to the business's base profit margin at this speed
  satisfactionDrift: number; // how Worker Satisfaction drifts each run at this pace
  strainsCrew: boolean; // hardest pace? running it repeatedly wears the crew down
  wearAdd: number; // how much this pace wears the machine each run (− lets it recover)
};

// =============================================================================
// FACTORY_TYPES — the three businesses the student can run.
//
// This is the heart of the Setup phase: ONE data list (like the CROPS list in
// our other module) that describes each business. Picking a business simply
// loads one of these entries as the "active" values. Everything is here in one
// place so the numbers are easy to balance later.
//
// Each entry carries:
//   • the words shown to the player (name, product, material, machine, blurb)
//   • the machine color used to restyle the loom / furnace / saw
//   • the starting economics (price, demand, breakdown risk, material cost, …)
//
// The economics use simple, made-up units so a 5th grader can reason about them:
//   basePrice     — coins earned for each product sold
//   materialCost  — coins paid for each unit of raw material
//   baseDemand    — how many products buyers want each work cycle
//   demandSwing   — how bumpy demand is (0 = rock steady, bigger = jumpier)
//   throughput    — how many products the machine makes each work cycle
//   breakdownRisk — chance (0..1) the machine breaks down in a work cycle
// =============================================================================
export type FactoryType = {
  id: string; // short internal id ("textile" / "iron" / "lumber")
  name: string; // display name shown on the choice card
  product: string; // what it makes, lowercase ("cloth")
  material: string; // the raw material it uses, lowercase ("cotton")
  machine: string; // the machine "look" label ("Loom" / "Furnace" / "Saw")
  color: number; // machine color when this business is chosen (hex)
  blurb: string; // short, plain description for the choice card
  basePrice: number; // coins earned per product sold
  baseDemand: number; // products buyers want each work cycle
  demandSwing: number; // how bumpy demand is (0 = steady, higher = jumpier)
  breakdownRisk: number; // chance (0..1) the machine breaks each cycle
  materialCost: number; // coins to buy one unit of raw material
  throughput: number; // products the machine makes each work cycle
};

export const FACTORY_TYPES: FactoryType[] = [
  {
    // Textile Mill — steady, high demand. Medium price. Low breakdown risk.
    id: "textile",
    name: "Textile Mill",
    product: "cloth",
    material: "cotton",
    machine: "Loom",
    color: 0x4b6b8a, // dyed-cloth slate blue
    blurb: "Spin soft cotton into cloth, like the cotton mills of Danville. People always need clothes, so buyers stay steady.",
    basePrice: 8, // medium
    baseDemand: 14, // high
    demandSwing: 2, // steady
    breakdownRisk: 0.05, // low
    materialCost: 3,
    throughput: 6,
  },
  {
    // Ironworks — high but bumpy demand. High price. Higher breakdown risk.
    id: "iron",
    name: "Ironworks",
    product: "iron goods",
    material: "iron ore",
    machine: "Furnace",
    color: 0x6e3b2c, // hot-ember red-brown
    blurb: "Melt iron ore into iron goods, like the ironworks of Richmond. They sell high, but orders jump around and the furnace breaks more often.",
    basePrice: 16, // high
    baseDemand: 13, // high...
    demandSwing: 7, // ...but bumpy
    breakdownRisk: 0.18, // higher
    materialCost: 6,
    throughput: 5,
  },
  {
    // Lumber Mill — steady demand. Lower price. Fast throughput. Low breakdown.
    id: "lumber",
    name: "Lumber Mill",
    product: "planks",
    material: "logs",
    machine: "Saw",
    color: 0x9c7a44, // fresh sawn-timber gold
    blurb: "Cut logs into planks, like the lumber shipped from the ports of Norfolk. Each plank earns less, but the saw is fast and almost never breaks.",
    basePrice: 5, // lower
    baseDemand: 11, // steady
    demandSwing: 2, // steady
    breakdownRisk: 0.04, // low
    materialCost: 2,
    throughput: 9, // fast
  },
];

// =============================================================================
// FOREMAN_NEWS — the foreman's between-phases news beats, in order.
//
// Like Samuel's market news in the farming module: short, plain-language updates
// the foreman shares through his speech panel. The student advances them one at a
// time (click his "Next" card or step up to him). "{product}" / "{material}" /
// "{machine}" are filled in with the chosen business's words when a beat is shown.
//
// The beats run in three phases:
//   • GROWTH_NEWS (Phase 2) — demand is rising. The FIRST beat OPENS UP the
//     scaling decisions: the moment it is shown, the "Expand the Line" control
//     unlocks.
//   • COMPETITION_NEWS (Phase 3) — a rival factory opens nearby, so prices fall.
//     Reaching the first competition beat (COMPETITION_BEAT) is what starts
//     Phase 3: the ProductionSystem drops the Price and springs one random
//     challenge on the student.
//   • CLOSING_NEWS (end of the day) — the foreman blows the closing whistle.
//     Reaching the closing beat (CLOSING_BEAT) calls the day: the ProductionSystem
//     reads the three final scores and shows the End of Day Production Report.
// =============================================================================
const GROWTH_NEWS = [
  "Demand is rising! Buyers want more {product} than we can make right now. It is time to grow the factory. When people want more of something, the price goes up, so making more is worth more.",
  "There are three ways to grow: hire more workers, run the machine faster, or expand the line. Each one has a cost.",
  "More workers means more wages. Running faster wears the machine until it breaks down. Expanding takes a few runs before it pays off.",
  "Keep the raw materials stocked and the crew happy, and these orders are ours to fill.",
];
const COMPETITION_NEWS = [
  "News from town: a new factory has opened nearby! To keep our buyers, we had to lower our price. Watch the Price on the board fall. When another factory sells the same goods, prices fall, and you have to work smarter to keep your profit.",
  "Tough times test a good manager. Use your controls — reorder materials, change the speed, repair, or hire — to pull us through.",
];
const CLOSING_NEWS = [
  "That is the closing whistle — the end of the day! You ran a real factory today. Let's look at how we did.",
];

// All the beats, in the order the student hears them.
const FOREMAN_NEWS = [...GROWTH_NEWS, ...COMPETITION_NEWS, ...CLOSING_NEWS];
// Phase 3 begins at the first competition beat: reaching it drops the price and
// triggers the random challenge (watched by the ProductionSystem).
const COMPETITION_BEAT = GROWTH_NEWS.length;
// The day ends at the closing beat: reaching it calls the end of the day, and the
// ProductionSystem shows the End of Day Production Report (watched via dayOver).
const CLOSING_BEAT = GROWTH_NEWS.length + COMPETITION_NEWS.length;

// How many successful runs the student must complete before the foreman is
// allowed to move the day into each later phase. These two numbers are the
// only dials. Raise them to slow the pacing, lower them to speed it up.
const RUNS_BEFORE_COMPETITION = 4; // produce this many before Phase 3 can start
const RUNS_BEFORE_CLOSING = 7;     // produce this many before the day can end

// What the foreman says when the student tries to move the story forward too
// early. Shown on his speech panel instead of advancing the news.
const PACING_NUDGE = {
  competition:
    "Not yet. Keep the line running and try growing the factory first. Hire a hand, change the speed, or expand. Come back once you have a few more runs done.",
  closing:
    "The day is not over yet. Keep the factory going and work through the trouble on the floor. We will close up once we have pushed through.",
};

// Fill the "{product}" / "{material}" / "{machine}" placeholders in a beat with
// the chosen business's words. (Plain split/join — no replaceAll — to stay
// ES2020-friendly.) Reused for the foreman's news AND the challenge announcements.
function fillNews(template: string, factory: FactoryType | null): string {
  const product = factory ? factory.product : "goods";
  const material = factory ? factory.material : "materials";
  const machine = factory ? factory.machine : "machine";
  return template
    .split("{product}")
    .join(product)
    .split("{material}")
    .join(material)
    .split("{machine}")
    .join(machine);
}

// =============================================================================
// PHASE3_CHALLENGES — the random setback that strikes when the competitor opens.
//
// Exactly ONE of these is chosen at random when Phase 3 begins (the same way the
// farming module rolls a random market event). Each is a setback the student can
// ride out with the controls they already have. The numbers that tune each one
// live in CONSTANTS.competition; this list just holds the id and the words.
//
//   • breakdown — the machine stops with a puff of smoke and an amber warning
//     lamp; the new "Repair" control fixes it after a short moment and a cost.
//   • delay — raw materials drop sharply and every reorder now takes longer to
//     arrive, so the student slows the line and/or reorders early to cope.
// =============================================================================
export type Phase3Challenge = {
  id: "breakdown" | "delay"; // which setback this is (the system branches on it)
  name: string; // short headline for the status note
  announce: string; // what the status note says when it strikes (and how to cope)
};

export const PHASE3_CHALLENGES: Phase3Challenge[] = [
  {
    id: "breakdown",
    name: "MACHINE BREAKDOWN",
    announce:
      "The {machine} stopped with a puff of smoke and an amber warning light. Click “Repair” to fix it — it takes a moment and costs a little.",
  },
  {
    id: "delay",
    name: "DELAYED SHIPMENT",
    announce:
      "Raw materials dropped sharply, and new orders now take longer to arrive. Slow the line or reorder early to cope.",
  },
];

// =============================================================================
// REPORT_SCORES / REPORT_SUMMARY — everything the End of Day report SAYS.
//
// When the foreman calls the end of the day, the report reads each FINAL score
// from the live game and shows a short, encouraging line for it, sorted into a
// simple high / medium / low band. EVERYTHING the report says — the band cutoffs
// AND the wording — lives here in one place, so it is easy to tweak. (The report
// never recomputes a score; it only reads what the board ended on, then picks the
// line for that score's band.)
//
// Each REPORT_SCORES entry:
//   label    — the score's name (must match the board row it is read from)
//   percent  — true for the 0..1 scores shown as "%" (Worker Satisfaction, Profit
//              Margin); false for the raw Production Output total. The band cutoffs
//              below use the SAME units: a fraction (0.66) for percent scores, a
//              raw count (300) for output.
//   high     — a final value at or above this is a "high" day for this score
//   medium   — at or above this (but below high) is "medium"; below it is "low"
//   feedback — the plain-language line shown for each band. "{product}" is filled
//              in with the chosen business's product (cloth / iron goods / planks).
// =============================================================================
type ReportBand = "high" | "medium" | "low";

type ReportScore = {
  label: string; // matches the board row this score is read from
  percent: boolean; // shown as a "%" (0..1 score) or a whole number (output)?
  high: number; // at/above this is a "high" day (same units as the score)
  medium: number; // at/above this is "medium"; below it is "low"
  feedback: { high: string; medium: string; low: string }; // the line per band
};

const REPORT_SCORES: ReportScore[] = [
  {
    label: "Production Output",
    percent: false, // a raw running total of goods made
    high: 300, // a big day on the line
    medium: 190, // a steady day (the bar fills at 220)
    feedback: {
      high: "Incredible — your factory turned out a huge pile of {product}! The machines earned their keep.",
      medium: "Nice work — you kept the line moving and made plenty of {product} today.",
      low: "A good start — the line is running. Run it more often to make even more {product}.",
    },
  },
  {
    label: "Worker Satisfaction",
    percent: true, // a 0..1 share, shown as a percentage
    high: 0.66, // a happy, well-run crew
    medium: 0.42, // a crew that is holding up
    feedback: {
      high: "Your workers are happy! A steady pace and enough hands kept the whole crew smiling.",
      medium: "Your crew is doing okay. A few calmer, well-staffed runs would lift their spirits.",
      low: "Your workers are worn out. Ease off the pace and hire more hands so they can keep up.",
    },
  },
  {
    // Graded on the profit SHARE of a sale (how well costs were managed); the
    // report DISPLAYS the final Profit in coins, but the bands below are in margin
    // units (0..1). Label matches the new "Profit" dashboard meter.
    label: "Profit",
    percent: true, // graded as a 0..1 share (the displayed value is coins, handled in buildReportBoard)
    high: 0.5, // keeping a healthy share of each sale
    medium: 0.3, // earning, but costs are biting
    feedback: {
      high: "Great money sense — you kept a healthy profit on every sale.",
      medium: "Solid profit. Watch your costs and price to keep more of every coin.",
      low: "Money was tight today. A better price or fewer costly surprises would lift your profit.",
    },
  },
];

// The one closing sentence that ties the three scores together. It is picked by
// HOW MANY scores landed in the "high" band (0, 1, 2, or 3), so the wrap-up always
// matches how the day actually went — the way a real factory manager has to
// balance making goods, keeping workers happy, AND turning a profit, all at once.
const REPORT_SUMMARY = [
  // 0 of 3 strong:
  "A real factory manager juggles three things at once — making goods, keeping workers happy, and earning a profit. Keep practicing and the balance gets easier!",
  // 1 of 3 strong:
  "Good effort! A real factory manager balances all three — output, happy workers, and profit. You have one down; keep working on the others.",
  // 2 of 3 strong:
  "Nicely balanced — you got two of the three! Output, happy workers, and profit all matter at once. Land all three and you are a true factory manager.",
  // 3 of 3 strong:
  "Outstanding! You balanced output, happy workers, AND profit all at the same time — exactly what a great factory manager does.",
];

// =============================================================================
// REPORT_WRAP / REPORT_CLOSING — the End of Day report's history wrap-up.
//
// Under each score the report adds ONE plain-language line that connects how the
// student DID to what really happened in Virginia's factories — the "high" line
// for a high OR medium day, the "low" line only for a genuinely low day (the band
// comes from the same REPORT_SCORES cutoffs the score blocks use). REPORT_CLOSING
// is the single takeaway shown at the very bottom every time. Keyed by the EXACT
// score label (matches REPORT_SCORES / the board rows). Teaching text only — the
// report still reads the live final scores; nothing here changes a number.
// =============================================================================
const REPORT_WRAP: Record<string, { high: string; low: string }> = {
  "Production Output": {
    high: "Your high output shows how factories could make far more than handmade goods ever could.",
    low: "Your factory made fewer goods this time. Running the machines and adding workers helps you make more.",
  },
  "Worker Satisfaction": {
    high: "Your workers were treated well. That was rare in early factories, and it mattered.",
    low: "Your workers were pushed hard. In real life, problems like this led to new rules to keep factory workers safe.",
  },
  Profit: {
    high: "You earned a strong profit by balancing what you spent against what you sold.",
    low: "Your costs ate into your profit. Watching the cost of materials and workers is how owners stayed in business.",
  },
};

// The one closing line, always shown at the very bottom of the report.
const REPORT_CLOSING =
  "Factories helped Virginia's economy grow, but balancing goods, workers, and profit was the real challenge, and today you ran one yourself.";

// =============================================================================
// Setup components (tags the InputSystem and SetupSystem use)
//
//   FactoryChoice  — marks a welcome card and remembers WHICH business it offers
//                    (its position 0/1/2 in FACTORY_TYPES).
//   WelcomePart    — marks every piece of the welcome screen, so we can clear the
//                    whole thing away once a choice is made.
//   FactoryMachine — marks the production line, so the SetupSystem can find it
//                    and restyle the machine. The references it needs (the shared
//                    machine material and the three name-tags) ride along in the
//                    line's object3D.userData.
// =============================================================================
export const FactoryChoice = createComponent("FactoryChoice", {
  index: { type: Types.Int8, default: 0 },
});
export const WelcomePart = createComponent("WelcomePart", {});
export const FactoryMachine = createComponent("FactoryMachine", {});

// =============================================================================
// Production-loop components (used by the ProductionSystem below)
//
//   ControlCard  — marks one card on the foreman's desk and remembers WHAT it
//                  does (its `action`, one of the CONTROL values). The system
//                  watches for a clicked ControlCard and acts on its `action`.
//   ReadoutBoard — marks the scores board, so the system can find it and animate
//                  the numbers when a run finishes.
// =============================================================================
export const ControlCard = createComponent("ControlCard", {
  action: { type: Types.Int8, default: 0 },
});
export const ReadoutBoard = createComponent("ReadoutBoard", {});

// Marks the small "what to do next" hint banner above the desk. The
// ProductionSystem finds it through this tag and shows the first-time hints on it,
// one short line at a time, then fades them away.
export const HintSign = createComponent("HintSign", {});

// =============================================================================
// Foreman components (used by the ForemanSystem below)
//
//   Foreman       — marks the foreman figure. His speech panel rides along on the
//                   figure's object3D.userData so the system can rewrite it.
//   ForemanPrompt — marks the clickable "Next" card beside him; clicking it (or
//                   stepping up to him) advances his news to the next beat.
// =============================================================================
export const Foreman = createComponent("Foreman", {});
export const ForemanPrompt = createComponent("ForemanPrompt", {});

// =============================================================================
// Tour components (used by the TutorialSystem below)
//
//   TourButton — marks one of the tour's clickable buttons and remembers WHAT it
//                does (its `action`, one of the TOUR values). The TutorialSystem
//                watches for a clicked TourButton and acts on its `action`.
//   TourPart   — marks every piece of the current tour UI (the goal card panel,
//                its buttons, the tutorial's Next/Skip buttons), so the whole set
//                can be swept away in one go when the tour moves on.
// =============================================================================
export const TourButton = createComponent("TourButton", {
  action: { type: Types.Int8, default: 0 },
});
export const TourPart = createComponent("TourPart", {});

// What each tour button does. Plain numbers (stored in TourButton.action) with
// readable names, all handled in the TutorialSystem.
const TOUR = {
  start: 0, // "Start the tour": reveal the cockpit and begin the foreman's walkthrough
  skip: 1, // "Skip tour": jump straight to the game (from the goal card OR mid-tour)
  next: 2, // "Next ▸": advance to the foreman's next line (on a narrative step)
};

// What each control card does. Plain numbers (stored in ControlCard.action) with
// readable names. All six are wired up in the ProductionSystem. EXPAND stays
// locked until the foreman announces rising demand (then it "opens up"); REPAIR
// sits idle ("Machine OK") unless a Phase 3 breakdown stops the machine.
const CONTROL = {
  speed: 0, // cycle the machine speed: Slow → Medium → Fast
  hire: 1, // hire a worker: add a figure at the next station, raise capacity + wages
  order: 2, // order materials: refill the Raw Materials stock for a cost
  repair: 3, // repair the machine: fix a Phase 3 breakdown after a short moment + cost
  expand: 4, // expand the line: a one-time upgrade that pays off after a short build
  start: 5, // run the line: animate a batch, then update the scores
};

// =============================================================================
// HINTS — the brief first-time nudges for a brand-new player, in plain language.
// The ProductionSystem shows them on the hint banner above the desk, one short
// line at a time, each triggered by what is happening in the game:
//   • start   — the moment the controls appear (run your first batch)
//   • again   — after the first run finishes (keep going)
//   • foreman — after the second run (go hear the foreman's news)
// Each is shown ONCE and then fades; from there the breathing pulse points the way.
// =============================================================================
const HINTS = {
  start: "Press the glowing Start Line button to run your factory!",
  again: "Your scores went up on the board above. Press Start Line to run again!",
  foreman:
    "When you are ready, click the foreman's gold button — or walk over to him — to hear the news.",
  // The headset version of the same hint (shown instead of `foreman` when an XR
  // session is running): point-and-click works from anywhere, and "hop" is the
  // comfortable teleport the tour taught.
  foremanVR:
    "When you are ready, point at the foreman's gold button and pull the trigger — or hop over to him — to hear the news.",
};

// =============================================================================
// CALLOUTS — short "teaching moments" tied to what the student just DID.
//
// Each is shown ONCE, the first time that action happens, on the shared status
// note panel under the board (the same panel the breakdown / out-of-materials
// warnings use), then it never repeats (guarded by a one-time flag on the
// ProductionSystem). The foreman's own rising-demand / competitor teaching lines
// live INSIDE his news beats (GROWTH_NEWS[0] / COMPETITION_NEWS[0]) instead, so
// they are spoken as part of those announcements. Plain 5th-grade language.
// These are display only — they never change a run or a score.
// =============================================================================
const CALLOUTS = {
  // The first time the student hires a worker.
  firstHire:
    "Real factories employed hundreds of workers, far more than a family farm ever could.",
  // The first time the Raw Materials stock runs low (at/below materials.lowThreshold).
  lowMaterials:
    "Factories needed a steady supply of materials. If the supply stopped, the machines stopped.",
  // The first time Worker Satisfaction drops low (the crew is being pushed hard).
  workerSafety:
    "Your workers are getting worn out. In real factories, pushing crews too hard led to unsafe conditions, and later to new rules that helped keep workers safe.",
};

// =============================================================================
// TOUR_GOAL — the words on the "Your Factory, Your Goal" card.
//
// Shown the moment a business is picked, BEFORE the cockpit appears, in plain
// 5th-grade language. The TutorialSystem draws these onto the goal card; "Start
// the tour" then reveals the cockpit and begins the foreman's walkthrough.
// =============================================================================
const TOUR_GOAL = {
  title: "Your Factory, Your Goal",
  heading: "Today you will:",
  bullets: [
    "Run a real Virginia factory and see how machines made goods faster and cheaper than making them by hand.",
    "Make the big choices a factory owner made: what to build, how fast to run the machines, how many workers to hire, and when to order more materials.",
    "Keep three things in balance: how much you make, how happy your workers are, and how much profit you earn.",
    "Find out about the new problems factories brought, like breakdowns, worker safety, and competition.",
  ],
};

// =============================================================================
// TOUR_STEPS — the foreman's guided walkthrough, one short line at a time.
//
// The TutorialSystem shows each line in the foreman's speech panel and gently
// highlights the control he is talking about. A "narrative" step waits for the
// student to click "Next ▸"; a "control" step hides Next and instead waits for
// the student to actually USE the highlighted control before moving on.
//   highlight — what to pulse: "none", "board", "speed" (Machine Speed card),
//               "hire" (Hire Worker card), or "start" (Start Line card)
//   wait      — "next" (click Next ▸ to continue) or "control" (use the control)
// =============================================================================
type TourStep = {
  text: string;
  textVR?: string; // said instead of `text` when the student is IN a headset (controller words instead of keyboard words)
  highlight: "none" | "board" | "speed" | "hire" | "start";
  wait: "next" | "control";
};

const TOUR_STEPS: TourStep[] = [
  {
    text: "Welcome to the factory floor. I am your foreman. Today, this place is yours to run.",
    highlight: "none",
    wait: "next",
  },
  {
    // How to get around — the one thing a brand-new player is never told.
    // Worded per mode: keyboard/mouse in the browser, thumbsticks in a headset
    // (where the comfortable "hop" teleport is the way we WANT kids to move).
    text: "Getting around is easy: walk with the W, A, S and D keys, and hold the RIGHT mouse button and drag to look around. Give it a try!",
    textVR: "Getting around is easy: pull the RIGHT thumbstick back, aim the glowing arc at the floor, and let go to hop there. Flick the same stick left or right to turn. Give it a try!",
    highlight: "none",
    wait: "next",
  },
  {
    text: "Look up at the board. It tracks six meters. Three are your scorecard: how much you make, how happy your workers are, and your profit. Keep all three healthy.",
    highlight: "board",
    wait: "next",
  },
  {
    text: "Down here are your controls. Let us try one. Set your Machine Speed.",
    highlight: "speed",
    wait: "control",
  },
  {
    text: "A factory needs a team. Hire a worker — more hands make more goods each run.",
    highlight: "hire",
    wait: "control",
  },
  {
    text: "Now start the line and watch a good travel from the raw materials to the crate.",
    highlight: "start",
    wait: "control",
  },
  {
    text: "See that? By hand, one worker made a few items a day. Your machine just did it in seconds. That is the power of a factory.",
    highlight: "none",
    wait: "next",
  },
  {
    text: "You have got it. The real workday starts now. Good luck.",
    highlight: "none",
    wait: "next",
  },
];

// =============================================================================
// buildEnvironment — assembles the whole room. Called once from index.ts.
// =============================================================================
export function buildEnvironment(world: World): void {
  const scene = world.scene;
  const { width: W, length: L, height: H } = ROOM;

  // ---------------------------------------------------------------------------
  // 0. THE DASHBOARD — a 2D HTML card in the top-left corner of the screen,
  // seeded with the starting scores. It mirrors the in-world readout board's
  // numbers (the board pushes updates to it as the game runs). It shows in the
  // browser view; the headset reads the in-world board instead.
  // ---------------------------------------------------------------------------
  createFactoryHud(
    CONSTANTS.readouts.map((r) => ({
      label: r.label,
      value: r.value,
      fill: r.fill,
    })),
    "Getting Ready",
  );

  // ---------------------------------------------------------------------------
  // 1. FOG + BACKGROUND
  // Fog tints everything a little more toward `fogColor` the farther away it is,
  // so the far wall dissolves into haze instead of ending in a hard line. We set
  // the background to the SAME color so the haze and the "sky" beyond match.
  // ---------------------------------------------------------------------------
  scene.fog = new Fog(CONSTANTS.fogColor, CONSTANTS.fogNear, CONSTANTS.fogFar);
  scene.background = new Color(CONSTANTS.fogColor);

  // ---------------------------------------------------------------------------
  // 2. LIGHTING
  // A DirectionalLight acts like the sun: parallel rays from one direction.
  // A HemisphereLight is soft fill from "sky" above and "ground" below, so the
  // shadowed sides of things are still readable instead of pitch black.
  // ---------------------------------------------------------------------------
  const sun = new DirectionalLight(CONSTANTS.sunColor, CONSTANTS.sunIntensity);
  sun.position.set(...CONSTANTS.sunPosition);
  // Let the sun cast real shadows so every object grounds itself on the floor.
  // One mid-size shadow map, with a frustum sized to wrap the whole room and a
  // small negative bias so flat surfaces don't shimmer ("shadow acne"). These
  // are the farm module's Quest-tuned settings.
  sun.castShadow = true;
  sun.shadow.mapSize.set(CONSTANTS.shadowMapSize, CONSTANTS.shadowMapSize);
  sun.shadow.camera.left = -CONSTANTS.shadowExtent;
  sun.shadow.camera.right = CONSTANTS.shadowExtent;
  sun.shadow.camera.top = CONSTANTS.shadowExtent;
  sun.shadow.camera.bottom = -CONSTANTS.shadowExtent;
  sun.shadow.camera.near = CONSTANTS.shadowNear;
  sun.shadow.camera.far = CONSTANTS.shadowFar;
  sun.shadow.bias = CONSTANTS.shadowBias;
  world.createTransformEntity(sun);
  // The light always points from its position toward its target. The target
  // sits at the room's center (0,0,0) by default; adding it to the scene makes
  // sure that aiming is calculated correctly.
  world.createTransformEntity(sun.target);

  const fill = new HemisphereLight(
    CONSTANTS.hemiSkyColor,
    CONSTANTS.hemiGroundColor,
    CONSTANTS.hemiIntensity,
  );
  world.createTransformEntity(fill);

  // Warm local glow: two or three small amber PointLights that pool warm light
  // in a few places so the room feels lit from within. One sits low and in
  // FRONT of the main machine (so a furnace reads as glowing at its opening),
  // and one near a window on each side wall. They are kept low and few, and do
  // NOT cast shadows, so the Quest stays smooth. (They live in WORLD space, so
  // their Z already includes the room's shifted center, ROOM_CENTER_Z.)
  const C = CONSTANTS;
  const machineGlow = new PointLight(
    C.warmLightColor,
    C.machineLightIntensity,
    C.machineLightDistance,
  );
  machineGlow.position.set(
    0,
    C.machineLightHeight,
    C.lineCenterZ + C.machineLightForward,
  );
  world.createTransformEntity(machineGlow);

  for (const side of [-1, 1]) {
    const windowGlow = new PointLight(
      C.warmLightColor,
      C.windowLightIntensity,
      C.windowLightDistance,
    );
    // Tuck each one just inside a side wall, near window height, and offset
    // along the room's length so the two pools don't overlap.
    windowGlow.position.set(
      side * (ROOM.width / 2 - C.windowLightInset),
      C.windowLightHeight,
      ROOM_CENTER_Z + side * 5,
    );
    world.createTransformEntity(windowGlow);
  }

  // ---------------------------------------------------------------------------
  // 3. THE ROOM SHELL (walls + ceiling)
  // We collect all the scenery meshes as children of one Group, then hand that
  // single Group to the ECS as one entity. (Groups-with-children is the same
  // pattern IWSDK uses for loaded 3D models.)
  //
  // We use MeshLambertMaterial everywhere — it reacts to the lights above, so
  // surfaces have soft shading and depth (MeshBasicMaterial would look flat).
  //
  // The walls use `side: DoubleSide` because the camera lives INSIDE the room:
  // a normal one-sided plane would be invisible when viewed from behind.
  // ---------------------------------------------------------------------------
  const room = new Group();
  room.name = "FactoryRoom";

  // The bricks and timber are TEXTURED now (see the procedural-texture helpers
  // lower down): each wall draws a small brick pattern, repeated to keep the
  // bricks a believable size; the ceiling and beams draw a rough wood grain. The
  // material colors (brick red-brown, timber brown) still TINT cleanly over the
  // gray textures, so the room keeps exactly the same palette — just with detail.
  const BRICK_TILE_W = 2.0; // world meters one brick-texture tile spans across...
  const BRICK_TILE_H = 1.6; // ...and up — used to pick each wall's repeat counts

  // Helper: make a flat brick wall panel and drop it into the room group. Each
  // wall gets its OWN brick texture, repeated proportional to its size, so the
  // bricks come out the same size on the short end walls and the long side walls
  // (a single shared texture would stretch on the longer walls).
  const addWall = (
    w: number, // panel width
    h: number, // panel height
    x: number, // position left/right
    y: number, // position up/down
    z: number, // position front/back
    rotY: number, // turn it to face the right way
  ) => {
    const mat = new MeshLambertMaterial({
      color: CONSTANTS.brickColor,
      side: DoubleSide,
      map: makeBrickTexture(
        Math.max(1, Math.round(w / BRICK_TILE_W)),
        Math.max(1, Math.round(h / BRICK_TILE_H)),
      ),
    });
    const wall = new Mesh(new PlaneGeometry(w, h), mat);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    room.add(wall);
    return wall;
  };

  // Far wall (back, -Z) and near wall (front, +Z) — these face down the length.
  addWall(W, H, 0, H / 2, -L / 2, 0);
  addWall(W, H, 0, H / 2, L / 2, 0);
  // Left wall (-X) and right wall (+X) — turned a quarter turn to run lengthwise.
  addWall(L, H, -W / 2, H / 2, 0, Math.PI / 2);
  addWall(L, H, W / 2, H / 2, 0, Math.PI / 2);

  // The rough-wood timber for the beams (a small, repeating grain) and a larger
  // version for the ceiling plane overhead.
  const beamWood = new MeshLambertMaterial({
    color: CONSTANTS.beamColor,
    map: makeWoodTexture(3, 2),
  });

  // Ceiling — a dark timber plane laid flat overhead, with a wide wood grain.
  const ceiling = new Mesh(
    new PlaneGeometry(W, L),
    new MeshLambertMaterial({
      color: CONSTANTS.beamColor,
      side: DoubleSide,
      map: makeWoodTexture(Math.round(W / 2), Math.round(L / 2)),
    }),
  );
  ceiling.rotation.x = Math.PI / 2; // lay it down flat
  ceiling.position.set(0, H, 0);
  room.add(ceiling);

  // ---------------------------------------------------------------------------
  // 4. ROOF BEAMS
  // A row of solid timber cross-beams just under the ceiling, plus two long
  // beams running the length of the room, so the roof reads as built, not
  // painted on.
  // ---------------------------------------------------------------------------
  const beamY = H - CONSTANTS.beamHeight / 2 - 0.05; // sit them snug under the ceiling
  const crossBeamGeo = new BoxGeometry(
    W,
    CONSTANTS.beamHeight,
    CONSTANTS.beamThickness,
  );
  for (let i = 0; i < CONSTANTS.beamCount; i++) {
    // Spread the beams evenly from the back wall to the front wall.
    const t = i / (CONSTANTS.beamCount - 1); // 0 .. 1
    const z = -L / 2 + 1 + t * (L - 2);
    const beam = new Mesh(crossBeamGeo, beamWood);
    beam.position.set(0, beamY, z);
    room.add(beam);
  }
  // Two beams running the long way, to make a simple timber grid overhead.
  const longBeamGeo = new BoxGeometry(
    CONSTANTS.beamThickness,
    CONSTANTS.beamHeight,
    L,
  );
  for (const x of [-W / 4, W / 4]) {
    const beam = new Mesh(longBeamGeo, beamWood);
    beam.position.set(x, beamY, 0);
    room.add(beam);
  }

  // ---------------------------------------------------------------------------
  // 5. WINDOWS + LIGHT POOLS
  // Each window is a pane of glowing glass set into a dark wooden frame. We give
  // the glass an `emissive` color so it glows on its own (like daylight pouring
  // in), regardless of the room lights.
  //
  // Under each window we lay a soft round "pool" of light on the floor, using a
  // gentle radial glow texture so the light fades out softly instead of having
  // a hard rectangular edge.
  // ---------------------------------------------------------------------------
  const glass = new MeshLambertMaterial({
    color: 0x6b4a1e, // a dim base color...
    emissive: CONSTANTS.windowColor, // ...that GLOWS this warm honey tone
    emissiveIntensity: CONSTANTS.windowEmissive,
  });
  const frameMat = new MeshLambertMaterial({
    color: CONSTANTS.glassFrameColor,
  });

  // Build the soft round glow texture once, then reuse it for every light pool.
  const glowTexture = makeRadialGlowTexture();
  const poolMat = new MeshLambertMaterial({
    color: 0x000000, // no base color — this is pure glow, not a surface
    emissive: CONSTANTS.windowColor, // warm light color
    emissiveMap: glowTexture, // soft round falloff (bright center, dark edge)
    transparent: true,
    opacity: CONSTANTS.poolOpacity,
    depthWrite: false, // don't fight the floor for depth
    blending: AdditiveBlending, // ADD light onto the floor instead of covering it
  });

  const windowCenterY = CONSTANTS.windowSill + CONSTANTS.windowHeight / 2;
  const frameGeo = new BoxGeometry(
    CONSTANTS.windowWidth + 0.3,
    CONSTANTS.windowHeight + 0.3,
    0.12,
  );
  const glassGeo = new PlaneGeometry(
    CONSTANTS.windowWidth,
    CONSTANTS.windowHeight,
  );
  const poolGeo = new PlaneGeometry(CONSTANTS.poolWidth, CONSTANTS.poolDepth);

  // Place `windowsPerSide` windows evenly along BOTH long walls.
  for (let i = 0; i < CONSTANTS.windowsPerSide; i++) {
    const t = i / (CONSTANTS.windowsPerSide - 1); // 0 .. 1
    const z = -L / 2 + 4 + t * (L - 8); // keep a margin from the end walls

    // side = -1 for the left wall, +1 for the right wall
    for (const side of [-1, 1]) {
      const wallX = (side * W) / 2;
      const faceInward = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      // Dark wooden frame, set just into the wall.
      const frame = new Mesh(frameGeo, frameMat);
      frame.position.set(wallX - side * 0.08, windowCenterY, z);
      frame.rotation.y = faceInward;
      room.add(frame);

      // Glowing glass, just in front of the frame, facing into the room.
      const pane = new Mesh(glassGeo, glass);
      pane.position.set(wallX - side * 0.16, windowCenterY, z);
      pane.rotation.y = faceInward;
      room.add(pane);

      // Soft pool of light on the floor, pulled a little toward room center
      // as if the daylight slants in.
      const pool = new Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2; // lay it flat on the floor
      pool.position.set(wallX - side * 2.0, 0.03, z);
      room.add(pool);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. TEAL ACCENTS (sparse)
  // A painted stripe across the far wall, and one empty hanging sign frame on a
  // side wall. These teal touches tie this room to the rest of the course
  // without cluttering the space. (No text yet — that comes in a later step.)
  // ---------------------------------------------------------------------------
  const teal = new MeshLambertMaterial({ color: CONSTANTS.tealColor });

  // Painted stripe across the far wall, at about chest height.
  const stripe = new Mesh(new BoxGeometry(W, 0.3, 0.06), teal);
  stripe.position.set(0, 1.3, -L / 2 + 0.12);
  room.add(stripe);

  // Empty sign frame, mounted high on the left wall near the entrance.
  const sign = makeSignFrame(teal);
  sign.position.set(-W / 2 + 0.2, 4.2, 7);
  sign.rotation.y = Math.PI / 2; // face into the room
  room.add(sign);

  // Slide the whole room so the world origin sits near the front end (see the
  // note next to ROOM_CENTER_Z above), then hand it to the ECS as one entity.
  room.position.z = ROOM_CENTER_Z;
  world.createTransformEntity(room);

  // ---------------------------------------------------------------------------
  // 6.5 INVISIBLE WALL BARRIER (keep the player inside the building)
  // The brick walls are just flat panels with no substance — without this the
  // player could walk straight through them and off the floor. We drop in four
  // invisible solid walls a little INSIDE the brick (by WALL_INSET) and tag the
  // whole group `LocomotionEnvironment` (STATIC), exactly like the floor. The
  // locomotion engine then treats them as collision and stops the player at
  // them. The barrier is never drawn (`visible = false`), so the room looks
  // unchanged — it only blocks movement. (The PlayerBoundsSystem below is a
  // second, guaranteed safety net in case anything ever slips past.)
  // ---------------------------------------------------------------------------
  const barrier = buildWallBarrier();
  barrier.position.z = ROOM_CENTER_Z; // line the barrier up with the shifted room
  world
    .createTransformEntity(barrier)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // ---------------------------------------------------------------------------
  // 6.7 SET DRESSING — props that make the shell read as a real working factory.
  // Two groups, both room-local (shifted by ROOM_CENTER_Z like the room shell):
  //   • solidProps — timber wall columns, corner crate stacks, banded barrels.
  //     Tagged LocomotionEnvironment so the player genuinely bumps into them
  //     (they hug the walls and corners, so they never block the play paths).
  //   • softProps — pure light: an angled shaft of daylight under every window
  //     and warm hanging lamps over the production line. Additive glow only, no
  //     collision, and NO extra real lights — the Quest budget stays untouched.
  // ---------------------------------------------------------------------------
  const P = CONSTANTS.props;
  const solidProps = new Group();
  solidProps.name = "SolidProps";
  const softProps = new Group();
  softProps.name = "SoftProps";

  // Shared geometry + materials — every copy reuses them, keeping draws cheap.
  const columnWood = new MeshLambertMaterial({
    color: CONSTANTS.beamColor,
    map: makeWoodTexture(1, 4),
  });
  const crateWood = new MeshLambertMaterial({
    color: CONSTANTS.crateColor,
    map: makeWoodTexture(1, 1),
  });
  const barrelWood = new MeshLambertMaterial({
    color: P.barrelColor,
    map: makeWoodTexture(2, 1),
  });
  const barrelBand = new MeshLambertMaterial({ color: P.bandColor });

  // Timber half-columns along both long walls, midway between the windows (and
  // one past each end window), so the walls have structure and rhythm instead
  // of reading as flat wallpaper.
  const columnGeo = new BoxGeometry(P.columnDepth, H, P.columnWidth);
  const windowSpacing = (L - 8) / (CONSTANTS.windowsPerSide - 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= CONSTANTS.windowsPerSide; i++) {
      const z = -L / 2 + 4 + (i - 0.5) * windowSpacing;
      if (Math.abs(z) > L / 2 - 0.6) continue; // stay clear of the end walls
      const column = new Mesh(columnGeo, columnWood);
      column.position.set(side * (W / 2 - P.columnDepth / 2), H / 2, z);
      solidProps.add(column);
    }
  }

  // Corner stockpiles: a hand-stacked pile of crates and a pair of iron-banded
  // barrels in each corner of the floor — the factory's stores, kept where
  // nobody walks.
  const crateGeo = new BoxGeometry(P.crateSize, P.crateSize, P.crateSize);
  const barrelGeo = new CylinderGeometry(
    P.barrelRadius,
    P.barrelRadius,
    P.barrelHeight,
    10,
  );
  const bandGeo = new CylinderGeometry(
    P.barrelRadius + 0.012,
    P.barrelRadius + 0.012,
    0.05,
    10,
    1,
    true, // just the hoop — no caps
  );
  const addBarrel = (x: number, z: number): void => {
    const body = new Mesh(barrelGeo, barrelWood);
    body.position.set(x, P.barrelHeight / 2, z);
    solidProps.add(body);
    for (const level of [0.25, 0.75]) {
      const band = new Mesh(bandGeo, barrelBand);
      band.position.set(x, P.barrelHeight * level, z);
      solidProps.add(band);
    }
  };
  const crateS = P.crateSize;
  for (const cx of [-1, 1]) {
    for (const cz of [-1, 1]) {
      const x = cx * (W / 2 - 1.1);
      const z = cz * (L / 2 - 1.1);
      // Two crates side by side and one on top, each turned a little so the
      // stack looks placed by hand rather than machine-perfect.
      const stack = [
        { dx: 0, dz: 0, y: crateS / 2, turn: 0.0 },
        { dx: -cx * (crateS + 0.06), dz: cz * 0.1, y: crateS / 2, turn: 0.35 },
        { dx: -cx * 0.12, dz: 0, y: crateS * 1.5 + 0.02, turn: -0.25 },
      ];
      for (const c of stack) {
        const crate = new Mesh(crateGeo, crateWood);
        crate.position.set(x + c.dx, c.y, z + c.dz);
        crate.rotation.y = c.turn;
        solidProps.add(crate);
      }
      addBarrel(x - cx * 0.2, z - cz * (crateS + 0.75));
      addBarrel(x - cx * (crateS + 0.7), z - cz * 0.55);
    }
  }

  // An angled shaft of daylight under every window — one additive plane each,
  // bright at the pane and fading to nothing where its floor light pool lands,
  // so the glowing windows and the pools finally read as connected.
  const paneY = CONSTANTS.windowSill + CONSTANTS.windowHeight / 2;
  const shaftFootY = 0.05; // where the shaft lands, just above the planks
  const shaftLength = Math.hypot(P.shaftInward - 0.16, paneY - shaftFootY);
  const shaftGeo = new PlaneGeometry(CONSTANTS.windowWidth * 1.15, shaftLength);
  const shaftMat = new MeshBasicMaterial({
    map: makeShaftTexture(),
    color: CONSTANTS.windowColor,
    transparent: true,
    opacity: P.shaftOpacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  for (let i = 0; i < CONSTANTS.windowsPerSide; i++) {
    const t = i / (CONSTANTS.windowsPerSide - 1);
    const z = -L / 2 + 4 + t * (L - 8); // same spots as the windows above
    for (const side of [-1, 1]) {
      const startX = side * (W / 2 - 0.16); // at the pane
      const endX = side * (W / 2 - P.shaftInward); // at the floor pool
      const run = endX - startX; // horizontal travel of the light
      const rise = paneY - shaftFootY; // vertical travel (pane down to floor)
      const shaft = new Mesh(shaftGeo, shaftMat);
      shaft.position.set((startX + endX) / 2, (paneY + shaftFootY) / 2, z);
      // Lean the plane (in the room's cross-section) so its bright top edge
      // hangs at the pane and its faded bottom edge lands on the pool.
      shaft.rotation.z = Math.atan2(run, rise);
      softProps.add(shaft);
    }
  }

  // Warm hanging lamps over the production line — cord, metal shade, glowing
  // bulb, soft halo. The bulbs are self-lit and the halo is additive, so the
  // lamps LOOK lit without spending any real lights.
  const lineLocalZ = CONSTANTS.lineCenterZ - ROOM_CENTER_Z;
  const cordMat = new MeshLambertMaterial({ color: P.lampShadeColor });
  const shadeMat = new MeshLambertMaterial({
    color: P.lampShadeColor,
    side: DoubleSide, // the open cone shows its inside from below
  });
  const bulbMat = new MeshBasicMaterial({ color: P.lampGlowColor, fog: false });
  const haloMat = new MeshBasicMaterial({
    map: glowTexture, // the same soft radial glow the floor pools use
    color: P.lampGlowColor,
    transparent: true,
    opacity: P.lampHaloOpacity,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const cordGeo = new CylinderGeometry(0.015, 0.015, H - P.lampShadeY, 6);
  const shadeGeo = new CylinderGeometry(0.05, 0.3, 0.24, 12, 1, true);
  const bulbGeo = new SphereGeometry(0.07, 10, 8);
  const haloGeo = new PlaneGeometry(P.lampHaloSize, P.lampHaloSize);
  for (const lampX of P.lampXs) {
    const cord = new Mesh(cordGeo, cordMat);
    cord.position.set(lampX, (H + P.lampShadeY) / 2, lineLocalZ);
    softProps.add(cord);
    const shade = new Mesh(shadeGeo, shadeMat);
    shade.position.set(lampX, P.lampShadeY, lineLocalZ);
    softProps.add(shade);
    const bulb = new Mesh(bulbGeo, bulbMat);
    bulb.position.set(lampX, P.lampShadeY - 0.09, lineLocalZ);
    softProps.add(bulb);
    const halo = new Mesh(haloGeo, haloMat);
    halo.position.set(lampX, P.lampShadeY - 0.09, lineLocalZ + 0.05);
    softProps.add(halo);
  }

  solidProps.position.z = ROOM_CENTER_Z;
  softProps.position.z = ROOM_CENTER_Z;
  world
    .createTransformEntity(solidProps)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  world.createTransformEntity(softProps);

  // ---------------------------------------------------------------------------
  // 7. DRIFTING DUST
  // A cloud of tiny, faint motes scattered through the air. They slowly rise
  // (warm factory air drifts upward) and the whole cloud turns very gently, so
  // the air feels alive instead of empty. The DustSystem (below) animates them.
  // ---------------------------------------------------------------------------
  const dust = makeDust(W, L, H);
  dust.position.z = ROOM_CENTER_Z; // keep the dust cloud inside the (shifted) room
  world.createTransformEntity(dust).addComponent(Dust);
  world.registerSystem(DustSystem);

  // ---------------------------------------------------------------------------
  // 8. PRODUCTION LINE (scenery — restyled per business in the Setup phase)
  // A raw-materials intake, a conveyor belt, one main machine, and a
  // finished-goods crate, laid out left-to-right across the player's view a few
  // meters ahead. It is its own entity in world space (not part of the room
  // group), so it is easy to drop "in front of the player" without worrying
  // about the room's shifted center.
  //
  // We tag it `FactoryMachine` so the SetupSystem can find it later and restyle
  // the machine (recolor it + rewrite its name-tags) when a business is picked.
  // ---------------------------------------------------------------------------
  const line = buildProductionLine();
  line.position.set(0, 0, CONSTANTS.lineCenterZ);
  world.createTransformEntity(line).addComponent(FactoryMachine);

  // ---------------------------------------------------------------------------
  // 9. OPENING SETUP — "Pick your business"
  // On load we show a clean welcome (a title, one line of instructions, and
  // three big choice cards). The foreman's control station and the readout board
  // are NOT built yet — they appear only AFTER the student picks a business, so
  // the floor stays clean and uncluttered while they choose. The SetupSystem
  // (registered below) listens for a card click and runs the whole hand-off:
  // restyle the machine, reveal the station + board, and clear the welcome away.
  //
  // `activeFactory` holds the chosen business once a choice is made (null until
  // then). Later steps read it from world.globals to drive the simulation.
  // ---------------------------------------------------------------------------
  world.globals.activeFactory = null;
  // The foreman flips this to true when he announces rising demand; the
  // ProductionSystem watches it to unlock the one-time "Expand the Line" control.
  world.globals.demandRising = false;
  // The foreman flips this when he delivers the Phase 3 news (a competitor opened
  // nearby); the ProductionSystem watches it to drop the Price and spring one
  // random challenge — a machine breakdown or a delayed shipment.
  world.globals.competitionOpen = false;
  // The foreman flips this when he calls the end of the day (his closing beat);
  // the ProductionSystem watches it to show the End of Day Production Report.
  world.globals.dayOver = false;
  // The ProductionSystem writes the number of completed (successful) runs here
  // after each run. The ForemanSystem reads it to pace the phases: the
  // competitor cannot open, and the day cannot end, until enough runs are done.
  world.globals.runsCompleted = 0;
  // Starts false: the real game (the foreman's news phases + the production hints
  // and breathing guidance) stays held back until the opening goal card + the
  // foreman's guided tour are finished (or skipped). The TutorialSystem flips it
  // to true; the ProductionSystem and ForemanSystem both watch it.
  world.globals.tourDone = false;
  buildWelcome(world);
  world.registerSystem(SetupSystem);
  // Drives the control cards + readout board once a business is picked. Safe to
  // register now: their queries stay empty until the station, board, and foreman
  // appear.
  world.registerSystem(ProductionSystem);
  world.registerSystem(ForemanSystem);
  // Runs the opening goal card + the foreman's guided tour. Safe to register now:
  // its queries stay empty until SetupSystem shows the goal card on the first pick.
  world.registerSystem(TutorialSystem);
  // The safety net that keeps the player inside the room every frame. Priority
  // 100 makes it run AFTER the built-in LocomotionSystem (priority -5), so it
  // gets the final word on where the player ends up each frame.
  world.registerSystem(PlayerBoundsSystem, { priority: 100 });

  // ---------------------------------------------------------------------------
  // 13. SHADOWS — turn on shadow rendering and ground everything built so far.
  // Done LAST so it sees the whole static scene (room, floor, beams, machine,
  // line, accents). The control station, readout board, foreman, and workers
  // are built later when a business is picked, so each of those calls
  // applyShadows on itself as it appears (see placeControlStation / placeForeman
  // / hireWorker / addExpansionAnnex).
  // ---------------------------------------------------------------------------
  enableShadows(world);
}

// =============================================================================
// PROCEDURAL TEXTURES — tiny canvases drawn ONCE at startup, then tiled over the
// surfaces so the room reads as real brick / plank / metal instead of flat
// color. The trick (borrowed from the farm module's grass + furrow textures):
// each canvas is drawn mostly in GRAYS and WHITES, so the material's own `color`
// still TINTS cleanly over the top (gray × color = a darker shade of that
// color). The texture supplies the *detail*; the material supplies the *hue* —
// which also means the machine's per-business recolor keeps working untouched.
//
// Every texture repeats. The caller passes how many times to repeat across each
// axis, chosen so the bricks / planks / panels come out a believable size and
// are never stretched on the big surfaces.
// =============================================================================

// Wrap an already-drawn canvas as a repeating sRGB texture. Several textures can
// share ONE drawn canvas (each gets its own repeat), so a single small drawing
// can tile believably on surfaces of different sizes — drawn once, reused.
function repeatingTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace; // canvas pixels are plain sRGB colors
  tex.wrapS = RepeatWrapping; // tile left-to-right...
  tex.wrapT = RepeatWrapping; // ...and top-to-bottom
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// --- BRICK (walls): rows of slightly varied bricks with thin mortar lines. ----
// Drawn once, then cached. Light-gray brick faces on slightly darker mortar, in
// a running bond (every other row shifted half a brick). Tints to warm red-brown.
let brickCanvas: HTMLCanvasElement | null = null;
function brickArt(): HTMLCanvasElement {
  if (brickCanvas) return brickCanvas;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  // Mortar fills the whole tile first (a touch darker, so the joints read as
  // recessed grout lines once the brick faces are laid over it).
  ctx.fillStyle = "#9c9c9c";
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8; // brick courses down the tile
  const cols = 4; // whole bricks across one course
  const bh = 256 / rows; // height of one course (incl. its joint)
  const bw = 256 / cols; // width of one brick (incl. its joint)
  const joint = 4; // mortar-line thickness, in pixels
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2); // running bond: every other row shifts half a brick
    for (let i = -1; i <= cols; i++) {
      const x = i * bw + offset + joint / 2;
      const y = r * bh + joint / 2;
      // Light gray with a little per-brick variation so the wall isn't dead flat.
      const g = 196 + ((r * 5 + i * 11) % 5) * 9; // ~196..232
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(x, y, bw - joint, bh - joint);
    }
  }
  brickCanvas = c;
  return c;
}
function makeBrickTexture(repeatX: number, repeatY: number): CanvasTexture {
  return repeatingTexture(brickArt(), repeatX, repeatY);
}

// --- WOOD PLANKS (floor): long boards with light grain and seams. ------------
// Boards run down the tile's V axis so they read as long planks on the floor.
// Exported because the walkable floor lives in index.ts. Tints to warm brown.
let plankCanvas: HTMLCanvasElement | null = null;
function plankArt(): HTMLCanvasElement {
  if (plankCanvas) return plankCanvas;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9a9a9a"; // dark seams show between boards
  ctx.fillRect(0, 0, 256, 256);
  const planks = 4; // boards across the tile
  const pw = 256 / planks;
  const seam = 3; // gap between boards, in pixels
  for (let p = 0; p < planks; p++) {
    const x = p * pw + seam / 2;
    const g = 198 + ((p * 13) % 4) * 11; // each board a slightly different light gray
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, pw - seam, 256);
    // A few soft grain streaks running the length of each board.
    ctx.strokeStyle = "rgba(150,150,150,0.5)";
    ctx.lineWidth = 1;
    for (let s = 0; s < 3; s++) {
      const gx = x + 3 + Math.random() * (pw - seam - 6);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 2, 90, gx - 2, 170, gx + 1, 256);
      ctx.stroke();
    }
  }
  // A couple of cross seams (board ends) at staggered heights.
  ctx.fillStyle = "#8f8f8f";
  ctx.fillRect(0, 96, 256, 2);
  ctx.fillRect(0, 200, 256, 2);
  plankCanvas = c;
  return c;
}
export function makePlankTexture(
  repeatX: number,
  repeatY: number,
): CanvasTexture {
  return repeatingTexture(plankArt(), repeatX, repeatY);
}

// --- WORN METAL (machine bodies): a subtle brushed look + a few dark streaks. -
// Fine horizontal "brushing" lines with a handful of darker vertical streaks.
// Grayscale, so the machine's per-business color still tints it cleanly.
let metalCanvas: HTMLCanvasElement | null = null;
function metalArt(): HTMLCanvasElement {
  if (metalCanvas) return metalCanvas;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c9c9c9";
  ctx.fillRect(0, 0, 128, 128);
  // Fine horizontal brushed lines.
  for (let y = 0; y < 128; y++) {
    const g = 188 + ((y * 53) % 9) * 6; // subtle line-to-line variation
    ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
    ctx.fillRect(0, y, 128, 1);
  }
  // A few darker, slightly slanted streaks — worn, used metal.
  ctx.strokeStyle = "rgba(110,110,110,0.4)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * 128;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() * 8 - 4), 128);
    ctx.stroke();
  }
  metalCanvas = c;
  return c;
}
function makeMetalTexture(repeatX: number, repeatY: number): CanvasTexture {
  return repeatingTexture(metalArt(), repeatX, repeatY);
}

// --- ROUGH WOOD (timber beams + crates): coarser, knottier grain. ------------
// A rougher cousin of the floor planks for the heavy timber: bold vertical grain
// streaks and a couple of knots. Grayscale, tints to whatever wood color it's on.
let woodCanvas: HTMLCanvasElement | null = null;
function woodArt(): HTMLCanvasElement {
  if (woodCanvas) return woodCanvas;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c4c4c4";
  ctx.fillRect(0, 0, 128, 128);
  // Coarse vertical grain streaks of varying darkness.
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 128;
    const g = 150 + Math.floor(Math.random() * 70); // 150..220
    ctx.strokeStyle = `rgba(${g},${g},${g},0.55)`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 4, 45, x - 4, 90, x + 2, 128);
    ctx.stroke();
  }
  // A couple of darker knots.
  ctx.fillStyle = "rgba(120,120,120,0.5)";
  for (let i = 0; i < 2; i++) {
    const kx = 20 + Math.random() * 88;
    const ky = 20 + Math.random() * 88;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  woodCanvas = c;
  return c;
}
function makeWoodTexture(repeatX: number, repeatY: number): CanvasTexture {
  return repeatingTexture(woodArt(), repeatX, repeatY);
}

// =============================================================================
// applyShadows / enableShadows
// The grounding pass. `applyShadows` walks a group/mesh and turns ON cast +
// receive shadows for every SOLID, lit object — but leaves the self-lit UI
// panels (cards, the board, name-tags, notes) and the additive glows (light
// pools, the good's halo) alone, since shadows would only muddy those.
//
// `enableShadows` turns shadow rendering on for the whole renderer and ALSO
// flags every existing material for recompile — the gotcha the farm module hit:
// the renderer has usually drawn a frame or two with the shadow-less shaders
// before this runs, so without the recompile no shadows would ever appear.
// =============================================================================
function applyShadows(root: Object3D): void {
  root.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mat = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as MeshBasicMaterial;
    if (mat.isMeshBasicMaterial) return; // self-lit UI panels — never shadowed
    if (mat.transparent && mat.blending === AdditiveBlending) return; // soft glows + light pools
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function enableShadows(world: World): void {
  world.renderer.shadowMap.enabled = true;
  // Ground every solid object built so far (room, floor, beams, machine, …).
  applyShadows(world.scene);
  // Force a recompile of every existing material so they pick up shadow support.
  world.scene.traverse((obj: Object3D) => {
    const m = (obj as Mesh).material;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    for (const mat of mats) mat.needsUpdate = true;
  });
}

// =============================================================================
// makeRadialGlowTexture
// Draws a soft white circle that fades to black at the edges, on a tiny canvas.
// Used as the "shape" of each pool of light so it has soft, round edges.
// =============================================================================
function makeRadialGlowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // A radial gradient: bright white in the middle, fading to black at the rim.
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0, // inner circle (center, radius 0)
    size / 2,
    size / 2,
    size / 2, // outer circle (center, radius = half the canvas)
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)"); // center: full glow
  gradient.addColorStop(1, "rgba(0,0,0,1)"); // edge: no glow

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new CanvasTexture(canvas);
}

// =============================================================================
// makeTargetRingTexture
// Draws a crisp glowing ring (a "stand here" target) in white, so the material's
// color tints it. Used for the floor marker at the foreman's feet — it shows a
// brand-new player exactly where to hop.
// =============================================================================
function makeTargetRingTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;

  ctx.clearRect(0, 0, size, size);
  // A soft glow filling the disc (a gentle spotlight on the planks)...
  const fill = ctx.createRadialGradient(center, center, 0, center, center, center);
  fill.addColorStop(0, "rgba(255,255,255,0.30)");
  fill.addColorStop(0.75, "rgba(255,255,255,0.10)");
  fill.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  // ...then a wide halo and a bright crisp ring on top, so it reads as a target.
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(center, center, center - 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(center, center, center - 10, 0, Math.PI * 2);
  ctx.stroke();

  return new CanvasTexture(canvas);
}

// =============================================================================
// makeShaftTexture
// The shape of a beam of light: bright at the top (the window pane), fading to
// black at the bottom (the floor), with softened side edges. Black adds NOTHING
// under additive blending, so black simply is "no light". Drawn in whites so
// the material's color tints the beam warm.
// =============================================================================
function makeShaftTexture(): CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Fade from full light at the top to none at the bottom...
  const fall = ctx.createLinearGradient(0, 0, 0, h);
  fall.addColorStop(0, "#ffffff");
  fall.addColorStop(1, "#000000");
  ctx.fillStyle = fall;
  ctx.fillRect(0, 0, w, h);

  // ...then soften the two side edges so the beam has no hard sides.
  const sides = ctx.createLinearGradient(0, 0, w, 0);
  sides.addColorStop(0, "#000000");
  sides.addColorStop(0.25, "#ffffff");
  sides.addColorStop(0.75, "#ffffff");
  sides.addColorStop(1, "#000000");
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, w, h);

  return new CanvasTexture(canvas);
}

// =============================================================================
// makeSignFrame
// Builds an empty rectangular frame out of four thin teal bars (top, bottom,
// left, right), returned as a Group so the caller can place it as one piece.
// =============================================================================
function makeSignFrame(material: MeshLambertMaterial): Group {
  const frame = new Group();
  frame.name = "SignFrame";

  const width = 2.2; // overall frame width
  const height = 1.2; // overall frame height
  const bar = 0.12; // thickness of each bar
  const depth = 0.08; // how far the frame sticks out

  // Top and bottom bars (horizontal).
  const horizontal = new BoxGeometry(width, bar, depth);
  for (const y of [height / 2, -height / 2]) {
    const piece = new Mesh(horizontal, material);
    piece.position.set(0, y, 0);
    frame.add(piece);
  }
  // Left and right bars (vertical).
  const vertical = new BoxGeometry(bar, height, depth);
  for (const x of [-width / 2, width / 2]) {
    const piece = new Mesh(vertical, material);
    piece.position.set(x, 0, 0);
    frame.add(piece);
  }

  return frame;
}

// =============================================================================
// buildWallBarrier
// Builds the INVISIBLE collision shell that stops the player leaving the room.
// It is one Group of four thin, solid boxes — one just inside each brick wall
// (pulled in by WALL_INSET) — running floor to ceiling. The caller tags the
// group `LocomotionEnvironment` so the locomotion engine treats it as solid and
// the player bumps into it instead of walking through the bricks. The group is
// never drawn (`visible = false`), so it changes nothing you can see; the
// locomotion engine still reads its geometry for collision either way.
//
// Built around the room's own center (like the room group), so the caller just
// slides it by ROOM_CENTER_Z to line it up with the shifted room.
// =============================================================================
function buildWallBarrier(): Group {
  const { width: W, length: L, height: H } = ROOM;
  const t = 0.2; // how thick each invisible wall is, in meters
  const inset = WALL_INSET; // how far inside the brick each barrier wall sits

  const barrier = new Group();
  barrier.name = "WallBarrier";
  barrier.visible = false; // collision only — never rendered

  // One plain material, shared by all four boxes. It is never seen, so its look
  // does not matter; the group's `visible = false` keeps it off-screen.
  const invisible = new MeshBasicMaterial();

  // A box centered halfway up the wall (y = H / 2) spans the full floor-to-
  // ceiling height. We make each side/end wall the full room length/width so the
  // corners overlap a little — harmless, and it leaves no gap to slip through.
  const sideGeo = new BoxGeometry(t, H, L); // left/right walls run along Z
  const endGeo = new BoxGeometry(W, H, t); // far/near walls run along X

  // Left (-X) and right (+X) walls, pulled `inset` in from the brick at ±W/2.
  for (const x of [-(W / 2 - inset), W / 2 - inset]) {
    const wall = new Mesh(sideGeo, invisible);
    wall.position.set(x, H / 2, 0);
    barrier.add(wall);
  }
  // Far (-Z) and near (+Z) walls, pulled `inset` in from the brick at ±L/2.
  for (const z of [-(L / 2 - inset), L / 2 - inset]) {
    const wall = new Mesh(endGeo, invisible);
    wall.position.set(0, H / 2, z);
    barrier.add(wall);
  }

  return barrier;
}

// =============================================================================
// makeBox
// A tiny convenience for all the boxy parts: give it a size, a color, and a
// position [x, y, z], and it hands back a ready-to-place box. Each box gets its
// own MeshLambertMaterial so it catches the room light like everything else.
//
// Pass an optional `map` (a CanvasTexture) to give the box a surface — e.g. the
// rough-wood grain on the wooden crate and intake parts. The texture is gray, so
// the box's `color` still tints it just like an untextured box.
// =============================================================================
function makeBox(
  width: number,
  height: number,
  depth: number,
  color: number,
  position: [number, number, number],
  map?: CanvasTexture,
): Mesh {
  const box = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshLambertMaterial({ color, map: map ?? null }),
  );
  box.position.set(position[0], position[1], position[2]);
  return box;
}

// =============================================================================
// buildProductionLine
// Assembles a generic production line as ONE group: a raw-materials intake on
// the left, a conveyor belt, a main machine in the middle, and a finished-goods
// crate on the right. It is built around its own origin (X = left-to-right along
// the line, Y = up, Z = depth), so the caller can place it anywhere.
//
// This is scenery only — nothing moves yet, and the machine is intentionally
// generic (we will restyle it per business in a later step).
// =============================================================================
function buildProductionLine(): Group {
  const line = new Group();
  line.name = "ProductionLine";
  const C = CONSTANTS;

  // The MACHINE'S material — shared by the body and all the rounded iron parts
  // below. Because they share ONE material, the SetupSystem can later recolor
  // the whole machine (into a loom, furnace, or saw) by setting this single
  // color. (The boxy intake/conveyor/crate parts use makeBox, which makes its
  // own material from a color, and stay their fixed neutral colors.)
  const machineMaterial = new MeshLambertMaterial({
    color: C.machineIronColor,
    map: makeMetalTexture(2, 2), // worn, brushed-metal surface (gray, so the recolor still tints)
  });
  const amber = new MeshLambertMaterial({
    color: 0x000000, // no base color — these read as small lit lamps
    emissive: C.windowColor, // the same warm honey glow as the windows
    emissiveIntensity: 0.9,
  });

  // A shared rough-wood grain for the line's wooden parts (pallet, bin, the
  // machine's timber foundation, the crate). Gray, so each part's color tints it.
  const woodMap = makeWoodTexture(1, 1);

  // --- 1. RAW MATERIALS INTAKE (a wooden pallet with a bin of materials) -----
  line.add(makeBox(1.2, 0.12, 1.0, C.lineTimberColor, [C.intakeX, 0.06, 0], woodMap)); // pallet deck
  line.add(makeBox(1.0, 0.6, 0.8, C.binColor, [C.intakeX, 0.42, 0], woodMap)); // bin sitting on the pallet

  // --- 2. CONVEYOR BELT (a long dark slatted box on short legs) --------------
  const beltTop = C.beltHeight;
  // The belt body itself, running the length of the line.
  line.add(
    makeBox(C.conveyorLength, 0.18, 0.7, C.conveyorColor, [
      0,
      beltTop - 0.09,
      0,
    ]),
  );
  // Raised slats across the belt, evenly spaced, so it reads as a real belt.
  // We keep the slats in an array so the ProductionSystem can scroll them along
  // the belt while a run is playing (they sit still otherwise).
  const slats: Mesh[] = [];
  const slatCount = 14;
  for (let i = 0; i < slatCount; i++) {
    const t = i / (slatCount - 1); // 0 .. 1
    const x = -C.conveyorLength / 2 + 0.3 + t * (C.conveyorLength - 0.6);
    const slat = makeBox(0.07, 0.05, 0.72, C.slatColor, [x, beltTop + 0.02, 0]);
    slats.push(slat);
    line.add(slat);
  }
  // Four short legs holding the belt up.
  const legHeight = beltTop - 0.18;
  for (const x of [-C.conveyorLength / 2 + 0.4, C.conveyorLength / 2 - 0.4]) {
    for (const z of [-0.25, 0.25]) {
      line.add(
        makeBox(0.12, legHeight, 0.12, C.machineIronColor, [
          x,
          legHeight / 2,
          z,
        ]),
      );
    }
  }

  // --- 3. MAIN MACHINE (boxes + cylinders, dark iron + timber + amber dots) --
  // Timber foundation it all sits on.
  line.add(makeBox(2.0, 0.3, 1.4, C.lineTimberColor, [0, 0.15, 0], woodMap));
  // Main iron body — built from the SHARED machine material so recoloring that
  // one material recolors the body and all the rounded iron parts together.
  const body = new Mesh(new BoxGeometry(1.8, 1.4, 1.1), machineMaterial);
  body.position.set(0, 1.0, 0);
  line.add(body);
  // A heavy iron boiler drum lying on its side across the top.
  const drum = new Mesh(new CylinderGeometry(0.5, 0.5, 1.7, 20), machineMaterial);
  drum.rotation.z = Math.PI / 2; // lay it down so it runs left-to-right
  drum.position.set(0, 1.95, 0);
  line.add(drum);
  // A tall chimney pipe rising from the back.
  const chimney = new Mesh(new CylinderGeometry(0.15, 0.15, 1.8, 16), machineMaterial);
  chimney.position.set(0.55, 2.7, -0.35);
  line.add(chimney);
  // A funnel / hopper that feeds the machine (a cylinder narrower at the base).
  const hopper = new Mesh(new CylinderGeometry(0.5, 0.14, 0.7, 18), machineMaterial);
  hopper.position.set(-0.65, 2.05, 0.15);
  line.add(hopper);
  // A big flywheel on the side (a thin iron disc standing on edge).
  const wheel = new Mesh(new CylinderGeometry(0.6, 0.6, 0.12, 24), machineMaterial);
  wheel.rotation.z = Math.PI / 2; // stand it up, facing along the line
  wheel.position.set(1.0, 0.95, 0.25);
  line.add(wheel);
  // A few small amber gauge / lamp dots on the front face, toward the player.
  const gaugeGeo = new SphereGeometry(0.07, 12, 12);
  const gaugeSpots: [number, number, number][] = [
    [-0.45, 1.25, 0.57],
    [0, 1.25, 0.57],
    [0.45, 1.25, 0.57],
    [-0.7, 1.62, 0.45],
  ];
  for (const spot of gaugeSpots) {
    const gauge = new Mesh(gaugeGeo, amber);
    gauge.position.set(spot[0], spot[1], spot[2]);
    line.add(gauge);
  }

  // --- 4. FINISHED GOODS OUTPUT (an empty crate, open at the top) ------------
  const ox = C.outputX;
  line.add(makeBox(1.2, 0.1, 1.0, C.crateColor, [ox, 0.05, 0], woodMap)); // crate floor
  line.add(makeBox(1.2, 0.5, 0.08, C.crateColor, [ox, 0.3, 0.46], woodMap)); // front side
  line.add(makeBox(1.2, 0.5, 0.08, C.crateColor, [ox, 0.3, -0.46], woodMap)); // back side
  line.add(makeBox(0.08, 0.5, 1.0, C.crateColor, [ox - 0.56, 0.3, 0], woodMap)); // left side
  line.add(makeBox(0.08, 0.5, 1.0, C.crateColor, [ox + 0.56, 0.3, 0], woodMap)); // right side

  // --- 4b. THE TRAVELING GOOD (one batch riding the line during a run) -------
  // Hidden until the line runs. The ProductionSystem glides it from the intake
  // to the output crate, flipping its color from raw material to the business
  // color as it passes the machine — raw goes in, a finished good comes out. It
  // uses makeBox so it owns its own material (the system recolors it each run).
  const product = makeBox(
    C.productSize,
    C.productSize,
    C.productSize,
    C.rawMaterialColor,
    [C.intakeX, C.beltHeight + C.productSize / 2, 0],
  );
  product.visible = false;
  line.add(product);

  // A soft halo that rides ON the good and glows it up as it reaches the output
  // crate (the ProductionSystem swells its opacity over the last stretch of the
  // line). It reuses the same gentle round texture as the window light pools, set
  // to ADD light so it reads as a warm glow rather than a flat sticker. It faces
  // the player (+Z) and starts invisible.
  const glowSize = C.productSize * C.goodGlow.size;
  const productGlow = new Mesh(
    new PlaneGeometry(glowSize, glowSize),
    new MeshBasicMaterial({
      map: makeRadialGlowTexture(),
      color: C.rawMaterialColor, // recolored to the finished good's color as it forms
      transparent: true,
      opacity: 0, // the system fades it in near the output
      depthWrite: false, // a glow shouldn't hide things behind it
      blending: AdditiveBlending, // ADD light onto the scene for a soft halo
      fog: false,
      toneMapped: false,
    }),
  );
  productGlow.position.z = C.productSize * 0.5 + 0.01; // float just in front of the cube, toward the player
  product.add(productGlow);
  product.userData.glow = productGlow;

  // --- 5. NAME-TAGS (filled in when the student picks a business) ------------
  // Three small cream tags in the same cream/navy/gold style as the rest of the
  // UI, each led by an icon that matches the dashboard (🪵 raw material, ⚙️
  // machine, 📦 finished product). They start with generic words and the
  // SetupSystem rewrites them with the chosen material/machine/product. Each
  // faces +Z (toward the player).
  const intakeLabel = makeTextPlane({
    text: "Material",
    icon: "🪵",
    width: C.ioLabelW,
    height: C.ioLabelH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.gold,
  });
  intakeLabel.position.set(C.intakeX, 1.05, 0.1); // floating above the intake bin
  line.add(intakeLabel);

  const machineLabel = makeTextPlane({
    text: "Machine",
    icon: "⚙️",
    width: C.machineLabelW,
    height: C.machineLabelH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.gold,
  });
  machineLabel.position.set(0, 1.02, 0.57); // on the machine's front face
  line.add(machineLabel);

  const outputLabel = makeTextPlane({
    text: "Product",
    icon: "📦",
    width: C.ioLabelW,
    height: C.ioLabelH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.gold,
  });
  outputLabel.position.set(C.outputX, 1.0, 0.1); // floating above the output crate
  line.add(outputLabel);

  // Hand the SetupSystem everything it needs to restyle this machine later: the
  // one shared material to recolor, and the three tags to rewrite. We stash them
  // on userData (the same trick the dust cloud uses for its per-mote speeds).
  line.userData.machineMaterial = machineMaterial;
  line.userData.gaugeMaterial = amber; // the warm gauge lamps — flashed warning-red on a breakdown
  line.userData.machineLabel = machineLabel;
  line.userData.intakeLabel = intakeLabel;
  line.userData.outputLabel = outputLabel;
  // The moving parts the ProductionSystem animates during a run.
  line.userData.slats = slats;
  line.userData.product = product;
  // Worker figures get added here as they are hired (starts empty).
  line.userData.workers = [];

  return line;
}

// =============================================================================
// makeWorker
// Builds one simple worker figure from a few boxes and cylinders: two legs, a
// torso, two arms, a head, and a little teal cap. It is built around its feet
// (origin at y = 0), so dropping it on the floor stands it upright. Returned as
// one Group so the caller can place it at a station with a single position.
//
// Three shared materials keep it to a few clean colors (coveralls / head / cap),
// in the same spirit as the machine's one shared iron material.
// =============================================================================
function makeWorker(): Group {
  const C = CONSTANTS;
  const worker = new Group();
  worker.name = "Worker";

  const coveralls = new MeshLambertMaterial({ color: C.workerClothesColor });
  const skin = new MeshLambertMaterial({ color: C.workerHeadColor });
  const capMat = new MeshLambertMaterial({ color: C.workerCapColor });

  // Two legs (cylinders) standing the figure on the floor.
  const legGeo = new CylinderGeometry(
    C.workerLegRadius,
    C.workerLegRadius,
    C.workerLegHeight,
    12,
  );
  for (const side of [-1, 1]) {
    const leg = new Mesh(legGeo, coveralls);
    leg.position.set(side * C.workerLegSpread, C.workerLegHeight / 2, 0);
    worker.add(leg);
  }

  // Torso (a box) sitting on top of the legs.
  const torso = new Mesh(
    new BoxGeometry(C.workerTorsoWidth, C.workerTorsoHeight, C.workerTorsoDepth),
    coveralls,
  );
  const torsoY = C.workerLegHeight + C.workerTorsoHeight / 2;
  torso.position.set(0, torsoY, 0);
  worker.add(torso);

  // Two arms (cylinders) hanging at the torso's sides.
  const armGeo = new CylinderGeometry(
    C.workerArmRadius,
    C.workerArmRadius,
    C.workerArmHeight,
    10,
  );
  const armY = C.workerLegHeight + C.workerTorsoHeight - C.workerArmHeight / 2;
  for (const side of [-1, 1]) {
    const arm = new Mesh(armGeo, coveralls);
    arm.position.set(side * (C.workerTorsoWidth / 2 + C.workerArmRadius), armY, 0);
    worker.add(arm);
  }

  // Head (a box) and a little teal cap on top.
  const headY = C.workerLegHeight + C.workerTorsoHeight + C.workerHeadSize / 2;
  const head = new Mesh(
    new BoxGeometry(C.workerHeadSize, C.workerHeadSize, C.workerHeadSize),
    skin,
  );
  head.position.set(0, headY, 0);
  worker.add(head);

  const cap = new Mesh(
    new CylinderGeometry(C.workerCapRadius, C.workerCapRadius, C.workerCapHeight, 12),
    capMat,
  );
  cap.position.set(0, headY + C.workerHeadSize / 2 + C.workerCapHeight / 2, 0);
  worker.add(cap);

  return worker;
}

// =============================================================================
// workerStationX
// The line-local X for the Nth worker (0-based): the stations are spread evenly
// between workerStationMinX and workerStationMaxX, so the row always looks tidy
// no matter how many have been hired (and there are never more than maxWorkers).
// =============================================================================
function workerStationX(index: number): number {
  const C = CONSTANTS;
  if (C.maxWorkers <= 1) return (C.workerStationMinX + C.workerStationMaxX) / 2;
  const t = index / (C.maxWorkers - 1); // 0 at the first station, 1 at the last
  return C.workerStationMinX + t * (C.workerStationMaxX - C.workerStationMinX);
}

// =============================================================================
// makeTextPlane
// A reusable label in the polished cream-card style: a rounded card (soft shadow
// + optional border) with crisp, auto-fit text drawn on a CanvasTexture. Pass
// "\n" to split a label over two lines, and an optional `icon` emoji that leads
// the first line (like the dashboard rows). Used for the production-line
// name-tags and the foreman's "Next" prompt.
//
// The font starts LARGE and shrinks only as much as needed so the longest line
// still fits inside the padding — labels are always as big as possible without
// spilling over the edge.
// =============================================================================
function makeTextPlane(options: {
  text: string; // the label ("\n" starts a new line)
  width: number; // plane width in meters
  height: number; // plane height in meters
  background: number | string; // card fill
  textColor: number | string; // text color
  icon?: string; // optional emoji leading the first line
  border?: number | string; // optional border color
  maxFontSize?: number; // biggest font to try, in canvas pixels
  padding?: number; // empty margin as a fraction of the card (0.16 = 16%)
  fontWeight?: string; // "bold" by default
}): Mesh {
  const {
    text,
    width,
    height,
    background,
    textColor,
    icon,
    border,
    maxFontSize = 220,
    padding = 0.16,
    fontWeight = "bold",
  } = options;

  // A high-resolution canvas (matching the plane's shape) keeps the text sharp
  // even when the player walks right up to the card.
  const pxPerMeter = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;

  const style = { background, textColor, icon, border, maxFontSize, padding, fontWeight };
  paintAutoFitText(ctx, canvas.width, canvas.height, text, style);

  const mesh = makeCanvasPlane(canvas, width, height, true);

  // Let callers rewrite this label later (the production line's name-tags use
  // this when the student picks a business). We repaint the SAME canvas and
  // flag the texture as changed — the texture is re-used, so nothing leaks.
  const texture = (mesh.material as MeshBasicMaterial).map!;
  mesh.userData.setText = (newText: string): void => {
    paintAutoFitText(ctx, canvas.width, canvas.height, newText, style);
    texture.needsUpdate = true;
  };

  return mesh;
}

// =============================================================================
// paintAutoFitText
// The shared drawing core behind makeTextPlane: it draws a rounded cream card,
// then finds the LARGEST font that still fits inside the padding and draws the
// lines centered (with the optional icon leading the first line). Kept separate
// so a label can be REPAINTED later with new text (see makeTextPlane.setText).
// =============================================================================
function paintAutoFitText(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string,
  style: {
    background: number | string;
    textColor: number | string;
    icon?: string;
    border?: number | string;
    maxFontSize: number;
    padding: number;
    fontWeight: string;
  },
): void {
  const { background, textColor, icon, border, maxFontSize, padding, fontWeight } = style;

  // The rounded card (a small margin leaves room for the soft drop shadow).
  ctx.clearRect(0, 0, canvasW, canvasH);
  const M = Math.round(canvasH * 0.07);
  drawCard(ctx, M, M, canvasW - M * 2, canvasH - M * 2, {
    fill: new Color(background).getStyle(),
    stroke: border !== undefined ? new Color(border).getStyle() : undefined,
    lineWidth: border !== undefined ? Math.max(3, Math.round(canvasH * 0.03)) : 0,
    radius: Math.round(canvasH * 0.2),
    shadow: true,
  });

  // The icon (if any) leads the first line so it scales with the text.
  const lines = text.split("\n");
  if (icon) lines[0] = lines[0] ? `${icon} ${lines[0]}` : icon;

  // Find the largest font that fits both the padded width and the padded height.
  const cardW = canvasW - M * 2;
  const cardH = canvasH - M * 2;
  const maxTextWidth = cardW * (1 - padding * 2);
  const maxTextHeight = cardH * (1 - padding * 2);
  const fitsAt = (size: number): boolean => {
    ctx.font = `${fontWeight} ${size}px sans-serif`;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    const blockHeight = lines.length * size * 1.2; // 1.2 = comfy line spacing
    return widest <= maxTextWidth && blockHeight <= maxTextHeight;
  };
  let fontSize = maxFontSize;
  while (fontSize > 12 && !fitsAt(fontSize)) {
    fontSize -= 4;
  }

  // Draw the text: bold, centered, stacked around the middle of the card.
  ctx.fillStyle = new Color(textColor).getStyle();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
  const lineHeight = fontSize * 1.2;
  const blockTop = canvasH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvasW / 2, blockTop + i * lineHeight);
  });
}

// =============================================================================
// makeCanvasPlane
// Wraps an already-drawn canvas onto a flat plane and hands back the mesh.
// Shared by makeTextPlane and the readout board so the texture/material setup
// lives in ONE place.
//
// We use an UNLIT material (MeshBasicMaterial) on purpose: these are
// informational surfaces (controls and scores), so we want them crisp and
// readable no matter how dim the room is. `fog: false` keeps the far readout
// board from fading into the haze.
// =============================================================================
function makeCanvasPlane(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  transparent = false, // true when the canvas has see-through corners (rounded cards)
): Mesh {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; // so the colors read exactly as authored
  texture.anisotropy = 8; // stay sharp when viewed at an angle
  // UI canvases aren't power-of-two; skip mipmaps (crisp head-on text anyway and
  // it avoids the WebGL mipmap-generation warnings on these non-PoT textures).
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;

  const material = new MeshBasicMaterial({
    map: texture,
    fog: false, // never let the haze eat the text
    toneMapped: false, // keep the exact authored colors
    transparent, // let the rounded corners (and soft shadow) show the scene behind
    // Discard the fully-transparent corner pixels so a rounded card still writes
    // depth cleanly (no dark fringe, no sorting surprises with the dust/glows).
    alphaTest: transparent ? 0.02 : 0,
  });

  return new Mesh(new PlaneGeometry(width, height), material);
}

// =============================================================================
// Card-drawing helpers (the polished "Market Harvest" look)
// -----------------------------------------------------------------------------
// Small shared canvas helpers so the welcome panel, choice cards, and readout
// board all draw the SAME rounded cream cards with a soft drop shadow and crisp
// borders. They take a 2D context and plain pixel coordinates.
// =============================================================================

// Trace a rounded-rectangle path (does not fill/stroke — the caller does).
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Draw one rounded card: an optional soft drop shadow, a fill, and a border.
// `shadow` lifts the card off whatever is behind it (we draw onto a transparent
// canvas so the shadow shows through to the scene).
function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    radius?: number;
    shadow?: boolean;
  } = {},
): void {
  const { fill = UI.cream, stroke, lineWidth = 0, radius = 28, shadow = false } = opts;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = UI.shadow;
    ctx.shadowBlur = radius * 1.4;
    ctx.shadowOffsetY = radius * 0.35;
  }
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  if (stroke && lineWidth > 0) {
    roundRectPath(ctx, x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth, radius);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Shrink-to-fit a single line of text to a maximum width, returning the px font
// size that fits (so titles never spill off their card).
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight = "bold",
  minSize = 12,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px sans-serif`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px sans-serif`;
  }
  return size;
}

// Word-wrap `text` to `maxWidth` (in the CURRENT ctx.font) and draw it left-
// aligned from (x, y) downward; returns the y just past the last line.
function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = "left",
): number {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = align;
  const anchorX = align === "center" ? x + maxWidth / 2 : x;
  let line = "";
  let cursorY = y;
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, anchorX, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += lineHeight;
  }
  ctx.textAlign = prevAlign;
  return cursorY;
}

// =============================================================================
// speedCardText
// The exact words shown on the "Machine Speed" card: the control's name on top,
// and the current setting below in ‹ chevrons › that hint "click to change."
// Both the builder (first draw) and the ProductionSystem (each click) use this,
// so the card always reads the same way.
// =============================================================================
function speedCardText(label: string): string {
  return `Machine Speed\n‹ ${label} ›`;
}

// =============================================================================
// hireCardText
// The words on the "Hire Worker" card: the action on top, and the current crew
// size out of the cap below. Once the crew is full it reads "Team Full" so the
// student can see there is no more room (the cap keeps the floor tidy). Both the
// builder and the ProductionSystem use this, so the card always reads the same.
// =============================================================================
function hireCardText(count: number): string {
  const max = CONSTANTS.maxWorkers;
  const top = count >= max ? "Team Full" : "Hire Worker";
  return `${top}\n${count} / ${max}`;
}

// =============================================================================
// expandCardText
// The words on the one-time "Expand the Line" card, for each of its states:
// locked (until the foreman's news), ready to start, under construction (with a
// countdown of runs left), and finished. Both the builder and the ProductionSystem
// use this, so the card always reads the same way.
// =============================================================================
function expandCardText(
  unlocked: boolean,
  state: "none" | "building" | "done",
  runsLeft: number,
): string {
  if (!unlocked) return "Expand Line\nSee foreman";
  if (state === "building") {
    return `Expanding…\n${runsLeft} run${runsLeft === 1 ? "" : "s"} left`;
  }
  if (state === "done") return "Line\nExpanded ✓";
  return "Expand the\nLine";
}

// =============================================================================
// repairCardText
// The words on the "Repair" card for each state: nothing wrong (the normal,
// reassuring state), a machine that has broken down and needs fixing, and the
// short "repairing" moment after it is clicked. Both the builder and the
// ProductionSystem use this, so the card always reads the same way.
// =============================================================================
function repairCardText(state: "ok" | "broken" | "repairing"): string {
  if (state === "broken") return "Repair\nMachine ⚠";
  if (state === "repairing") return "Repairing…\nplease wait";
  return "Machine\nOK ✓";
}

// =============================================================================
// buildControlStation
// Builds the foreman's desk as a Group, plus the six control cards as separate
// meshes (so the caller can make each one a clickable RayInteractable entity).
// Everything is built around the desk's own origin (X = left/right, Y = up,
// Z = depth), with the player standing on the +Z side looking toward -Z.
//
// The cards are returned in CONTROL order — [Machine Speed, Hire Worker, Order
// Materials, Repair, Expand the Line, Start Line] — so the caller can tag each
// with its matching action.
// =============================================================================
// =============================================================================
// makeControlCard
// One control-desk button in the polished cream-card style: a rounded cream card
// (soft shadow + navy border) with an emoji icon on the left and the 1–2 line
// label on the right. The "Start Line" GO button is `primary` — a solid gold
// card with white text, so the action to take stands out (like the welcome's
// gold "Choose" pill). Returns a mesh with `userData.setText` so the
// ProductionSystem can rewrite the label later (the icon + style are kept).
// =============================================================================
function makeControlCard(opts: {
  text: string;
  icon: string;
  width: number;
  height: number;
  primary?: boolean;
}): Mesh {
  const { text, icon, width, height, primary = false } = opts;
  const pxPerMeter = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const fill = primary ? UI.gold : UI.cream;
  const textColor = primary ? UI.white : UI.navy;
  const border = primary ? UI.goldText : UI.navy;
  const M = Math.round(H * 0.06); // margin for the shadow
  const radius = Math.round(H * 0.22);

  const paint = (label: string): void => {
    ctx.clearRect(0, 0, W, H);
    drawCard(ctx, M, M, W - M * 2, H - M * 2, {
      fill,
      stroke: border,
      lineWidth: Math.max(4, Math.round(H * 0.03)),
      radius,
      shadow: true,
    });

    const lines = label.split("\n");
    // Icon on the left, vertically centered.
    const iconSize = Math.round(H * 0.42);
    const iconCx = M + (W - M * 2) * 0.18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${iconSize}px sans-serif`;
    ctx.fillText(icon, iconCx, H / 2);

    // Label on the right: shrink the font until the widest line + the stack fit.
    const textLeft = M + (W - M * 2) * 0.34;
    const textRight = W - M - Math.round(W * 0.05);
    const textW = textRight - textLeft;
    const textCx = (textLeft + textRight) / 2;
    let size = Math.round(H * 0.26);
    const fits = (s: number): boolean => {
      ctx.font = `bold ${s}px sans-serif`;
      let widest = 0;
      for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
      return widest <= textW && lines.length * s * 1.25 <= H - M * 2 - 16;
    };
    while (size > 14 && !fits(size)) size -= 2;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillStyle = textColor;
    const lineH = size * 1.25;
    const top = H / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, textCx, top + i * lineH));
  };

  paint(text);

  const card = makeCanvasPlane(canvas, width, height, true);
  const texture = (card.material as MeshBasicMaterial).map!;
  card.userData.setText = (newText: string): void => {
    paint(newText);
    texture.needsUpdate = true;
  };
  return card;
}

function buildControlStation(): { desk: Group; cards: Mesh[] } {
  const C = CONSTANTS;
  const desk = new Group();
  desk.name = "ControlStation";

  const wood = new MeshLambertMaterial({ color: C.deskWoodColor });

  // The sturdy cabinet body of the desk.
  const cabinet = new Mesh(
    new BoxGeometry(C.deskWidth, C.deskHeight, C.deskDepth),
    wood,
  );
  cabinet.position.set(0, C.deskHeight / 2, 0);
  desk.add(cabinet);

  // A slightly overhanging top slab, tipped up toward the player like a console.
  const slab = new Mesh(
    new BoxGeometry(C.deskWidth + 0.1, 0.06, C.deskDepth + 0.08),
    wood,
  );
  slab.position.set(0, C.deskHeight + 0.02, 0);
  slab.rotation.x = C.consoleTilt;
  desk.add(slab);

  // The six control cards, evenly spaced across the console and lying flat on the
  // angled top so they face up toward the player. Each is a cream rounded card
  // (the same look as the welcome/dashboard) with an emoji icon and its label.
  // The "Start Line" GO button is the gold `primary` card so it clearly stands
  // apart. Each entry is { label, icon } in CONTROL order (so index === action).
  const cardSpecs = [
    { label: speedCardText(C.speeds[C.defaultSpeedIndex].label), icon: "⚙️" }, // CONTROL.speed
    { label: hireCardText(0), icon: "👷" }, // CONTROL.hire — "Hire Worker  0 / max"
    { label: "Order\nMaterials", icon: "📦" }, // CONTROL.order
    { label: repairCardText("ok"), icon: "🔧" }, // CONTROL.repair — "Machine OK" until a Phase 3 breakdown
    { label: expandCardText(false, "none", 0), icon: "🏗️" }, // CONTROL.expand — locked until the foreman's news
    { label: "Start\nLine", icon: "▶️" }, // CONTROL.start — the gold GO button
  ];
  const count = cardSpecs.length;
  const cards = cardSpecs.map((spec, i) => {
    const card = makeControlCard({
      text: spec.label,
      icon: spec.icon,
      width: C.cardWidth,
      height: C.cardHeight,
      primary: i === CONTROL.start,
    });
    // Center the whole row on the desk: i spreads evenly around x = 0.
    card.position.set(
      (i - (count - 1) / 2) * C.cardSpacing,
      C.deskHeight + C.cardLift,
      0,
    );
    // Match the console's tilt: rotate the upright plane down onto the angled
    // top so its face points up-and-toward the player.
    card.rotation.x = C.consoleTilt - Math.PI / 2;
    return card;
  });

  return { desk, cards };
}

// =============================================================================
// buildReadoutBoard
// Draws the whole readout board onto one canvas — parchment background, then a
// row per meter (a navy label, a simple bar, and the number) — and wraps it on
// a single plane. One canvas keeps the layout simple and the text crisp.
//
// The board is now LIVE: it keeps its current numbers in `userData.meters` and a
// `userData.redraw()` that repaints them. The ProductionSystem edits a meter's
// value/fill (and a 0..1 `highlight` glow) and calls redraw() to animate the
// board smoothly when a score changes.
// =============================================================================
function buildReadoutBoard(): Mesh {
  const C = CONSTANTS;

  // Canvas sized to match the board's shape, at a comfortable resolution.
  const pxPerMeter = 256;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.boardWidth * pxPerMeter);
  canvas.height = Math.round(C.boardHeight * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const Hc = canvas.height;

  // The board's LIVE state — one entry per meter, seeded from the starting
  // numbers in CONSTANTS. `highlight` is the gold-flash strength (1 = just
  // changed, fading to 0). The ProductionSystem edits these and calls redraw().
  const meters = C.readouts.map((r) => ({
    label: r.label,
    value: r.value,
    fill: r.fill,
    highlight: 0,
  }));

  // Card + layout geometry (all in canvas pixels). A margin leaves room for the
  // soft drop shadow; everything else sits inside the rounded cream card.
  const M = 26; // outer margin (shadow room)
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = Hc - M * 2;
  const P = 44; // inner padding
  const contentX = cardX + P;
  const contentW = cardW - P * 2;
  const titleH = 96; // height of the header area at the top
  const rowsTop = cardY + titleH + 16;
  const rowsBottom = cardY + cardH - P;
  const rowH = (rowsBottom - rowsTop) / meters.length;

  // Repaint the entire board from the live `meters` state.
  const paint = (): void => {
    ctx.clearRect(0, 0, W, Hc); // transparent — the rounded corners show the scene

    // The cream card: rounded, navy-bordered, lifted off the room with a shadow.
    drawCard(ctx, cardX, cardY, cardW, cardH, {
      fill: UI.cream,
      stroke: UI.navy,
      lineWidth: 6,
      radius: 34,
      shadow: true,
    });

    // Header: a navy title across the top + a thin divider beneath it.
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = UI.navy;
    ctx.font = `800 52px sans-serif`;
    ctx.fillText("📊 Factory Dashboard", contentX, cardY + titleH * 0.55);
    ctx.strokeStyle = UI.track;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(contentX, cardY + titleH + 4);
    ctx.lineTo(contentX + contentW, cardY + titleH + 4);
    ctx.stroke();

    meters.forEach((meter, i) => {
      const style = METER_STYLE[meter.label] ?? {
        icon: "•",
        bar: UI.gold,
        text: UI.goldText,
      };
      const rowTop = rowsTop + i * rowH;
      const labelY = rowTop + rowH * 0.34; // icon + label + number sit on the top line
      const barY = rowTop + rowH * 0.6; // the bar sits just below
      const barH = Math.min(26, rowH * 0.28);
      const barR = barH / 2;
      const numFont = Math.round(Math.min(40, rowH * 0.34));
      const glow = meter.highlight; // 0..1 gold flash for a just-changed score

      // Icon + label on the left.
      ctx.font = `700 ${numFont}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = UI.navy;
      ctx.fillText(`${style.icon} ${meter.label}`, contentX, labelY);

      // The number on the right, in the meter's own color. A fading gold pill
      // sits behind it the instant it changes, so the eye catches the update.
      ctx.font = `800 ${numFont}px sans-serif`;
      ctx.textAlign = "right";
      const numRight = contentX + contentW;
      if (glow > 0) {
        const textW = ctx.measureText(meter.value).width;
        const padX = numFont * 0.4;
        const boxH = numFont * 1.5;
        ctx.globalAlpha = glow;
        ctx.fillStyle = UI.gold;
        roundRectPath(
          ctx,
          numRight - textW - padX,
          labelY - boxH / 2,
          textW + padX * 2,
          boxH,
          boxH / 2,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = glow > 0.5 ? UI.navy : style.text;
      ctx.fillText(meter.value, numRight, labelY);

      // A rounded bar: a tan track, a colored fill showing the level. While
      // highlighted the fill brightens toward gold and fades back.
      roundRectPath(ctx, contentX, barY, contentW, barH, barR);
      ctx.fillStyle = UI.track;
      ctx.fill();
      const fillW = Math.max(barH, contentW * Math.max(0, Math.min(1, meter.fill)));
      roundRectPath(ctx, contentX, barY, fillW, barH, barR);
      ctx.fillStyle = style.bar;
      ctx.fill();
      if (glow > 0) {
        ctx.globalAlpha = glow * 0.7;
        ctx.fillStyle = UI.gold;
        roundRectPath(ctx, contentX, barY, fillW, barH, barR);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  };

  paint(); // first draw, using the starting numbers

  const board = makeCanvasPlane(canvas, C.boardWidth, C.boardHeight, true);
  board.name = "ReadoutBoard";

  // Hand the ProductionSystem a way to drive the board: it edits userData.meters
  // and calls redraw() to repaint. The texture is reused, so nothing leaks. Each
  // repaint also pushes the same numbers to the top-left HTML dashboard, so the
  // corner card and the in-world board always agree.
  const texture = (board.material as MeshBasicMaterial).map!;
  board.userData.meters = meters;
  board.userData.redraw = (): void => {
    paint();
    texture.needsUpdate = true;
    updateFactoryHud(meters);
  };

  return board;
}

// =============================================================================
// placeControlStation
// Builds the foreman's control station and drops it into the world, right in
// front of where the player spawns. Called by the SetupSystem once a business
// is picked (so the floor stays clear while the student is still choosing).
//
// A sturdy wooden desk sits in front of the player with its top angled up like a
// console. Four cards rest on it: "Machine Speed", "Hire Worker", "Order
// Materials", and the amber "Start Line". Each card is its OWN entity marked
// RayInteractable (so the InputSystem treats it as a pointer/ray target) and
// carries a ControlCard with the action it performs. The ProductionSystem
// watches for clicks and acts on Machine Speed, Hire Worker, and Start Line.
// =============================================================================
function placeControlStation(world: World): void {
  const station = buildControlStation();
  station.desk.position.set(0, 0, CONSTANTS.deskZ); // just in front of the player
  applyShadows(station.desk); // the wooden desk grounds itself (the cards are self-lit, so they're skipped)
  const deskEntity = world.createTransformEntity(station.desk);
  // The cards come back in CONTROL order, so the card's index IS its action.
  station.cards.forEach((card, action) => {
    world
      .createTransformEntity(card, deskEntity)
      .addComponent(RayInteractable)
      .addComponent(ControlCard, { action });
  });

  // A small hint banner floats just above the desk. It starts hidden; the
  // ProductionSystem shows the first-time hints on it one line at a time, then
  // fades them away. It reuses the fade-able parchment note panel for a look that
  // matches the rest of the boards.
  const C = CONSTANTS;
  const hint = makeNotePlane(C.hints.width, C.hints.height);
  hint.name = "HintBanner";
  hint.position.set(0, C.hints.y, C.deskZ + C.hints.forward);
  world.createTransformEntity(hint).addComponent(HintSign);
}

// =============================================================================
// placeReadoutBoard
// Builds the readout board and hangs it high above the production line, where
// the player can glance UP from the desk and read it. It shows five meters —
// Production Output, Raw Materials, Worker Satisfaction, Price, and Profit
// Margin — and is display only (no interaction). Also called by the SetupSystem
// once a business is picked.
// =============================================================================
function placeReadoutBoard(world: World): void {
  const C = CONSTANTS;
  const board = buildReadoutBoard();
  board.position.set(0, C.boardY, C.lineCenterZ);
  board.rotation.x = C.boardTilt; // tip it down a touch toward the player
  const boardEntity = world.createTransformEntity(board);
  boardEntity.addComponent(ReadoutBoard); // so the ProductionSystem can find it

  // Seed the Price row with the chosen business's selling price (coins per
  // product) before the board is ever drawn, so it reads right from the start.
  // The Phase 3 competitor news is what later drops it. (Both this and the
  // ProductionSystem read the same activeFactory.basePrice, so they always agree.)
  const factory = world.globals.activeFactory as FactoryType | null;
  if (factory) {
    const meters = board.userData.meters as Array<{
      label: string;
      value: string;
      fill: number;
    }>;
    const priceRow = meters.find((m) => m.label === "Price");
    if (priceRow) {
      priceRow.value = `$${factory.basePrice}`;
      priceRow.fill = factory.basePrice / C.priceMax;
      (board.userData.redraw as () => void)();
    }
  }

  // The farm-vs-factory note sits just below the board, a touch toward the
  // player. It starts hidden + see-through; the ProductionSystem fills in the
  // number and fades it in the first time a run finishes. We keep a reference to
  // it on the board, so the system can reach it through the ReadoutBoard query.
  const note = makeNotePlane();
  note.position.set(0, C.noteY, C.lineCenterZ + C.noteForward);
  note.rotation.x = C.boardTilt; // share the board's gentle downward tilt
  world.createTransformEntity(note);
  board.userData.note = note;
}

// =============================================================================
// reportBandFor
// Sorts one final score into a simple high / medium / low band using the cutoffs
// on its REPORT_SCORES entry. The value is in the SAME units as the cutoffs:
// Production Output is the raw running total, while Worker Satisfaction and Profit
// Margin are fractions (0..1). Used by the End of Day report to pick the feedback.
// =============================================================================
function reportBandFor(score: ReportScore, value: number): ReportBand {
  if (value >= score.high) return "high";
  if (value >= score.medium) return "medium";
  return "low";
}

// =============================================================================
// fitWrappedLines
// Shrink a block of text until its word-wrapped lines fit BOTH a max width AND a
// max height, then return the chosen lines + font size + line height. Shared by
// the End of Day report's per-score history line, dynamic summary, and closing
// takeaway so each one fills its own area without ever overflowing.
// =============================================================================
function fitWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  weight = "", // "" for normal, "bold" for headings
  minSize = 11,
): { lines: string[]; size: number; lineH: number } {
  const prefix = weight ? `${weight} ` : "";
  let size = startSize;
  let lines: string[] = [];
  while (size > minSize) {
    ctx.font = `${prefix}${size}px sans-serif`;
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * size * 1.25 <= maxHeight) break;
    size -= 2;
  }
  ctx.font = `${prefix}${size}px sans-serif`;
  return { lines, size, lineH: size * 1.25 };
}

// =============================================================================
// buildReportBoard
// Draws the End of Day Production Report onto one parchment canvas plane. It reads
// the three FINAL live scores (it NEVER recomputes a score), and for each shows
// the name, the final number, and a plain-language line connecting how the student
// did to what really happened in Virginia's factories (REPORT_WRAP — the "high"
// line for a high OR medium day, the "low" line only for a low day). A gold band
// carries the dynamic how-balanced summary (REPORT_SUMMARY, chosen by how many
// scores landed "high"), and a teal band at the very bottom carries the one
// always-shown closing takeaway (REPORT_CLOSING). All text shrinks-to-fit so
// nothing overflows. The board starts see-through so it can be faded in.
// =============================================================================
function buildReportBoard(
  output: number, // final Production Output (the raw running total)
  satisfaction: number, // final Worker Satisfaction (0..1)
  margin: number, // final profit SHARE (0..1) — used to GRADE the Profit score
  profitCoins: number, // final Profit in coins — what the Profit row DISPLAYS
  factory: FactoryType | null, // the chosen business (fills in "{product}")
): Mesh {
  const C = CONSTANTS;
  const R = C.report;

  // Pair each report score with the value it is GRADED on, by label. Profit is
  // graded on its profitability margin (how well costs were managed), even though
  // it DISPLAYS the actual coins below — the bands live in margin units.
  const gradeByLabel: Record<string, number> = {
    "Production Output": output,
    "Worker Satisfaction": satisfaction,
    Profit: margin,
  };

  // Work out each row's band, number, and history line once, up front, and count
  // the strong scores so we can pick the matching dynamic summary line.
  let highCount = 0;
  const rows = REPORT_SCORES.map((score) => {
    const value = gradeByLabel[score.label] ?? 0;
    const band = reportBandFor(score, value);
    if (band === "high") highCount += 1;
    const wrap = REPORT_WRAP[score.label];
    return {
      band, // drives the row's star grade (★★★ high / ★★ medium / ★ low)
      label: score.label,
      // Profit shows the actual coins; the percentage scores show "%"; Production
      // Output shows a whole number. (All match how the live board reads them.)
      value:
        score.label === "Profit"
          ? `$${Math.round(profitCoins)}`
          : score.percent
            ? `${Math.round(value * 100)}%`
            : String(Math.round(value)),
      // The history line: the "high" text for a high OR medium day, the "low" text
      // only for a genuinely low day. (Falls back to the per-band feedback if a
      // score ever lacks a REPORT_WRAP entry.)
      comment: wrap
        ? band === "low"
          ? wrap.low
          : wrap.high
        : fillNews(score.feedback[band], factory),
    };
  });
  const summary = fillNews(REPORT_SUMMARY[highCount], factory);

  // Canvas sized to match the board's shape, at a comfortable resolution.
  const pxPerMeter = 256;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(R.width * pxPerMeter);
  canvas.height = Math.round(R.height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Card geometry: a rounded cream card (navy border + soft shadow).
  const M = Math.round(H * 0.025);
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;
  const radius = Math.round(H * 0.045);

  ctx.clearRect(0, 0, W, H);
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius,
    shadow: true,
  });

  // Three bands, all clipped to the card's rounded corners: a gold title across
  // the top, a gold dynamic-summary band, and a teal "big takeaway" band at the
  // very bottom (teal = the course's Virginia-history accent).
  const title = "🏁 End of Day — Production Report";
  const titleH = Math.round(cardH * 0.12);
  const closingH = Math.round(cardH * 0.15); // teal closing band (very bottom)
  const summaryH = Math.round(cardH * 0.16); // gold summary band (just above it)
  const closingTop = cardY + cardH - closingH;
  const summaryTop = closingTop - summaryH;

  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, cardY, cardW, titleH);
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, summaryTop, cardW, summaryH);
  ctx.fillStyle = new Color(C.tealColor).getStyle();
  ctx.fillRect(cardX, closingTop, cardW, closingH);
  ctx.restore();

  // Title text, white, centered, shrunk to fit.
  ctx.fillStyle = UI.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let titleSize = Math.round(titleH * 0.5);
  ctx.font = `bold ${titleSize}px sans-serif`;
  while (titleSize > 16 && ctx.measureText(title).width > cardW * 0.9) {
    titleSize -= 2;
    ctx.font = `bold ${titleSize}px sans-serif`;
  }
  ctx.fillText(title, W / 2, cardY + titleH / 2);

  // The three score blocks fill the space between the title and summary bands.
  const areaTop = cardY + titleH;
  const blockH = (summaryTop - areaTop) / rows.length;
  const pad = cardX + Math.round(cardW * 0.05);
  const right = cardX + cardW - Math.round(cardW * 0.05);
  const innerW = right - pad;

  rows.forEach((row, i) => {
    const top = areaTop + i * blockH;

    // The score name (with its icon) on the left and the final number on the
    // right, in the meter's own color.
    const style = METER_STYLE[row.label];
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(blockH * 0.24)}px sans-serif`;
    const nameY = top + blockH * 0.28;
    ctx.fillStyle = UI.navy;
    ctx.textAlign = "left";
    ctx.fillText(`${style?.icon ?? ""} ${row.label}`.trim(), pad, nameY);
    ctx.fillStyle = style?.text ?? UI.navy;
    ctx.textAlign = "right";
    ctx.fillText(row.value, right, nameY);

    // A friendly star grade beside the number — ★★★ for a great score, ★★ for
    // a solid one, ★ for a tough day. Kids read stars at a glance, like any
    // level-clear screen. (The gray stars are drawn first, then the earned
    // ones are drawn over them in gold.)
    const numberWidth = ctx.measureText(row.value).width; // number font still active
    const starCount = row.band === "high" ? 3 : row.band === "medium" ? 2 : 1;
    ctx.font = `${Math.round(blockH * 0.2)}px sans-serif`;
    const allStars = "★★★";
    const starsX =
      right - numberWidth - Math.round(cardW * 0.02) - ctx.measureText(allStars).width;
    ctx.textAlign = "left";
    ctx.fillStyle = UI.track;
    ctx.fillText(allStars, starsX, nameY);
    ctx.fillStyle = UI.gold;
    ctx.fillText("★".repeat(starCount), starsX, nameY);

    // The history line under the name, wrapped + shrunk to fit the lower half of
    // the block (so blocks never overlap).
    const fit = fitWrappedLines(
      ctx,
      row.comment,
      innerW,
      blockH * 0.46,
      Math.round(blockH * 0.2),
    );
    ctx.fillStyle = UI.navy;
    ctx.textAlign = "left";
    ctx.font = `${fit.size}px sans-serif`;
    let y = top + blockH * 0.54;
    fit.lines.forEach((line) => {
      ctx.fillText(line, pad, y);
      y += fit.lineH;
    });

    // A thin tan divider under each block except the last, like a row rule.
    if (i < rows.length - 1) {
      ctx.strokeStyle = UI.track;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, top + blockH);
      ctx.lineTo(right, top + blockH);
      ctx.stroke();
    }
  });

  // Dynamic summary line (white on the gold band), shrunk to fit.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.white;
  const sum = fitWrappedLines(ctx, summary, cardW * 0.9, summaryH * 0.82, Math.round(summaryH * 0.3), "bold");
  ctx.font = `bold ${sum.size}px sans-serif`;
  const sumStart = summaryTop + summaryH / 2 - ((sum.lines.length - 1) * sum.lineH) / 2;
  sum.lines.forEach((line, i) => ctx.fillText(line, W / 2, sumStart + i * sum.lineH));

  // The one closing takeaway (white on the teal band), always shown, shrunk to fit.
  ctx.fillStyle = UI.white;
  const close = fitWrappedLines(ctx, REPORT_CLOSING, cardW * 0.9, closingH * 0.82, Math.round(closingH * 0.3), "bold");
  ctx.font = `bold ${close.size}px sans-serif`;
  const closeStart = closingTop + closingH / 2 - ((close.lines.length - 1) * close.lineH) / 2;
  close.lines.forEach((line, i) => ctx.fillText(line, W / 2, closeStart + i * close.lineH));

  const board = makeCanvasPlane(canvas, R.width, R.height, true);
  board.name = "ReportBoard";

  // Start see-through so the ProductionSystem can fade it in once it appears.
  // (Fades via opacity, so no alpha-test — see makeNotePlane.)
  const material = board.material as MeshBasicMaterial;
  material.transparent = true;
  material.alphaTest = 0;
  material.opacity = 0;

  return board;
}

// =============================================================================
// makeNotePlane
// A small parchment message panel with a teal border and navy text, word-wrapped
// to fit and centered. It starts hidden and see-through; the caller fills in the
// wording via userData.setText and fades it in. Used for the "farm vs. factory"
// callout under the board (default size) AND reused for the foreman's speech
// panel (pass a width/height).
// =============================================================================
function makeNotePlane(
  width: number = CONSTANTS.noteWidth,
  height: number = CONSTANTS.noteHeight,
): Mesh {
  const C = CONSTANTS;
  // A high pixel density keeps the text crisp even when a panel (like the hint
  // banner) floats right in front of the player — the old 256 px/m was upscaled
  // and looked blurry up close. Capped so the widest panel's canvas stays a
  // GPU-safe size (≤ 4096 px on its longest side).
  const pxPerMeter = Math.min(1024, 4096 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Draw the note as a rounded cream card (gold border + soft shadow) with navy
  // text, word-wrapped and centered — the same look as the welcome/dashboard.
  // The font shrinks only as much as needed so the lines fit the panel height.
  const M = Math.round(H * 0.05);
  const paint = (text: string): void => {
    ctx.clearRect(0, 0, W, H);
    drawCard(ctx, M, M, W - M * 2, H - M * 2, {
      fill: UI.cream,
      stroke: UI.gold,
      lineWidth: Math.max(4, Math.round(H * 0.025)),
      radius: Math.round(H * 0.16),
      shadow: true,
    });

    ctx.fillStyle = UI.navy;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = W * 0.84;
    let fontSize = Math.round(H * 0.2);
    let lines: string[] = [];
    while (fontSize > 12) {
      ctx.font = `bold ${fontSize}px sans-serif`;
      lines = wrapLines(ctx, text, maxWidth);
      if (lines.length * fontSize * 1.3 <= H * 0.8) break;
      fontSize -= 4;
    }

    const lineHeight = fontSize * 1.3;
    const top = H / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, top + i * lineHeight));
  };

  paint(""); // empty until the first run fills it in

  const note = makeCanvasPlane(canvas, width, height, true);
  note.name = "FarmNote";
  note.visible = false; // shown after the first run finishes

  // Make the material fade-able. The note fades via material.opacity, so it must
  // NOT also alpha-test (that would clip the whole card at low opacity) — only
  // the transparent blending from makeCanvasPlane's `transparent` flag is kept.
  const material = note.material as MeshBasicMaterial;
  material.transparent = true;
  material.alphaTest = 0;
  material.opacity = 0;

  const texture = material.map!;
  note.userData.setText = (text: string): void => {
    paint(text);
    texture.needsUpdate = true;
  };

  return note;
}

// =============================================================================
// wrapLines
// Breaks a sentence into lines that each fit within `maxWidth` (using the
// canvas's CURRENT font). A small helper for word-wrapped text like the note.
// =============================================================================
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// =============================================================================
// titleCase
// Tiny helper: "iron ore" -> "Iron Ore". The businesses store their product and
// material in lowercase; we capitalize them for the on-line name-tags.
// =============================================================================
function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

// =============================================================================
// makeChoiceCard
// Draws one "pick this business" card in the polished cream-card style: a rounded
// cream panel (soft shadow + navy border) with a gold header band holding the
// business name in white, the plain-language description wrapped underneath in
// navy, and a small gold "Choose" pill at the bottom so it reads as a button.
// =============================================================================
function makeChoiceCard(factory: FactoryType): Mesh {
  const C = CONSTANTS;
  const pxPerMeter = 512;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.choiceW * pxPerMeter);
  canvas.height = Math.round(C.choiceH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 18; // margin (shadow room)
  const radius = 30;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;

  // The cream card body (rounded, soft shadow).
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    radius,
    shadow: true,
  });

  // Gold header band across the top, clipped to the card's rounded top corners.
  const headerH = Math.round(cardH * 0.19);
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // Navy border on top of everything.
  roundRectPath(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, radius);
  ctx.strokeStyle = UI.navy;
  ctx.lineWidth = 6;
  ctx.stroke();

  // The business name, white, centered on the gold band.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.white;
  const nameSize = fitFontSize(ctx, factory.name, cardW - 50, Math.round(headerH * 0.5), "bold");
  ctx.font = `bold ${nameSize}px sans-serif`;
  ctx.fillText(factory.name, W / 2, cardY + headerH / 2);

  // Description: navy, wrapped, centered under the header.
  ctx.fillStyle = UI.navy;
  ctx.textBaseline = "top";
  const bodySize = Math.round(H * 0.048);
  ctx.font = `${bodySize}px sans-serif`;
  const padX = Math.round(cardW * 0.1);
  drawWrapped(
    ctx,
    factory.blurb,
    cardX + padX,
    cardY + headerH + Math.round(cardH * 0.07),
    cardW - padX * 2,
    bodySize * 1.34,
    "center",
  );

  // A small gold "Choose" pill near the bottom, so the card reads as a button.
  const pillW = Math.round(cardW * 0.56);
  const pillH = Math.round(cardH * 0.1);
  const pillX = W / 2 - pillW / 2;
  const pillY = cardY + cardH - pillH - Math.round(cardH * 0.06);
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = UI.gold;
  ctx.fill();
  ctx.fillStyle = UI.white;
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(pillH * 0.5)}px sans-serif`;
  ctx.fillText("Choose", W / 2, pillY + pillH / 2);

  const card = makeCanvasPlane(canvas, C.choiceW, C.choiceH, true);
  card.name = `Choice_${factory.id}`;
  return card;
}

// =============================================================================
// makeWelcomePanel
// Draws the "modal" header card that sits above the choice cards: a rounded cream
// card (soft shadow + navy border) with a small gold uppercase eyebrow, the big
// navy title, and an amber-bordered inner box carrying a heading + one friendly
// line — the same shape as the farming module's "How to Play" card.
// =============================================================================
function makeWelcomePanel(): Mesh {
  const C = CONSTANTS;
  const pxPerMeter = 512;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.welcomePanelW * pxPerMeter);
  canvas.height = Math.round(C.welcomePanelH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 22;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;

  // The cream modal card.
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius: 36,
    shadow: true,
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Font sizes are based on the WIDTH (not the height), so the panel can be kept
  // SHORT — hugging its text — without shrinking the words.
  const eyebrowFont = Math.round(W * 0.0165);
  const titleMax = Math.round(W * 0.055);
  const headingFont = Math.round(W * 0.0275);
  const descFont = Math.round(W * 0.019);

  // Eyebrow: small, gold, spaced-out capitals (we insert spaces for the spacing).
  ctx.fillStyle = UI.goldText;
  ctx.font = `bold ${eyebrowFont}px sans-serif`;
  ctx.fillText("G E T   S T A R T E D", W / 2, cardY + Math.round(H * 0.1));

  // Title: big and navy.
  ctx.fillStyle = UI.navy;
  const titleSize = fitFontSize(ctx, "The Factory Floor", cardW - 120, titleMax, "bold");
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText("The Factory Floor", W / 2, cardY + Math.round(H * 0.28));

  // Inner amber box, sized to HUG its heading + one line of description (so there
  // is no big empty space below the text), anchored near the bottom of the card.
  const boxPadTop = Math.round(H * 0.065);
  const headingGap = Math.round(H * 0.095); // heading baseline → description baseline
  const boxPadBot = Math.round(H * 0.065);
  const boxH = boxPadTop + headingFont + headingGap + descFont + boxPadBot;
  const boxX = cardX + Math.round(cardW * 0.05);
  const boxW = cardW - Math.round(cardW * 0.1);
  const boxY = cardY + cardH - boxH - Math.round(H * 0.06);
  drawCard(ctx, boxX, boxY, boxW, boxH, {
    fill: UI.innerBox,
    stroke: UI.gold,
    lineWidth: 5,
    radius: 24,
  });

  ctx.fillStyle = UI.navy;
  ctx.textBaseline = "middle";
  ctx.font = `bold ${headingFont}px sans-serif`;
  ctx.fillText("Pick Your Business", W / 2, boxY + boxPadTop + headingFont / 2);

  ctx.font = `${descFont}px sans-serif`;
  ctx.fillText(
    "Run a factory in early Virginia — choose a trade below to begin!",
    W / 2,
    boxY + boxPadTop + headingFont + headingGap + descFont / 2,
  );

  const panel = makeCanvasPlane(canvas, C.welcomePanelW, C.welcomePanelH, true);
  panel.name = "WelcomePanel";
  return panel;
}

// =============================================================================
// buildWelcome
// Puts the opening "pick your business" screen in front of the player: one cream
// "modal" header card (eyebrow + title + inner box) and three business choice
// cards in a row beneath it (one per FACTORY_TYPES entry). The header card is a
// non-interactive entity; each choice card is its OWN entity so it can be clicked.
//
// Every piece is tagged `WelcomePart` so the SetupSystem can sweep the whole
// welcome away in one go once a choice is made. Each card also carries a
// `FactoryChoice` remembering which business it offers.
// =============================================================================
function buildWelcome(world: World): void {
  const C = CONSTANTS;

  // The cream modal header card (non-interactive).
  const panel = makeWelcomePanel();
  panel.position.set(0, C.welcomePanelY, C.welcomeZ);
  world.createTransformEntity(panel).addComponent(WelcomePart);

  // Three business choice cards, evenly spaced left-to-right (i = 0,1,2 ->
  // -gap, 0, +gap). Each is clickable and remembers its place in FACTORY_TYPES.
  FACTORY_TYPES.forEach((factory, i) => {
    const card = makeChoiceCard(factory);
    card.position.set((i - 1) * C.choiceGap, C.choiceY, C.welcomeZ);
    world
      .createTransformEntity(card)
      .addComponent(RayInteractable)
      .addComponent(FactoryChoice, { index: i })
      .addComponent(WelcomePart);
  });
}

// =============================================================================
// makeGoalPanel
// Draws the "Your Factory, Your Goal" card: a rounded cream panel (navy border +
// soft shadow) with a teal title band across the top, a navy "Today you will:"
// heading, and the four plain-language goals as wrapped bullets beneath it. The
// body font shrinks just enough that the whole list fits the card. The words all
// live in TOUR_GOAL, so they are easy to edit in one place.
// =============================================================================
function makeGoalPanel(): Mesh {
  const C = CONSTANTS.tour;
  const pxPerMeter = 360;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.goalPanelW * pxPerMeter);
  canvas.height = Math.round(C.goalPanelH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 24;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;
  const radius = 36;

  // The cream card body.
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius,
    shadow: true,
  });

  // A teal title band across the top, clipped to the card's rounded top corners.
  const bandH = Math.round(cardH * 0.16);
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = new Color(CONSTANTS.tealColor).getStyle();
  ctx.fillRect(cardX, cardY, cardW, bandH);
  ctx.restore();

  // Title (cream) centered on the teal band.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.cream;
  const titleSize = fitFontSize(ctx, TOUR_GOAL.title, cardW - 80, Math.round(bandH * 0.52), "bold");
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText(TOUR_GOAL.title, W / 2, cardY + bandH / 2);

  // Body area below the band.
  const padX = Math.round(cardW * 0.07);
  const bodyX = cardX + padX;
  const bodyW = cardW - padX * 2;
  const bodyTop = cardY + bandH + Math.round(cardH * 0.06);
  const bodyBottom = cardY + cardH - Math.round(cardH * 0.05);
  const indent = Math.round(bodyW * 0.045); // hanging indent for wrapped bullet lines

  // Lay out the heading + wrapped bullets at a given body font size. Returns the
  // bottom Y the text reaches (so we can shrink the font until it all fits). When
  // `draw` is false it only measures; the two passes share the exact same layout.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const layoutBody = (size: number, draw: boolean): number => {
    const lineH = size * 1.32;
    let y = bodyTop;

    // Heading.
    if (draw) {
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillStyle = UI.navy;
      ctx.fillText(TOUR_GOAL.heading, bodyX, y);
    }
    y += lineH + size * 0.45; // heading + a little breathing room before the bullets

    // Bullets, each wrapped with a hanging indent.
    for (const bullet of TOUR_GOAL.bullets) {
      ctx.font = `${size}px sans-serif`; // set before wrapLines (it measures with the current font)
      const wrapped = wrapLines(ctx, bullet, bodyW - indent);
      wrapped.forEach((line, i) => {
        if (draw) {
          ctx.fillStyle = UI.navy;
          ctx.fillText(i === 0 ? `•  ${line}` : line, i === 0 ? bodyX : bodyX + indent, y);
        }
        y += lineH;
      });
      y += size * 0.4; // a small gap between bullets
    }
    return y;
  };

  let bodySize = Math.round(H * 0.052);
  while (bodySize > 18 && layoutBody(bodySize, false) > bodyBottom) {
    bodySize -= 2;
  }
  layoutBody(bodySize, true);

  const panel = makeCanvasPlane(canvas, C.goalPanelW, C.goalPanelH, true);
  panel.name = "GoalCard";
  return panel;
}

// =============================================================================
// buildGoalCard
// Floats the "Your Factory, Your Goal" card in front of the player (on the clear
// floor, before the cockpit appears) with two buttons beneath it: a gold "Start
// the tour" and a quieter "Skip tour". The panel is a non-interactive entity;
// each button is its OWN clickable entity carrying a TourButton action. Every
// piece is tagged TourPart so the TutorialSystem can sweep the whole goal card
// away in one go once a button is clicked.
// =============================================================================
function buildGoalCard(world: World): void {
  const C = CONSTANTS.tour;

  const panel = makeGoalPanel();
  panel.position.set(0, C.goalPanelY, C.goalPanelZ);
  world.createTransformEntity(panel).addComponent(TourPart);

  // "Start the tour" — the gold primary button.
  const start = makeTextPlane({
    text: "Start the tour",
    icon: "▶️",
    width: C.startButtonW,
    height: C.startButtonH,
    background: UI.gold,
    textColor: UI.white,
    border: UI.goldText,
  });
  start.position.set(...C.startButtonPos);
  world
    .createTransformEntity(start)
    .addComponent(RayInteractable)
    .addComponent(TourButton, { action: TOUR.start })
    .addComponent(TourPart);

  // "Skip tour" — a smaller, quieter cream button beside it.
  const skip = makeTextPlane({
    text: "Skip tour",
    width: C.skipButtonW,
    height: C.skipButtonH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.navy,
  });
  skip.position.set(...C.skipButtonPos);
  world
    .createTransformEntity(skip)
    .addComponent(RayInteractable)
    .addComponent(TourButton, { action: TOUR.skip })
    .addComponent(TourPart);
}

// =============================================================================
// makeDust
// Creates the cloud of floating motes as a single Points object (one efficient
// draw call for hundreds of specks). We also stash a per-mote "rise speed" on
// the object so the DustSystem can drift each one at its own gentle pace.
// =============================================================================
function makeDust(W: number, L: number, H: number): Points {
  const count = CONSTANTS.dustCount;
  const positions = new Float32Array(count * 3); // x,y,z for each mote
  const riseSpeeds = new Float32Array(count); // how fast each mote rises

  // Scatter the motes randomly through the inside of the room (with a small
  // margin so none start buried in a wall).
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * (W - 1); // x
    positions[i * 3 + 1] = 0.3 + Math.random() * (H - 0.8); // y
    positions[i * 3 + 2] = (Math.random() - 0.5) * (L - 1); // z
    riseSpeeds[i] =
      CONSTANTS.dustRiseMin +
      Math.random() * (CONSTANTS.dustRiseMax - CONSTANTS.dustRiseMin);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    color: CONSTANTS.dustColor,
    size: CONSTANTS.dustSize,
    transparent: true,
    opacity: CONSTANTS.dustOpacity,
    sizeAttenuation: true, // motes farther away look smaller
    depthWrite: false, // motes shouldn't hide things behind them
  });

  const points = new Points(geometry, material);
  points.name = "Dust";
  // Stash the per-mote speeds so the DustSystem can read them each frame.
  points.userData.riseSpeeds = riseSpeeds;
  return points;
}

// =============================================================================
// Dust component + DustSystem
// The tag component marks "this entity is the dust cloud." The system gently
// animates it every frame: each mote rises and, when it reaches the ceiling,
// wraps back down to the floor, while the whole cloud slowly turns.
//
// This is atmosphere, not game logic — it just keeps the air feeling alive.
// =============================================================================
export const Dust = createComponent("Dust", {});

export class DustSystem extends createSystem({
  dust: { required: [Dust] },
}) {
  // The lowest and highest a mote is allowed to float.
  private floorLevel = 0.3;
  private ceilingLevel = ROOM.height - 0.4;

  update(delta: number): void {
    for (const entity of this.queries.dust.entities) {
      const points = entity.object3D as Points;

      // Read the position numbers and the per-mote speeds (no new objects made
      // here — important for staying smooth, especially in VR).
      const position = points.geometry.attributes.position;
      const array = position.array as Float32Array;
      const speeds = points.userData.riseSpeeds as Float32Array;

      for (let i = 0; i < speeds.length; i++) {
        const yIndex = i * 3 + 1; // the Y value for this mote
        array[yIndex] += speeds[i] * delta; // drift it gently upward
        if (array[yIndex] > this.ceilingLevel) {
          array[yIndex] = this.floorLevel; // reached the top — wrap to the floor
        }
      }
      position.needsUpdate = true; // tell the GPU the motes moved

      // Turn the whole cloud very slowly for a touch of swirl.
      points.rotation.y += CONSTANTS.dustSwirl * delta;
    }
  }
}

// =============================================================================
// PlayerBoundsSystem — the safety net that keeps the player inside the room.
//
// The invisible wall barrier (above) already stops the player at the engine
// level, but this is the guaranteed backstop: EVERY frame it nudges the player
// back inside CONSTANTS.bounds, so they can never walk through a wall, off the
// edge of the floor, or drop below it — no matter what.
//
// It runs at priority 100 (registered in buildEnvironment), AFTER the built-in
// LocomotionSystem (priority -5) has moved the player for the frame, so it gets
// the final say on where the player ends up.
//
// HOW IT STICKS: with `locomotion.useWorker`, the locomotion engine keeps its
// OWN copy of the player's position and copies it onto the player rig every
// frame. So just moving the rig here would be undone next frame. To make the
// fix stick we ALSO call the engine's `teleport()` with the corrected spot,
// which tells the engine "this is where the player actually is." In worker mode
// teleport eases the engine toward that spot, which keeps the correction gentle.
// =============================================================================
export class PlayerBoundsSystem extends createSystem({}) {
  private corrected!: Vector3; // scratch vector reused each frame (no per-frame allocation)
  private locomotor: { teleport: (p: Vector3) => void } | null = null; // the locomotion engine, looked up once

  init(): void {
    this.corrected = new Vector3();
  }

  update(): void {
    const b = CONSTANTS.bounds;
    const pos = this.player.position; // the player rig, in world coordinates
    let outOfBounds = false;

    // Hold side-to-side (X) within the room's inner bounds.
    if (pos.x < b.minX) {
      pos.x = b.minX;
      outOfBounds = true;
    } else if (pos.x > b.maxX) {
      pos.x = b.maxX;
      outOfBounds = true;
    }

    // Hold forward-back (Z) within the room's inner bounds.
    if (pos.z < b.minZ) {
      pos.z = b.minZ;
      outOfBounds = true;
    } else if (pos.z > b.maxZ) {
      pos.z = b.maxZ;
      outOfBounds = true;
    }

    // Hold height at standing floor level — never let the player drop below the
    // floor (jumping UP, above the floor, is left alone).
    if (pos.y < b.floorY) {
      pos.y = b.floorY;
      outOfBounds = true;
    }

    // If we had to move the player, push the corrected spot into the locomotion
    // engine too, so it does not copy its old out-of-bounds position back next
    // frame. (We only do this when needed, so normal walking is untouched.)
    if (outOfBounds) {
      if (!this.locomotor) {
        const loco = this.world.getSystem(LocomotionSystem) as unknown as {
          locomotor?: { teleport: (p: Vector3) => void };
        } | null;
        this.locomotor = loco?.locomotor ?? null;
      }
      this.locomotor?.teleport(
        this.corrected.set(pos.x, b.floorY, pos.z),
      );
    }
  }
}

// =============================================================================
// SetupSystem — runs the opening "pick a business" hand-off.
//
// It watches the welcome cards. The moment one is clicked (the InputSystem tags
// it `Pressed`), it loads that business as the active one and switches the scene
// from "choosing" to "running":
//   1. Restyle the machine — recolor it and rewrite its three name-tags, so the
//      generic machine becomes that business's loom / furnace / saw, with the
//      right material going in and product coming out.
//   2. Remember the choice in world.globals.activeFactory (for later steps).
//   3. Bring in the foreman's control station and the readout board.
//   4. Clear the whole welcome screen away.
//
// Everything happens on the ONE shared floor — we only swap looks, labels, and
// numbers; the room, lights, fog, and camera never change.
// =============================================================================
export class SetupSystem extends createSystem({
  picked: { required: [FactoryChoice, Pressed] },
  machines: { required: [FactoryMachine] },
  welcomeParts: { required: [WelcomePart] },
}) {
  init(): void {
    // Fires the instant a choice card is clicked.
    this.queries.picked.subscribe("qualify", (entity) => {
      // Only the first pick counts — ignore anything after the hand-off.
      if (this.globals.activeFactory) return;
      const index = entity.getValue(FactoryChoice, "index") ?? 0;
      this.startFactory(FACTORY_TYPES[index]);
    });
  }

  // Loads one business as the active one and reveals the running factory.
  private startFactory(factory: FactoryType): void {
    Sfx.clunk(); // a soft confirming click as the choice is made (also wakes the audio)

    // 1. Restyle the machine + rewrite the intake / machine / output tags.
    for (const machine of this.queries.machines.entities) {
      const parts = machine.object3D!.userData;
      (parts.machineMaterial as MeshLambertMaterial).color.set(factory.color);
      parts.machineLabel.userData.setText(factory.machine);
      parts.intakeLabel.userData.setText(titleCase(factory.material));
      parts.outputLabel.userData.setText(titleCase(factory.product));
    }

    // 2. Remember the choice — its numbers are now the "active" values.
    this.globals.activeFactory = factory;

    // The dashboard's status pill flips from "Getting Ready" to the running
    // business, so the corner card reflects that the day has begun.
    setFactoryHudStatus(factory.name, "active");

    // 3. Hide the menu FIRST: clear the welcome + the three choice cards away
    //    (this frees their canvas textures too), so the spot in front of the
    //    player is empty before the goal card takes it over. We copy the set to
    //    an array first, since disposing changes the live query. The cards are
    //    RayInteractable, so we drop that tag FIRST — that lets the InputSystem
    //    tidy up its pointer state while the entity is still alive, instead of
    //    warning when it reaches for an already-disposed entity.
    for (const part of [...this.queries.welcomeParts.entities]) {
      if (part.hasComponent(RayInteractable)) {
        part.removeComponent(RayInteractable);
      }
      part.dispose();
    }

    // 4. THEN show the opening goal card ("Your Factory, Your Goal") on the now
    //    clear floor. The cockpit (desk, board, foreman) is NOT revealed yet —
    //    the TutorialSystem brings it in when the student clicks "Start the tour"
    //    (or "Skip tour"), then runs the foreman's guided walkthrough. Holding
    //    the cockpit back keeps the goal card clean and uncluttered, the same way
    //    the welcome screen had the floor to itself.
    buildGoalCard(this.world);
  }
}

// =============================================================================
// ScoreTween — one in-flight number-and-bar animation on the readout board.
// The ProductionSystem keeps a short list of these so a changed score glides to
// its new value while a gold highlight fades. (Scratch animation state, not
// entity tracking — safe to hold on the system.)
// =============================================================================
type ScoreTween = {
  index: number; // which board row this animates
  fromValue: number; // starting number
  toValue: number; // ending number
  fromFill: number; // starting bar fill (0..1)
  toFill: number; // ending bar fill (0..1)
  format: (n: number) => string; // how to print the number ("18" / "62%")
  valueElapsed: number; // seconds into the value glide
  hiElapsed: number; // seconds into the highlight fade (outlasts the glide)
};

// =============================================================================
// ProductionSystem — the core game loop on the foreman's desk.
//
// It watches the control cards and the running line:
//   • Machine Speed card clicked → cycle Slow → Medium → Fast and repaint the
//     card with the new setting.
//   • Hire Worker card clicked → add a worker figure at the next station along
//     the line (up to the cap) and show the crew size on the card. More workers
//     raise how much a run makes and add a little wage cost (both show next run).
//   • Start Line card clicked → run one batch: scroll the belt and glide a good
//     from the intake to the output over a few seconds (raw material turns into
//     the finished good as it passes the machine). When the good lands, update
//     the three scores together — Production Output climbs by the batch, Worker
//     Satisfaction reacts to the pace + staffing, and Profit Margin reflects the
//     business, speed, and the crew's wages — animating the board smoothly with a
//     brief gold highlight, and reveal the farm-vs-factory note.
//
// Phase 3 (a competitor opens nearby) is watched through world.globals: the price
// drops on the Price meter, and ONE random challenge strikes — a MACHINE
// BREAKDOWN (the machine stops with smoke + an amber lamp until the new Repair
// control fixes it) or a DELAYED SHIPMENT (raw materials fall sharply and every
// reorder takes a while to arrive). The student copes with the existing controls.
//
// Everything is data-driven from CONSTANTS (speeds, workforce, satisfaction) and
// the active business in world.globals.activeFactory, so the feel can be balanced
// in one place.
// =============================================================================
export class ProductionSystem extends createSystem({
  pressedCards: { required: [ControlCard, Pressed] }, // a card was just clicked
  allCards: { required: [ControlCard] }, // every desk card (to repaint / show / hide without a click)
  boards: { required: [ReadoutBoard] }, // the scores board (appears after pick)
  lines: { required: [FactoryMachine] }, // the production line (to animate)
  hints: { required: [HintSign] }, // the first-time hint banner above the desk
  foremen: { required: [Foreman] }, // the foreman (to tuck his speech panel away when the report appears)
  foremanPrompts: { required: [ForemanPrompt] }, // his "Next" news card (tucked away once the day is over)
}) {
  // --- Current settings + run state ---
  private speedIndex = CONSTANTS.defaultSpeedIndex; // 0=Slow, 1=Medium, 2=Fast
  private running = false; // is a batch playing right now?
  private runElapsed = 0; // seconds into the current run
  private runDuration = 0; // how long this run lasts (from the speed setting)
  private runBeltSpeed = 0; // belt scroll speed locked in for this run
  private runWearAdd = 0; // machine wear this run adds when it finishes (from the pace)
  private itemsMade = 0; // how many goods this batch produced
  private transformed = false; // has the good passed the machine this run?
  private brokeDown = false; // did the machine break down on THIS run?
  private pendingMargin = 0; // the margin to show when this run finishes
  private pendingSatisfaction = 0; // the satisfaction to show when this run finishes
  private pendingMaterials = 0; // the raw-material stock to show when this run finishes

  // --- Workforce (grown by the "Hire Worker" card) ---
  private workers = 0; // how many workers are on the line (0..maxWorkers)
  private fastStreak = 0; // Fast runs in a row (resets the moment we ease off)

  // --- Raw materials (drained by runs, refilled by "Order Materials") ---
  private materials = 0; // units of raw material in stock right now
  private materialsIndex = 0; // which board row is Raw Materials

  // --- One-time teaching callouts (shown the FIRST time each action happens) ---
  private taughtFirstHire = false; // has the "factories employed hundreds" note been shown?
  private taughtLowMaterials = false; // has the "steady supply of materials" note been shown?
  private taughtWorkerSafety = false; // has the worker-safety note been shown once?

  // --- Machine wear (pushing Fast piles it on; a breakdown grows likely) ---
  private machineWear = 0; // extra breakdown chance built up from the pace

  // --- One-time costs (orders, repairs, the expansion investment) ------------
  // A single "burden" subtracted from Profit Margin that heals back out over runs,
  // so every one-time cost shows as a dip now that recovers later.
  private costBurden = 0;

  // --- Expand the Line (the one-time scaling upgrade) ------------------------
  private expandUnlocked = false; // the foreman's rising-demand news opens this up
  private expandState: "none" | "building" | "done" = "none"; // build progress
  private expandRunsLeft = 0; // runs left before the expansion starts paying off
  private expandAnnexAdded = false; // have we added the visible "new section" yet?

  // --- Authoritative score values (the board shows animated copies of these) --
  private outputValue = 0; // Production Output (a running total — always climbs)
  private satisfactionValue = 0; // Worker Satisfaction, as a fraction 0..1
  private marginValue = 0; // profit as a SHARE of each sale (0..1) — drives the Costs/Profit split + grades the report
  private lastRevenue = 0; // coins the last run sold for (items × price) — sizes the Costs/Profit coin amounts
  private outputIndex = 0; // which board row is Production Output
  private satisfactionIndex = 0; // which board row is Worker Satisfaction
  private costsIndex = 0; // which board row is Costs (coins paid out)
  private profitIndex = 0; // which board row is Profit (coins kept)

  // --- Belt scroll bounds (mirror buildProductionLine's slat layout) ---
  private beltLeft = 0;
  private beltRight = 0;
  private beltSpan = 1;

  // --- Farm-vs-factory note fade-in (first time only) ---
  private noteShown = false;
  private noteFadeElapsed = 0;

  // --- Active board animations ---
  private tweens: ScoreTween[] = [];

  // --- Selling price (a live value now — Phase 3's competitor drops it) -------
  private priceValue = 0; // coins earned per product right now (seeded from the business)
  private priceIndex = 0; // which board row is Price
  private priceSeeded = false; // have we loaded the business's starting price yet?

  // --- Phase 3: the competitor + the one random challenge --------------------
  private competitionStarted = false; // has Phase 3 begun (price dropped + challenge picked)?
  private challenge: Phase3Challenge | null = null; // the random setback chosen for this phase
  // MACHINE BREAKDOWN challenge:
  private machineDown = false; // is the machine broken and waiting to be repaired?
  private repairing = false; // is the Repair control fixing it right now?
  private repairElapsed = 0; // seconds into the short repair
  private smokePuffs: Mesh[] = []; // the little smoke puffs rising while it is down
  private smokeGeometry: SphereGeometry | null = null; // shared puff geometry (disposed on repair)
  private smokeElapsed = 0; // animation clock for the drifting puffs
  // DELAYED SHIPMENT challenge:
  private shipmentSlow = false; // are reorders delayed for the rest of the phase?
  private shipmentPending = false; // is a delayed shipment on its way right now?
  private shipmentElapsed = 0; // seconds the current shipment has been in transit

  // --- End of Day Production Report (the foreman's closing wrap-up) -----------
  private reportShown = false; // has the end-of-day report been built yet?
  private reportBoard: Mesh | null = null; // the report panel (faded in once shown)
  private reportFadeElapsed = 0; // seconds into the report's fade-in
  // The celebration confetti that bursts when the report appears. All its
  // buffers are made ONCE in spawnConfetti; advanceConfetti only writes into
  // them (no per-frame allocation), then the whole thing is disposed.
  private confetti: Points | null = null;
  private confettiEntity: ReturnType<World["createTransformEntity"]> | null = null;
  private confettiVelocities: Float32Array | null = null;
  private confettiElapsed = 0;

  // --- Gentle guidance: the breathing pulse + tidy "only active controls" -----
  private pulseClock = 0; // animation clock for the breathing pulse
  private controlsLaidOut = false; // have we done the first show/hide + even layout of the cards?
  private startHinted = false; // has the first "run your factory" hint been queued (after the tour)?

  // --- First-time hints (shown once each, one at a time, then they fade) ------
  private runsFinished = 0; // how many normal runs have completed (drives which hint shows)
  private hintQueue: string[] = []; // hints waiting to be shown, in order
  private hintQueued = { start: false, again: false, foreman: false }; // each hint is queued only once
  private hintActive = false; // is a hint fading through right now?
  private hintElapsed = 0; // seconds into the current hint's fade-in / hold / fade-out

  init(): void {
    const C = CONSTANTS;

    // Where the slats may travel before wrapping back to the belt's left end.
    this.beltLeft = -C.conveyorLength / 2 + 0.3;
    this.beltRight = C.conveyorLength / 2 - 0.3;
    this.beltSpan = this.beltRight - this.beltLeft;

    // Find the board rows we drive, and read their starting numbers.
    this.outputIndex = C.readouts.findIndex(
      (r) => r.label === "Production Output",
    );
    this.satisfactionIndex = C.readouts.findIndex(
      (r) => r.label === "Worker Satisfaction",
    );
    this.materialsIndex = C.readouts.findIndex(
      (r) => r.label === "Raw Materials",
    );
    this.costsIndex = C.readouts.findIndex((r) => r.label === "Costs");
    this.profitIndex = C.readouts.findIndex((r) => r.label === "Profit");
    this.priceIndex = C.readouts.findIndex((r) => r.label === "Price");
    this.outputValue = parseFloat(C.readouts[this.outputIndex].value); // "120" -> 120
    this.satisfactionValue =
      parseFloat(C.readouts[this.satisfactionIndex].value) / 100; // "68%" -> 0.68
    // Seed the profit SHARE + a reference sale; the Costs/Profit meters' seed
    // numbers (CONSTANTS.readouts) already match these, and the first run replaces
    // them with the real coin breakdown.
    this.marginValue = C.profitDisplay.seedMargin; // 0.22
    this.lastRevenue = C.profitDisplay.seedRevenue; // 100 coins
    this.materials = C.materials.start; // raw-material units in stock to begin

    // React the instant a control card is clicked (InputSystem adds Pressed).
    this.queries.pressedCards.subscribe("qualify", (entity) => {
      this.onCardPressed(entity);
    });
  }

  update(delta: number): void {
    // Load the chosen business's starting Price into our live value the first
    // chance we get (once a business is picked); the board row was already seeded.
    if (!this.priceSeeded && this.globals.activeFactory) this.seedPrice();

    // The first time the control station exists, lay the cards out — hiding the
    // ones that aren't active yet and spacing the rest evenly. (The brand-new
    // player's welcome hint waits until the foreman's guided tour is over, below.)
    if (!this.controlsLaidOut && this.queries.allCards.entities.size > 0) {
      this.controlsLaidOut = true;
      this.updateControlVisibility();
    }

    // Once the guided tour is done, welcome a player who has not run a batch yet
    // with the first hint. A SKIPPED tour shows it (they never ran); a FINISHED
    // tour already had the student run the line in the walkthrough, so runsFinished
    // is past zero and the now-redundant "press Start" hint is simply never queued.
    if (
      this.globals.tourDone &&
      !this.startHinted &&
      this.controlsLaidOut &&
      this.runsFinished === 0
    ) {
      this.startHinted = true;
      this.queueHint("start");
    }

    // The foreman's "demand is rising" news opens up the big scaling decision:
    // unlock the Expand the Line card the first time we see the flag flip.
    if (this.globals.demandRising && !this.expandUnlocked) {
      this.expandUnlocked = true;
      this.repaintExpandCard();
      this.updateControlVisibility(); // the Expand card joins the row now that it's usable
    }

    // The foreman's Phase 3 news (a competitor opened nearby) drops the price and
    // springs one random challenge — done once, the first time we see the flag.
    if (this.globals.competitionOpen && !this.competitionStarted) {
      this.startCompetition();
    }

    // The foreman's closing news calls the end of the day — show the final
    // Production Report once, the first time we see the flag.
    if (this.globals.dayOver && !this.reportShown) this.showReport();

    if (this.running) this.advanceRun(delta);
    if (this.repairing) this.advanceRepair(delta);
    if (this.shipmentPending) this.advanceShipment(delta);
    if (this.machineDown || this.repairing) this.animateSmoke(delta);
    this.advanceBoard(delta);
    this.advanceNote(delta);
    this.advanceReport(delta);
    this.advanceConfetti(delta);

    // The finishing layer of guidance: gently breathe the control to use next,
    // and fade the first-time hints through one at a time. Held back until the
    // guided tour is done so it never fights the tutorial's own highlight + lines.
    if (this.globals.tourDone) {
      this.updateGuidancePulse(delta);
      this.advanceHints(delta);
    }
  }

  // --- Click handling --------------------------------------------------------
  private onCardPressed(entity: ReturnType<World["createTransformEntity"]>): void {
    Sfx.clunk(); // a soft woody click whenever a control is used
    const action = entity.getValue(ControlCard, "action") ?? 0;
    if (action === CONTROL.speed) {
      this.cycleSpeed(entity);
    } else if (action === CONTROL.hire) {
      this.hireWorker(entity);
    } else if (action === CONTROL.order) {
      this.orderMaterials();
    } else if (action === CONTROL.repair) {
      this.repairMachine();
    } else if (action === CONTROL.expand) {
      this.expandLine();
    } else if (action === CONTROL.start) {
      this.startRun();
    }
  }

  // Step the machine speed Slow → Medium → Fast → Slow and repaint the card.
  private cycleSpeed(
    entity: ReturnType<World["createTransformEntity"]>,
  ): void {
    this.speedIndex = (this.speedIndex + 1) % CONSTANTS.speeds.length;
    const setText = entity.object3D?.userData.setText as
      | ((text: string) => void)
      | undefined;
    setText?.(speedCardText(CONSTANTS.speeds[this.speedIndex].label));
  }

  // Add one worker to the line (up to the cap): drop a figure at the next open
  // station, then repaint the card with the new crew size. The worker raises
  // capacity and adds wages, but those only show on the NEXT run (when the scores
  // update) — so hiring stays a calm, deliberate choice with no surprise jumps.
  private hireWorker(
    entity: ReturnType<World["createTransformEntity"]>,
  ): void {
    const C = CONSTANTS;
    if (this.workers >= C.maxWorkers) return; // crew is full — keep the floor tidy

    // Place a worker figure at the next station along the front of the belt.
    const stationX = workerStationX(this.workers);
    for (const line of this.queries.lines.entities) {
      const group = line.object3D;
      if (!group) continue;
      const worker = makeWorker();
      worker.position.set(stationX, 0, C.workerStationZ);
      applyShadows(worker); // each hired worker grounds itself with a soft shadow
      group.add(worker);
      (group.userData.workers as Group[]).push(worker);
    }
    this.workers += 1;

    // Repaint the card with the new crew size (it flips to "Team Full" at the cap).
    const setText = entity.object3D?.userData.setText as
      | ((text: string) => void)
      | undefined;
    setText?.(hireCardText(this.workers));

    // Teaching moment (once): the sheer scale of factory labor next to a farm.
    // Fires on the FIRST hire — which the guided tour now walks the student
    // through — and never repeats. The note sits center-under-board, clear of the
    // foreman's (right-shifted) speech bubble, so it doesn't overlap his line.
    if (!this.taughtFirstHire) {
      this.taughtFirstHire = true;
      this.setNote(CALLOUTS.firstHire);
    }
  }

  // Order materials: top the Raw Materials stock back up to full, and charge for
  // it with a dip in Profit Margin (you spent coins to restock). The refill shows
  // on the board right away — the meter climbs back up while the margin ticks down.
  private orderMaterials(): void {
    const C = CONSTANTS;
    if (this.materials >= C.materials.max) return; // already full — nothing to order

    // Phase 3 "delayed shipment": orders no longer arrive at once. Start a
    // shipment on its way; it lands a few seconds later (see advanceShipment).
    if (this.shipmentSlow) {
      if (this.shipmentPending) return; // a shipment is already on the way
      this.shipmentPending = true;
      this.shipmentElapsed = 0;
      const factory = this.globals.activeFactory as FactoryType | null;
      const material = factory ? factory.material : "materials";
      this.setNote(
        `Order placed. Shipments are delayed right now, so the ${material} will take a moment to arrive…`,
      );
      return;
    }

    // Normal: the order arrives at once — top the stock back up to full for a cost.
    const before = this.materials;
    this.materials = C.materials.max;
    this.tweenMaterials(before); // glide the meter back up to full
    this.addCost(C.materials.orderMarginCost); // the order costs you a little margin now
  }

  // Expand the Line: the one-time upgrade. Only after the foreman has opened it up,
  // and only once. It costs an upfront investment (a margin dip now) and then sits
  // "under construction" for a few runs making nothing extra — before it starts
  // adding a chunk to every batch, for good.
  private expandLine(): void {
    const C = CONSTANTS;
    if (!this.expandUnlocked) return; // the foreman hasn't announced rising demand yet
    if (this.expandState !== "none") return; // one time only
    this.expandState = "building";
    this.expandRunsLeft = C.expand.runsToPayoff;
    this.addCost(C.expand.marginCost); // pay the investment now (margin dips)
    this.repaintExpandCard();
  }

  // --- Running the line ------------------------------------------------------
  private startRun(): void {
    if (this.running) return; // already making a batch — ignore extra clicks
    const factory = this.globals.activeFactory as FactoryType | null;
    if (!factory) return; // no business picked yet
    const C = CONSTANTS;

    // A Phase 3 breakdown stops the line until it is repaired. Nudge the student
    // toward the Repair control instead of starting a run.
    if (this.machineDown || this.repairing) {
      this.flashBrokenDown(factory);
      return;
    }

    // Out of raw materials? The line cannot run until you reorder. Flash the empty
    // meter and say so, but do not start a run.
    if (this.materials <= 0) {
      this.flashOutOfMaterials(factory);
      return;
    }

    const speed = C.speeds[this.speedIndex];
    this.running = true;
    this.runElapsed = 0;
    // Track how long we've been pushing the hardest pace (it resets the moment we
    // ease off) — it feeds both crew strain and (through wear) breakdowns.
    this.fastStreak = speed.strainsCrew ? this.fastStreak + 1 : 0;

    // Decide up front whether the machine breaks down this run. The chance is the
    // business's own risk PLUS the wear we've built up running fast — so a
    // breakdown grows likely "later," the more we push the pace.
    const chance = Math.min(
      C.breakdown.maxChance,
      factory.breakdownRisk + this.machineWear,
    );
    this.brokeDown = Math.random() < chance;

    if (this.brokeDown) {
      // A short stall: the warning lamps flash red and no goods are made. We finish
      // it in finishRunBroken() once the stall time is up.
      this.runDuration = C.breakdown.seconds;
      this.runBeltSpeed = 0;
      this.setGauge(C.breakdown.lightColor, 1); // warning lights on
      return;
    }

    // A normal run. Work out the batch — the machine's output, plus every worker's
    // hands, plus the expansion bonus once it's finished — but capped by the
    // materials on hand (you can't make more cloth than you have cotton).
    const wanted =
      Math.round(factory.throughput * speed.multiplier) +
      this.workers * C.workerOutputPerRun +
      (this.expandState === "done" ? C.expand.outputBonus : 0);
    this.itemsMade = Math.min(wanted, this.materials);
    this.pendingMaterials = this.materials - this.itemsMade;
    this.pendingMargin = this.marginFor(factory, speed);
    this.pendingSatisfaction = this.satisfactionFor(factory, speed);
    this.runDuration = speed.runSeconds;
    this.runBeltSpeed = speed.beltSpeed;
    this.runWearAdd = speed.wearAdd;
    this.transformed = false;

    Sfx.startHum(); // swell in the soft machine drone while the line runs

    // Put the traveling good back at the intake, colored like raw material, with
    // its finished-good glow turned off until it reaches the output.
    for (const line of this.queries.lines.entities) {
      const product = line.object3D?.userData.product as Mesh | undefined;
      if (!product) continue;
      (product.material as MeshLambertMaterial).color.set(
        CONSTANTS.rawMaterialColor,
      );
      product.position.x = CONSTANTS.intakeX;
      product.visible = true;
      const glow = product.userData.glow as Mesh | undefined;
      if (glow) (glow.material as MeshBasicMaterial).opacity = 0;
    }
  }

  // Profit margin = the current margin (the live selling price minus material
  // cost, as a share of price), nudged by the speed setting, trimmed by every
  // worker's wages, and weighed down by any recent one-time cost (orders / repairs
  // / expansion), kept in a sensible 0..99% band. The price is a live value now —
  // Phase 3's competitor can lower it — so a price cut shows up here as a thinner
  // margin on the next run.
  private marginFor(factory: FactoryType, speed: SpeedSetting): number {
    const price = this.priceValue || factory.basePrice; // live price (falls back until seeded)
    const base = (price - factory.materialCost) / price;
    const wages = this.workers * CONSTANTS.workerWageMargin;
    return Math.max(
      0,
      Math.min(0.99, base + speed.marginBonus - wages - this.costBurden),
    );
  }

  // Worker Satisfaction shifts from its current value by how this run was set up:
  // the pace's own drift (a calm pace lifts, flat-out strains), an extra strain
  // for a long Fast streak ("Fast for too long"), and a hit for being short-handed
  // for the machine's pace ("too few workers for the output"). Kept in its band.
  private satisfactionFor(factory: FactoryType, speed: SpeedSetting): number {
    const C = CONSTANTS;
    let delta = speed.satisfactionDrift;
    // Running the hardest pace run after run wears the crew down a bit more each time.
    if (speed.strainsCrew) delta -= C.fastStreakPenalty * (this.fastStreak - 1);
    // Too few hands for the pace stretches everyone thin.
    const needed = Math.ceil(
      (factory.throughput * speed.multiplier) / C.workerKeepUp,
    );
    const short = Math.max(0, needed - this.workers);
    delta -= short * C.understaffPenalty;
    return Math.max(
      C.satisfactionMin,
      Math.min(C.satisfactionMax, this.satisfactionValue + delta),
    );
  }

  // Advance the run each frame: a broken run just pulses red warning lamps, while
  // a normal run scrolls the belt and glides the good across. Either way, finish
  // when the time is up.
  private advanceRun(delta: number): void {
    const C = CONSTANTS;
    this.runElapsed += delta;
    const p = Math.min(this.runElapsed / this.runDuration, 1);

    // Broken run: pulse the warning lamps; nothing travels the line.
    if (this.brokeDown) {
      const pulse =
        0.4 +
        0.6 * (0.5 + 0.5 * Math.sin(this.runElapsed * C.breakdown.blinkSpeed));
      this.setGauge(C.breakdown.lightColor, pulse);
      if (p >= 1) this.finishRunBroken();
      return;
    }

    const eased = this.smooth(p);

    for (const line of this.queries.lines.entities) {
      const data = line.object3D?.userData;
      if (!data) continue;

      // Scroll the belt slats (look only), wrapping ones that run off the end.
      const slats = data.slats as Mesh[] | undefined;
      if (slats) {
        for (const slat of slats) {
          slat.position.x += this.runBeltSpeed * delta;
          while (slat.position.x > this.beltRight) {
            slat.position.x -= this.beltSpan;
          }
        }
      }

      // Glide the good from the intake across to the output crate.
      const product = data.product as Mesh | undefined;
      if (product) {
        product.position.x = C.intakeX + (C.outputX - C.intakeX) * eased;
        const glow = product.userData.glow as Mesh | undefined;
        // Raw material becomes the finished good as it passes the machine (x=0).
        if (!this.transformed && product.position.x >= 0) {
          (product.material as MeshLambertMaterial).color.set(
            this.productColor(),
          );
          // Tint the halo to match the finished good, ready to glow at the output.
          if (glow) (glow.material as MeshBasicMaterial).color.set(this.productColor());
          this.transformed = true;
        }
        // Swell the soft halo in over the last stretch of the line, so the
        // FINISHED good glows as it arrives at the output crate.
        if (glow) {
          const g = CONSTANTS.goodGlow;
          const frac = (product.position.x - C.intakeX) / (C.outputX - C.intakeX); // 0..1 along the line
          const k = (frac - g.startFrac) / (1 - g.startFrac); // 0 until startFrac, then climbs to 1
          (glow.material as MeshBasicMaterial).opacity =
            this.smooth(Math.max(0, Math.min(1, k))) * g.maxOpacity;
        }
      }
    }

    if (p >= 1) this.finishRun();
  }

  private finishRun(): void {
    const C = CONSTANTS;
    this.running = false;
    Sfx.stopHum(); // the line stops — fade the machine drone out
    Sfx.coin(); // a batch was made and sold — a bright "ka-ching"

    // Tuck the good away until the next run (and turn its glow back off).
    for (const line of this.queries.lines.entities) {
      const product = line.object3D?.userData.product as Mesh | undefined;
      if (!product) continue;
      product.visible = false;
      product.position.x = C.intakeX;
      const glow = product.userData.glow as Mesh | undefined;
      if (glow) (glow.material as MeshBasicMaterial).opacity = 0;
    }

    // Drain the raw materials this batch used, gliding the meter down.
    const beforeMaterials = this.materials;
    this.materials = this.pendingMaterials;
    this.tweenMaterials(beforeMaterials);

    // Update the three scores for this batch, each gliding smoothly on the board:
    // Production Output always climbs by the batch size, Worker Satisfaction
    // settles where the pace + staffing put it, and Profit Margin reflects the
    // business, speed, the crew's wages, and any recent one-time cost.
    const newOutput = this.outputValue + this.itemsMade;
    this.startTween(
      this.outputIndex,
      this.outputValue,
      newOutput,
      this.outputValue / C.outputMax,
      newOutput / C.outputMax,
      (n) => String(Math.round(n)),
    );
    this.outputValue = newOutput;

    this.startTween(
      this.satisfactionIndex,
      this.satisfactionValue,
      this.pendingSatisfaction,
      this.satisfactionValue,
      this.pendingSatisfaction,
      (n) => `${Math.round(n * 100)}%`,
    );
    this.satisfactionValue = this.pendingSatisfaction;

    // Profit + Costs: the COIN breakdown of THIS run's sale. Revenue = items made ×
    // price; the margin is the profit share, so profit = revenue × margin and the
    // rest is cost. Glide both meters from the old breakdown to the new one.
    const fromRevenue = this.lastRevenue;
    const fromMargin = this.marginValue;
    this.lastRevenue = this.itemsMade * this.priceValue;
    this.marginValue = this.pendingMargin;
    this.tweenCostProfit(fromRevenue, fromMargin);

    // The pace wears the machine (Slow's negative wearAdd lets it recover), and any
    // one-time cost heals back out of the margin a little.
    this.machineWear = Math.max(
      0,
      Math.min(C.breakdown.maxChance, this.machineWear + this.runWearAdd),
    );
    this.costBurden = Math.max(0, this.costBurden - C.costRecover);

    // Move the expansion along: a finished run counts down the build, and when it
    // lands, the new section appears and every future batch gets the bonus.
    if (this.expandState === "building") {
      this.expandRunsLeft -= 1;
      if (this.expandRunsLeft <= 0) {
        this.expandState = "done";
        this.addExpansionAnnex();
        this.updateControlVisibility(); // the one-time Expand control is spent — tuck it away
      }
      this.repaintExpandCard();
    }

    // Reveal the farm-vs-factory note with this batch's number.
    this.showNote();

    // Teaching moment (once): if this run drained the stock low, explain why a
    // steady supply mattered. Runs AFTER showNote so it takes the note that run.
    this.maybeTeachLowMaterials();

    // Teaching moment (once): name worker safety if the crew is being pushed low.
    this.maybeTeachWorkerSafety();

    // First-time hints: nudge the player to keep going after the first run, then
    // toward the foreman after the second. Each is shown only once, then it fades.
    this.runsFinished += 1;
    this.globals.runsCompleted = this.runsFinished;
    if (this.runsFinished === 1) this.queueHint("again");
    if (this.runsFinished === 2) this.queueHint("foreman");
  }

  // A broken run: no goods, a repair cost, a frustrated crew — but fixing it
  // clears the built-up wear, so easing off the pace afterward keeps it running.
  private finishRunBroken(): void {
    const C = CONSTANTS;
    this.running = false;
    this.brokeDown = false;
    this.setGauge(C.windowColor, 0.9); // warning lights back to the normal warm glow
    this.machineWear = 0; // the repair clears the wear

    // Repairs trim the margin (recovers over later runs), and the breakdown knocks
    // the crew's spirits a little.
    this.addCost(C.breakdown.marginCost);
    const newSat = Math.max(
      C.satisfactionMin,
      this.satisfactionValue - C.breakdown.satisfactionHit,
    );
    this.startTween(
      this.satisfactionIndex,
      this.satisfactionValue,
      newSat,
      this.satisfactionValue,
      newSat,
      (n) => `${Math.round(n * 100)}%`,
    );
    this.satisfactionValue = newSat;

    // Tell the player what happened and why.
    const factory = this.globals.activeFactory as FactoryType | null;
    const machine = factory ? factory.machine : "machine";
    this.setNote(
      `The ${machine} broke down! Running flat-out wears it out. ` +
        `Repairs cost you this batch — ease off the pace to keep it running.`,
    );
  }

  private productColor(): number {
    const factory = this.globals.activeFactory as FactoryType | null;
    return factory ? factory.color : CONSTANTS.rawMaterialColor;
  }

  // --- Board animation -------------------------------------------------------
  // Queue a smooth glide for one board row, replacing any glide already running
  // on that row (so back-to-back runs pick up from where the bar currently is).
  private startTween(
    index: number,
    fromValue: number,
    toValue: number,
    fromFill: number,
    toFill: number,
    format: (n: number) => string,
  ): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      if (this.tweens[i].index === index) this.tweens.splice(i, 1);
    }
    this.tweens.push({
      index,
      fromValue,
      toValue,
      fromFill,
      toFill,
      format,
      valueElapsed: 0,
      hiElapsed: 0,
    });
  }

  private advanceBoard(delta: number): void {
    if (this.tweens.length === 0) return; // nothing animating — leave the board be

    const C = CONSTANTS;
    let meters:
      | Array<{ value: string; fill: number; highlight: number }>
      | undefined;
    let redraw: (() => void) | undefined;
    for (const board of this.queries.boards.entities) {
      const data = board.object3D?.userData;
      meters = data?.meters;
      redraw = data?.redraw;
      break;
    }
    if (!meters || !redraw) return;

    for (const tween of this.tweens) {
      tween.valueElapsed += delta;
      tween.hiElapsed += delta;
      const e = this.smooth(Math.min(tween.valueElapsed / C.scoreTweenSeconds, 1));
      const meter = meters[tween.index];
      const value = tween.fromValue + (tween.toValue - tween.fromValue) * e;
      const fill = tween.fromFill + (tween.toFill - tween.fromFill) * e;
      meter.value = tween.format(value);
      meter.fill = Math.max(0, Math.min(1, fill));
      // Highlight starts full and fades over highlightSeconds (a touch longer
      // than the glide, so the gold lingers a beat after the number settles).
      meter.highlight = Math.max(0, 1 - tween.hiElapsed / C.highlightSeconds);
    }

    // Drop tweens whose value has settled AND whose highlight has fully faded.
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const t = this.tweens[i];
      if (
        t.valueElapsed >= C.scoreTweenSeconds &&
        t.hiElapsed >= C.highlightSeconds
      ) {
        this.tweens.splice(i, 1);
      }
    }

    redraw();
  }

  // --- Status note (shared parchment panel under the board) ------------------
  // After a normal run it carries the farm-vs-factory fact; it doubles as the
  // line's status line for the "out of materials" and "breakdown" warnings.
  private showNote(): void {
    // Hold the farm-vs-factory fact during the guided tour: the foreman's tutorial
    // line for the Start-Line step ("See that? By hand, one worker…") already says
    // it, so this note would just repeat him. (Other notes — like the first-hire
    // teaching callout — are still allowed during the tour; they don't repeat him.)
    if (!this.globals.tourDone) return;
    const factory = this.globals.activeFactory as FactoryType | null;
    const product = factory ? factory.product : "items";
    this.setNote(
      `By hand, one worker made a few items a day. ` +
        `Your machine just made ${this.itemsMade} ${product} in seconds!`,
    );
  }

  // Put a message on the note panel and reveal it (fading it in the first time).
  private setNote(text: string): void {
    for (const board of this.queries.boards.entities) {
      const note = board.object3D?.userData.note as Mesh | undefined;
      if (!note) continue;
      (note.userData.setText as (text: string) => void)(text);
      note.visible = true;
    }
    if (!this.noteShown) {
      this.noteShown = true;
      this.noteFadeElapsed = 0;
    }
  }

  // Teaching moment (once): the first time the Raw Materials stock runs low, post
  // the "steady supply" note. Display only — it never changes the run or a score.
  private maybeTeachLowMaterials(): void {
    if (!this.globals.tourDone) return; // wait for the real game (don't consume it during the tour)
    if (this.taughtLowMaterials) return;
    if (this.materials > CONSTANTS.materials.lowThreshold) return;
    this.taughtLowMaterials = true;
    this.setNote(CALLOUTS.lowMaterials);
  }

  // Teaching moment (once): the first time the crew's satisfaction falls low,
  // name worker safety right on the floor, not just in the end report. Display
  // only. It never changes a run or a score.
  private maybeTeachWorkerSafety(): void {
    if (!this.globals.tourDone) return;
    if (this.taughtWorkerSafety) return;
    if (this.satisfactionValue >= CONSTANTS.safetyNoteThreshold) return;
    this.taughtWorkerSafety = true;
    this.setNote(CALLOUTS.workerSafety);
  }

  // Glide the Raw Materials meter from an old stock level to the current one.
  private tweenMaterials(from: number): void {
    const max = CONSTANTS.materials.max;
    this.startTween(
      this.materialsIndex,
      from,
      this.materials,
      from / max,
      this.materials / max,
      (n) => String(Math.round(n)),
    );
  }

  // Charge a one-time cost: add it to the burden that lowers the profit share, then
  // re-glide the Costs/Profit split right away (same sale, thinner margin → more of
  // it is cost, less is profit). The burden heals back out over later runs.
  private addCost(amount: number): void {
    const factory = this.globals.activeFactory as FactoryType | null;
    if (!factory) return;
    this.costBurden += amount;
    const fromMargin = this.marginValue;
    this.marginValue = this.marginFor(factory, CONSTANTS.speeds[this.speedIndex]);
    this.tweenCostProfit(this.lastRevenue, fromMargin); // same revenue, dipped margin → costs up, profit down
  }

  // --- Costs / Profit meters (the coin breakdown of a sale) ------------------
  // Split a sale into the coins kept (profit) and the coins paid out (cost). They
  // always add up to the (rounded) revenue, so each bar can show that part's share.
  private profitCostsFor(revenue: number, margin: number): { profit: number; costs: number } {
    const rev = Math.round(revenue);
    const profit = Math.round(revenue * margin);
    return { profit, costs: Math.max(0, rev - profit) };
  }

  // Glide the Costs + Profit meters from one (revenue, margin) breakdown to the
  // current one (this.lastRevenue / this.marginValue): the number tweens in coins,
  // the bar tweens to that part's share of the sale (profit = margin, cost = 1−margin).
  private tweenCostProfit(fromRevenue: number, fromMargin: number): void {
    const from = this.profitCostsFor(fromRevenue, fromMargin);
    const to = this.profitCostsFor(this.lastRevenue, this.marginValue);
    this.startTween(
      this.profitIndex,
      from.profit,
      to.profit,
      fromMargin,
      this.marginValue,
      (n) => `$${Math.round(n)}`,
    );
    this.startTween(
      this.costsIndex,
      from.costs,
      to.costs,
      1 - fromMargin,
      1 - this.marginValue,
      (n) => `$${Math.round(n)}`,
    );
  }

  // The line is out of materials: flash the (empty) Raw Materials meter gold and
  // post a plain-language nudge to reorder. No run happens.
  private flashOutOfMaterials(factory: FactoryType): void {
    const fill = this.materials / CONSTANTS.materials.max;
    // A no-change tween just carries the gold highlight so the empty row catches the eye.
    this.startTween(
      this.materialsIndex,
      this.materials,
      this.materials,
      fill,
      fill,
      (n) => String(Math.round(n)),
    );
    this.setNote(
      `Out of ${factory.material}! Click “Order Materials” to restock before the line can run.`,
    );
  }

  // Set the machine's gauge lamps to a color + brightness — used to flash them red
  // while the machine is broken down, then restore the warm amber afterward.
  private setGauge(color: number, intensity: number): void {
    for (const line of this.queries.lines.entities) {
      const mat = line.object3D?.userData.gaugeMaterial as
        | MeshLambertMaterial
        | undefined;
      if (!mat) continue;
      mat.emissive.set(color);
      mat.emissiveIntensity = intensity;
    }
  }

  // Repaint the Expand the Line card to match its current state (locked / ready /
  // building with a countdown / finished). Found through the all-cards query so we
  // can update it without a click.
  private repaintExpandCard(): void {
    for (const card of this.queries.allCards.entities) {
      if ((card.getValue(ControlCard, "action") ?? 0) !== CONTROL.expand) {
        continue;
      }
      const setText = card.object3D?.userData.setText as
        | ((text: string) => void)
        | undefined;
      setText?.(
        expandCardText(this.expandUnlocked, this.expandState, this.expandRunsLeft),
      );
    }
  }

  // When the expansion finishes, add a small visible "new section" to the line — a
  // timber platform and bin just past the output crate — so the line has clearly
  // grown, matching the output bump every run now gets.
  private addExpansionAnnex(): void {
    if (this.expandAnnexAdded) return;
    const C = CONSTANTS;
    const annexX = C.outputX + 1.1;
    for (const line of this.queries.lines.entities) {
      const group = line.object3D;
      if (!group) continue;
      const deck = makeBox(0.9, 0.12, 1.0, C.lineTimberColor, [annexX, 0.06, 0]);
      const bin = makeBox(0.8, 0.5, 0.7, C.binColor, [annexX, 0.37, 0]);
      applyShadows(deck); // ground the new annex pieces too
      applyShadows(bin);
      group.add(deck);
      group.add(bin);
    }
    this.expandAnnexAdded = true;
  }

  private advanceNote(delta: number): void {
    if (!this.noteShown) return; // not revealed yet
    if (this.noteFadeElapsed >= CONSTANTS.noteFadeSeconds) return; // already in
    this.noteFadeElapsed += delta;
    const opacity = Math.min(1, this.noteFadeElapsed / CONSTANTS.noteFadeSeconds);
    for (const board of this.queries.boards.entities) {
      const note = board.object3D?.userData.note as Mesh | undefined;
      if (!note) continue;
      (note.material as MeshBasicMaterial).opacity = opacity;
    }
  }

  // --- Price (the live selling price shown on the board) ---------------------
  // Load the chosen business's starting price into our live value. The board row
  // is already seeded in placeReadoutBoard, so there is nothing to redraw here —
  // we just remember the number so the Phase 3 competitor can animate it down.
  private seedPrice(): void {
    const factory = this.globals.activeFactory as FactoryType | null;
    if (!factory) return;
    this.priceValue = factory.basePrice;
    this.priceSeeded = true;
  }

  // --- Phase 3: the competitor opens nearby ----------------------------------
  // Done once, when the foreman delivers the Phase 3 news. Two things happen at
  // once: prices fall (the Price meter drops, squeezing the next run's margin),
  // and ONE random challenge strikes — a machine breakdown or a delayed shipment.
  private startCompetition(): void {
    this.competitionStarted = true;
    this.dropPrice();
    // Roll the one random setback for this phase (like the farming module's
    // random market event), then spring it.
    this.challenge =
      PHASE3_CHALLENGES[Math.floor(Math.random() * PHASE3_CHALLENGES.length)];
    if (this.challenge.id === "breakdown") {
      this.strikeBreakdown();
    } else {
      this.strikeDelayedShipment();
    }
  }

  // The rival forces a price cut: lower the live price and glide the Price meter
  // down (with the usual gold flash). The lower price feeds the next run's margin.
  private dropPrice(): void {
    const before = this.priceValue;
    const after = Math.max(
      1,
      Math.round(before * (1 - CONSTANTS.competition.priceDrop)),
    );
    this.priceValue = after;
    const max = CONSTANTS.priceMax;
    this.startTween(
      this.priceIndex,
      before,
      after,
      before / max,
      after / max,
      (n) => `$${Math.round(n)}`,
    );
  }

  // MACHINE BREAKDOWN: stop the machine until it is repaired — a puff of smoke, a
  // gentle amber warning lamp, and a nudge to use the new Repair control.
  private strikeBreakdown(): void {
    const comp = CONSTANTS.competition;
    this.machineDown = true;
    this.addSmokePuff(); // a little smoke rises from the chimney while it is down
    this.setGauge(comp.warningColor, 1); // amber warning lamp (warm, not an alarming red)
    this.repaintRepairCard();
    this.updateControlVisibility(); // the Repair control appears now that it is needed
    this.announceChallenge();
  }

  // DELAYED SHIPMENT: raw materials drop sharply, and every reorder now takes a
  // while to arrive for the rest of the phase.
  private strikeDelayedShipment(): void {
    const C = CONSTANTS;
    this.shipmentSlow = true;
    const before = this.materials;
    const lost = Math.round(C.materials.max * C.competition.shipmentLoss);
    this.materials = Math.max(0, this.materials - lost);
    this.tweenMaterials(before); // glide the meter sharply down
    this.announceChallenge();
  }

  // Post the chosen challenge to the status note as a headline + plain-language
  // explanation of how to cope (filling in the business's machine/material words).
  private announceChallenge(): void {
    if (!this.challenge) return;
    const factory = this.globals.activeFactory as FactoryType | null;
    this.setNote(`${this.challenge.name}! ${fillNews(this.challenge.announce, factory)}`);
  }

  // --- Repairing a Phase 3 breakdown -----------------------------------------
  // Clicking the Repair control while the machine is down starts a short repair.
  private repairMachine(): void {
    if (!this.machineDown || this.repairing) return; // nothing to fix (or already fixing)
    this.repairing = true;
    this.repairElapsed = 0;
    this.repaintRepairCard();
    const factory = this.globals.activeFactory as FactoryType | null;
    const machine = factory ? factory.machine : "machine";
    this.setNote(`Repairing the ${machine}… hold tight.`);
  }

  // Count down the short repair, pulsing the warning lamp gently while it works.
  private advanceRepair(delta: number): void {
    const comp = CONSTANTS.competition;
    this.repairElapsed += delta;
    const pulse = 0.5 + 0.5 * Math.sin(this.repairElapsed * comp.warningBlinkSpeed);
    this.setGauge(comp.warningColor, 0.4 + 0.6 * pulse);
    if (this.repairElapsed >= comp.repairSeconds) this.finishRepair();
  }

  // The repair is done: the machine runs again. Clear the smoke + warning lamp,
  // charge the repair cost (recovers over later runs), and say so.
  private finishRepair(): void {
    const C = CONSTANTS;
    this.repairing = false;
    this.machineDown = false;
    this.removeSmokePuff();
    this.setGauge(C.windowColor, 0.9); // back to the normal warm lamp glow
    this.addCost(C.competition.repairMarginCost);
    this.repaintRepairCard();
    this.updateControlVisibility(); // the machine is OK again — tuck the Repair control away
    const factory = this.globals.activeFactory as FactoryType | null;
    const machine = factory ? factory.machine : "machine";
    this.setNote(`The ${machine} is fixed — back to work!`);
  }

  // The line is broken down (Phase 3). Nudge the student to repair it — no run.
  private flashBrokenDown(factory: FactoryType): void {
    this.setNote(
      `The ${factory.machine} is still broken. Click “Repair” to fix it before the line can run.`,
    );
  }

  // --- Delayed shipments (Phase 3) -------------------------------------------
  // A reordered shipment is in transit: once it has been on the way long enough,
  // it arrives and restocks the line.
  private advanceShipment(delta: number): void {
    this.shipmentElapsed += delta;
    if (this.shipmentElapsed >= CONSTANTS.competition.orderDelaySeconds) {
      this.shipmentArrives();
    }
  }

  // The delayed shipment finally lands: top the stock back up to full (gliding the
  // meter up), charge for it, and say so.
  private shipmentArrives(): void {
    const C = CONSTANTS;
    this.shipmentPending = false;
    const before = this.materials;
    this.materials = C.materials.max;
    this.tweenMaterials(before);
    this.addCost(C.materials.orderMarginCost);
    const factory = this.globals.activeFactory as FactoryType | null;
    const material = factory ? factory.material : "materials";
    this.setNote(`The ${material} shipment arrived — the line is restocked!`);
  }

  // Repaint the Repair card to match the machine's state (OK / broken / repairing).
  // Found through the all-cards query so we can update it without a click.
  private repaintRepairCard(): void {
    let state: "ok" | "broken" | "repairing" = "ok";
    if (this.repairing) state = "repairing";
    else if (this.machineDown) state = "broken";
    for (const card of this.queries.allCards.entities) {
      if ((card.getValue(ControlCard, "action") ?? 0) !== CONTROL.repair) continue;
      const setText = card.object3D?.userData.setText as
        | ((text: string) => void)
        | undefined;
      setText?.(repairCardText(state));
    }
  }

  // --- Breakdown smoke (a small, soft puff rising off the machine) ------------
  // Built when the machine breaks and removed when it is repaired. A few soft grey
  // puffs that drift up and fade in a gentle loop — readable, not alarming. They
  // rise from just above the machine, in front of the board (see smokeAt), so the
  // student sees them from the desk.
  private addSmokePuff(): void {
    if (this.smokePuffs.length > 0) return; // already puffing
    const comp = CONSTANTS.competition;
    this.smokeGeometry = new SphereGeometry(comp.smokeRadius, 10, 10);
    for (const line of this.queries.lines.entities) {
      const group = line.object3D;
      if (!group) continue;
      for (let i = 0; i < comp.smokePuffs; i++) {
        const puff = new Mesh(
          this.smokeGeometry,
          new MeshBasicMaterial({
            color: comp.smokeColor,
            transparent: true,
            opacity: 0, // animateSmoke fades each one in as it rises
            depthWrite: false, // soft smoke shouldn't hide things behind it
            fog: false,
          }),
        );
        // Spread the puffs a touch sideways so they read as a column of smoke.
        puff.position.set(
          comp.smokeAt[0] + (i - (comp.smokePuffs - 1) / 2) * 0.05,
          comp.smokeAt[1],
          comp.smokeAt[2],
        );
        group.add(puff);
        this.smokePuffs.push(puff);
      }
    }
    this.smokeElapsed = 0;
  }

  // Drift each puff up and fade it out, looping — staggered so smoke curls steadily.
  private animateSmoke(delta: number): void {
    if (this.smokePuffs.length === 0) return;
    const comp = CONSTANTS.competition;
    this.smokeElapsed += delta;
    const n = this.smokePuffs.length;
    for (let i = 0; i < n; i++) {
      const puff = this.smokePuffs[i];
      // Each puff is at a different point in the same rise-and-fade cycle.
      const phase = (this.smokeElapsed * comp.smokeRate + i / n) % 1;
      puff.position.y = comp.smokeAt[1] + phase * comp.smokeRise;
      puff.scale.setScalar(comp.smokeMinScale + phase * comp.smokeGrow);
      (puff.material as MeshBasicMaterial).opacity = (1 - phase) * comp.smokeOpacity;
    }
  }

  // Take the smoke away and free its GPU resources (called once it is repaired).
  private removeSmokePuff(): void {
    for (const puff of this.smokePuffs) {
      puff.parent?.remove(puff);
      (puff.material as MeshBasicMaterial).dispose();
    }
    this.smokePuffs = [];
    if (this.smokeGeometry) {
      this.smokeGeometry.dispose();
      this.smokeGeometry = null;
    }
  }

  // --- End of Day Production Report ------------------------------------------
  // The foreman has called the end of the day. Read the three FINAL scores
  // straight from our live values — the exact numbers the board ended on, NOT
  // recomputed — and fade a clean report board in front of the player. The board
  // sorts each score into a high / medium / low band, shows the matching
  // encouraging line, and ties them together with one summary sentence.
  private showReport(): void {
    this.reportShown = true;
    Sfx.fanfare(); // a short, happy fanfare as the day's report appears
    const C = CONSTANTS;
    const factory = this.globals.activeFactory as FactoryType | null;
    const board = buildReportBoard(
      this.outputValue, // final Production Output (the live running total)
      this.satisfactionValue, // final Worker Satisfaction (0..1)
      this.marginValue, // final profit SHARE (0..1) — grades the Profit score
      this.profitCostsFor(this.lastRevenue, this.marginValue).profit, // final Profit, in coins (shown)
      factory,
    );
    board.position.set(0, C.report.y, C.report.z); // float it in front of the player
    this.reportBoard = board;
    this.reportFadeElapsed = 0;
    this.world.createTransformEntity(board);
    this.spawnConfetti(); // the day is done — make it feel like a win screen

    // Tuck the foreman's speech panel away so his closing line doesn't overlap the
    // report (he stands to the right, his panel drifts across the report's numbers).
    for (const foreman of this.queries.foremen.entities) {
      const panel = foreman.object3D?.userData.panel as Mesh | undefined;
      if (panel) panel.visible = false;
    }
    // Tuck his "Next" news card away too — the day is over, so there is no more
    // news to advance, and it sat over the report's bottom-right corner.
    for (const prompt of this.queries.foremanPrompts.entities) {
      if (prompt.object3D) prompt.object3D.visible = false;
      if (prompt.hasComponent(RayInteractable)) prompt.removeComponent(RayInteractable);
    }
  }

  // --- Celebration confetti (the report moment feels like a win screen) -------
  // Built once when the report appears: every fleck starts along the report's
  // top edge with an up-and-outward velocity and one of the dashboard's meter
  // colors. advanceConfetti rains them down and fades them; then it all goes.
  private spawnConfetti(): void {
    const C = CONSTANTS.celebration;
    const R = CONSTANTS.report;
    const positions = new Float32Array(C.count * 3);
    const colors = new Float32Array(C.count * 3);
    const velocities = new Float32Array(C.count * 3);
    const palette = C.colors.map((hex) => new Color(hex));
    for (let i = 0; i < C.count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * R.width * 0.6; // spread along the report's top edge
      positions[i * 3 + 1] = R.y + R.height / 2 + 0.15; // just above it
      positions[i * 3 + 2] = R.z + 0.25; // a touch toward the player
      velocities[i * 3 + 0] = (Math.random() - 0.5) * C.spread * 2;
      velocities[i * 3 + 1] = C.riseSpeed * (0.5 + Math.random() * 0.8);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * C.spread;
      const color = palette[i % palette.length];
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: C.size,
      vertexColors: true, // each fleck keeps its own festive color
      transparent: true,
      opacity: 1,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const confetti = new Points(geometry, material);
    confetti.name = "Confetti";
    this.confetti = confetti;
    this.confettiVelocities = velocities;
    this.confettiElapsed = 0;
    this.confettiEntity = this.world.createTransformEntity(confetti);
  }

  // Rain the confetti down (simple gravity), fade it out over its last stretch,
  // and dispose the whole burst when it is done. Writes only into the buffers
  // made in spawnConfetti — nothing is allocated here.
  private advanceConfetti(delta: number): void {
    if (!this.confetti || !this.confettiVelocities) return;
    const C = CONSTANTS.celebration;
    this.confettiElapsed += delta;
    if (this.confettiElapsed >= C.seconds) {
      this.confettiEntity?.dispose(); // frees the buffers + material with it
      this.confetti = null;
      this.confettiVelocities = null;
      this.confettiEntity = null;
      return;
    }
    const attribute = this.confetti.geometry.attributes.position;
    const positions = attribute.array as Float32Array;
    const velocities = this.confettiVelocities;
    for (let i = 0; i < velocities.length; i += 3) {
      velocities[i + 1] -= C.gravity * delta; // gravity pulls each fleck down
      positions[i + 0] += velocities[i + 0] * delta;
      positions[i + 1] += velocities[i + 1] * delta;
      positions[i + 2] += velocities[i + 2] * delta;
    }
    attribute.needsUpdate = true;
    const fadeFrom = C.seconds * 0.6;
    if (this.confettiElapsed > fadeFrom) {
      (this.confetti.material as PointsMaterial).opacity =
        1 - (this.confettiElapsed - fadeFrom) / (C.seconds - fadeFrom);
    }
  }

  // Fade the report board in the first time it appears (then leave it be).
  private advanceReport(delta: number): void {
    if (!this.reportBoard) return; // not shown yet
    if (this.reportFadeElapsed >= CONSTANTS.report.fadeSeconds) return; // fully in
    this.reportFadeElapsed += delta;
    const opacity = Math.min(
      1,
      this.reportFadeElapsed / CONSTANTS.report.fadeSeconds,
    );
    (this.reportBoard.material as MeshBasicMaterial).opacity = opacity;
  }

  // --- Gentle guidance: a breathing pulse on the control to use next ---------
  // Which single control the student should reach for right now. Emergencies come
  // first (a broken machine, an empty stockpile); otherwise it is the everyday
  // "run the line" button. While a run or repair is in progress, nothing pulses —
  // the line is busy, so the floor stays calm. Returns -1 for "nothing to point at."
  private nextAction(): number {
    if (this.machineDown && !this.repairing) return CONTROL.repair;
    if (this.running || this.repairing) return -1; // busy — rest the pulse
    if (this.materials <= 0 && !this.shipmentPending) return CONTROL.order;
    return CONTROL.start;
  }

  // Gently grow and shrink the "next" control like a calm breath, while every
  // other card rests at its normal size. Scaling the card's object3D directly each
  // frame is the same zero-copy pattern the DustSystem uses on its cloud.
  private updateGuidancePulse(delta: number): void {
    if (this.queries.allCards.entities.size === 0) return; // station not up yet
    const C = CONSTANTS.guidance;
    this.pulseClock += delta;
    const target = this.nextAction();
    const breath = 1 + C.pulseDepth * Math.sin(this.pulseClock * C.pulseRate);
    for (const card of this.queries.allCards.entities) {
      const obj = card.object3D;
      if (!obj) continue;
      const action = card.getValue(ControlCard, "action") ?? 0;
      obj.scale.setScalar(action === target && obj.visible ? breath : 1);
    }
  }

  // Show only the controls that are actually usable right now, and lay the visible
  // cards out evenly across the desk so the console never looks cluttered. The two
  // contextual controls appear exactly when they matter: Repair while the machine
  // is down, and Expand once the foreman has opened it up (until it is built). The
  // everyday controls — Speed, Hire, Order, Start — are always there. Hiding a card
  // also drops its RayInteractable tag, so a hidden card can't be clicked by a
  // stray ray (a hidden tag alone would still be clickable).
  private updateControlVisibility(): void {
    const C = CONSTANTS;
    const cards = [...this.queries.allCards.entities];
    const isVisible = (action: number): boolean => {
      if (action === CONTROL.repair) return this.machineDown || this.repairing;
      if (action === CONTROL.expand) {
        return this.expandUnlocked && this.expandState !== "done";
      }
      return true; // speed, hire, order, start are always available
    };

    // The visible cards, in CONTROL order, so we can space them evenly and centered.
    const visibleActions = cards
      .map((card) => card.getValue(ControlCard, "action") ?? 0)
      .filter((action) => isVisible(action))
      .sort((a, b) => a - b);
    const n = visibleActions.length;

    for (const card of cards) {
      const obj = card.object3D;
      if (!obj) continue;
      const action = card.getValue(ControlCard, "action") ?? 0;
      if (isVisible(action)) {
        obj.visible = true;
        if (!card.hasComponent(RayInteractable)) card.addComponent(RayInteractable);
        const slot = visibleActions.indexOf(action);
        obj.position.x = (slot - (n - 1) / 2) * C.cardSpacing; // even, centered row
      } else {
        obj.visible = false;
        obj.scale.setScalar(1); // drop any breathing pulse it may have had
        if (card.hasComponent(RayInteractable)) card.removeComponent(RayInteractable);
      }
    }
  }

  // --- First-time hints (one short line at a time, then they fade) ------------
  // Queue a hint to be shown — but only the first time, so each onboarding line
  // appears exactly once.
  private queueHint(key: "start" | "again" | "foreman"): void {
    if (this.hintQueued[key]) return;
    this.hintQueued[key] = true;
    // The foreman hint has headset-specific wording (trigger + hop travel
    // instead of mouse + walking) — pick it when an XR session is running.
    const text =
      key === "foreman" && this.world.session ? HINTS.foremanVR : HINTS[key];
    this.hintQueue.push(text);
  }

  // Show the queued hints one at a time on the banner above the desk: fade in,
  // hold, fade out, then move on to the next. Once the queue empties, the banner
  // stays hidden and the breathing pulse alone carries the guidance.
  private advanceHints(delta: number): void {
    const H = CONSTANTS.hints;
    const banner = this.firstHintBanner();
    if (!banner) return;
    const mat = banner.material as MeshBasicMaterial;

    // Not showing one right now? Start the next from the queue (if any).
    if (!this.hintActive) {
      const next = this.hintQueue.shift();
      if (!next) return;
      (banner.userData.setText as (t: string) => void)(next);
      banner.visible = true;
      this.hintActive = true;
      this.hintElapsed = 0;
    }

    this.hintElapsed += delta;
    const inEnd = H.fadeIn;
    const holdEnd = inEnd + H.hold;
    const outEnd = holdEnd + H.fadeOut;
    let opacity = 0;
    if (this.hintElapsed < inEnd) opacity = this.hintElapsed / H.fadeIn;
    else if (this.hintElapsed < holdEnd) opacity = 1;
    else if (this.hintElapsed < outEnd) opacity = 1 - (this.hintElapsed - holdEnd) / H.fadeOut;
    mat.opacity = Math.max(0, Math.min(1, opacity));

    // The hint has fully faded out — hide it and free the banner for the next one.
    if (this.hintElapsed >= outEnd) {
      banner.visible = false;
      this.hintActive = false;
    }
  }

  // The one hint banner entity (there is only ever one), or null before the desk
  // — and its banner — have appeared.
  private firstHintBanner(): Mesh | null {
    for (const sign of this.queries.hints.entities) {
      return (sign.object3D as Mesh) ?? null;
    }
    return null;
  }

  // Smooth ease-in-out (0..1 → 0..1) so motion starts and stops gently.
  private smooth(t: number): number {
    return t * t * (3 - 2 * t);
  }
}

// =============================================================================
// makeForeman
// Builds the foreman figure — the same simple build as the workers (boxes +
// cylinders, origin at the feet), but in a brown coat with a brimmed hat and a
// pale clipboard, so he clearly reads as the boss rather than a worker. He is
// stationary; the ForemanSystem only ever rewrites the speech panel above him.
// =============================================================================
function makeForeman(): Group {
  const C = CONSTANTS;
  const foreman = new Group();
  foreman.name = "Foreman";

  const coat = new MeshLambertMaterial({ color: C.foreman.coatColor });
  const skin = new MeshLambertMaterial({ color: C.workerHeadColor });
  const hatMat = new MeshLambertMaterial({ color: C.foreman.hatColor });
  const boardMat = new MeshLambertMaterial({ color: C.foreman.clipboardColor });

  // Two legs (reuse the worker leg sizing so he is built to the same scale).
  const legGeo = new CylinderGeometry(
    C.workerLegRadius,
    C.workerLegRadius,
    C.workerLegHeight,
    12,
  );
  for (const side of [-1, 1]) {
    const leg = new Mesh(legGeo, coat);
    leg.position.set(side * C.workerLegSpread, C.workerLegHeight / 2, 0);
    foreman.add(leg);
  }

  // Torso.
  const torsoY = C.workerLegHeight + C.workerTorsoHeight / 2;
  const torso = new Mesh(
    new BoxGeometry(C.workerTorsoWidth, C.workerTorsoHeight, C.workerTorsoDepth),
    coat,
  );
  torso.position.set(0, torsoY, 0);
  foreman.add(torso);

  // Two arms.
  const armGeo = new CylinderGeometry(
    C.workerArmRadius,
    C.workerArmRadius,
    C.workerArmHeight,
    10,
  );
  const armY = C.workerLegHeight + C.workerTorsoHeight - C.workerArmHeight / 2;
  for (const side of [-1, 1]) {
    const arm = new Mesh(armGeo, coat);
    arm.position.set(side * (C.workerTorsoWidth / 2 + C.workerArmRadius), armY, 0);
    foreman.add(arm);
  }

  // Head.
  const headY = C.workerLegHeight + C.workerTorsoHeight + C.workerHeadSize / 2;
  const head = new Mesh(
    new BoxGeometry(C.workerHeadSize, C.workerHeadSize, C.workerHeadSize),
    skin,
  );
  head.position.set(0, headY, 0);
  foreman.add(head);

  // A brimmed hat (a wide thin brim with a rounded crown) instead of a worker cap.
  const hatY = headY + C.workerHeadSize / 2;
  const brim = new Mesh(
    new CylinderGeometry(C.foreman.hatBrimRadius, C.foreman.hatBrimRadius, 0.03, 16),
    hatMat,
  );
  brim.position.set(0, hatY + 0.015, 0);
  foreman.add(brim);
  const crown = new Mesh(
    new CylinderGeometry(
      C.foreman.hatCrownRadius,
      C.foreman.hatCrownRadius,
      C.foreman.hatCrownHeight,
      16,
    ),
    hatMat,
  );
  crown.position.set(0, hatY + 0.03 + C.foreman.hatCrownHeight / 2, 0);
  foreman.add(crown);

  // A clipboard held in front of his chest (so he reads as facing the player).
  const clipboard = new Mesh(new BoxGeometry(0.22, 0.3, 0.02), boardMat);
  clipboard.position.set(0.12, torsoY, C.workerTorsoDepth / 2 + 0.12);
  clipboard.rotation.x = -0.5; // tilt it up as if he is reading it
  foreman.add(clipboard);

  return foreman;
}

// =============================================================================
// placeForeman
// Drops the foreman beside the control desk, hangs his speech panel above his
// head, and puts his clickable "Next" prompt card in front of him. Called by the
// SetupSystem once a business is picked (he appears with the station + board).
//
// The foreman figure (with the speech panel parented above him) is ONE entity
// tagged Foreman; the ForemanSystem rewrites the panel via the figure's userData.
// The prompt card is its OWN clickable entity tagged ForemanPrompt.
// =============================================================================
function placeForeman(world: World): void {
  const C = CONSTANTS;

  // The figure, facing +Z (toward the player), just past the right end of the desk.
  const foreman = makeForeman();
  foreman.position.set(C.foreman.x, 0, C.foreman.z);
  applyShadows(foreman); // the figure casts a soft shadow (his speech panel is self-lit, so it's skipped)

  // His speech panel, floating above his head (reuses the message-panel builder).
  // It starts hidden + see-through; the ForemanSystem fills it in and fades it on.
  const panel = makeNotePlane(C.foreman.panelWidth, C.foreman.panelHeight);
  panel.name = "ForemanSpeech";
  panel.position.set(C.foreman.panelX, C.foreman.panelY, 0); // local to the figure (offset to his upper-right), so it rides with him
  foreman.add(panel);

  const foremanEntity = world.createTransformEntity(foreman);
  foremanEntity.addComponent(Foreman);
  foreman.userData.panel = panel; // the ForemanSystem rewrites this

  // The clickable "Next" prompt card beside him (its own ray-clickable entity).
  const prompt = makeTextPlane({
    text: "Next ▸\n(Foreman)",
    icon: "🗣️",
    width: C.foreman.promptWidth,
    height: C.foreman.promptHeight,
    background: UI.gold, // a gold "button" inviting the click (like Start Line)
    textColor: UI.white,
    border: UI.goldText,
  });
  prompt.position.set(C.foreman.promptX, C.foreman.promptY, C.foreman.promptZ);
  world
    .createTransformEntity(prompt)
    .addComponent(RayInteractable)
    .addComponent(ForemanPrompt);

  // The glowing gold ring on the floor beside him — the "stand here" / "hop
  // here" target (offset past the desk's edge so it is visible from spawn).
  // It rides on the figure (local coords), lies flat, and ADDS its glow onto
  // the floor like the window light pools, so it never hides the planks.
  // Purely visual: the floor below stays the walkable ground.
  const spot = new Mesh(
    new PlaneGeometry(C.foreman.spotRadius * 2, C.foreman.spotRadius * 2),
    new MeshBasicMaterial({
      map: makeTargetRingTexture(),
      color: C.foreman.spotColor,
      transparent: true,
      opacity: C.foreman.spotOpacity,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  spot.name = "ForemanSpot";
  spot.rotation.x = -Math.PI / 2; // lay it flat on the floor
  spot.position.set(
    C.foreman.spotOffset[0],
    0.04, // just above the planks
    C.foreman.spotOffset[1],
  );
  foreman.add(spot);
}

// =============================================================================
// ForemanSystem — the foreman who delivers the news between phases.
//
// Like Samuel in the farming module, the foreman shares short news beats through
// the speech panel above him. The student advances them one at a time, either by
// clicking his "Next" prompt card or by stepping up to him (walking within range).
// His first beat — "demand is rising" — flips world.globals.demandRising, which
// the ProductionSystem watches to unlock the one-time "Expand the Line" control.
// His Phase 3 beat — "a competitor opened nearby" — flips
// world.globals.competitionOpen, which the ProductionSystem watches to drop the
// Price and spring one random challenge (a breakdown or a delayed shipment). His
// final beat — "the end of the day" — flips world.globals.dayOver, which the
// ProductionSystem watches to show the End of Day Production Report.
//
// He is stationary and simple: this system only advances the beat text and fades
// the panel in the first time it appears.
// =============================================================================
export class ForemanSystem extends createSystem({
  foremen: { required: [Foreman] }, // the foreman figure (appears after a pick)
  prompts: { required: [ForemanPrompt, Pressed] }, // his "Next" card was clicked
}) {
  private newsIndex = -1; // which beat is showing (-1 = none yet)
  private revealed = false; // has the panel been shown at least once?
  private fadeElapsed = 0; // seconds into the panel's first fade-in
  private armed = true; // ready to deliver one beat on the next real approach
  private viewer!: Vector3; // scratch vector for the viewer's world position

  init(): void {
    this.viewer = new Vector3();
    // Clicking his "Next" card advances the news, same as stepping up to him.
    this.queries.prompts.subscribe("qualify", () => this.advanceNews());
  }

  update(delta: number): void {
    const foreman = this.firstForeman();
    if (!foreman) return; // not placed yet (still in the Setup phase)

    // "Step up to him": when the viewer crosses into range, advance the news. We
    // only fire on the far→near crossing, so one approach shows one new beat.
    this.world.camera.getWorldPosition(this.viewer);
    const dx = this.viewer.x - CONSTANTS.foreman.x;
    const dz = this.viewer.z - CONSTANTS.foreman.z;
    const range = CONSTANTS.foreman.range;
    // Two distances, like a thermostat: he fires when you come within "enter,"
    // then will not fire again until you have stepped past the farther "exit"
    // distance and come back. This stops pacing in and out from skipping his news.
    const distSq = dx * dx + dz * dz;
    const enter = range * range;
    const exit = (range * 1.6) * (range * 1.6); // must get this far away to re-arm
    if (!this.armed && distSq > exit) this.armed = true;
    if (this.armed && distSq <= enter) {
      this.armed = false;
      this.advanceNews();
    }

    // Fade the panel in the first time it is shown.
    if (this.revealed && this.fadeElapsed < CONSTANTS.foreman.panelFadeSeconds) {
      this.fadeElapsed += delta;
      const opacity = Math.min(
        1,
        this.fadeElapsed / CONSTANTS.foreman.panelFadeSeconds,
      );
      const panel = foreman.object3D?.userData.panel as Mesh | undefined;
      if (panel) (panel.material as MeshBasicMaterial).opacity = opacity;
    }
  }

  // Show the next news beat (clamped at the last one), filling in the business's
  // product, and reveal the panel. The first beat opens up the scaling decisions.
  private advanceNews(): void {
    // The foreman runs his guided TOUR first (driven by the TutorialSystem). His
    // news phases stay held back until that tour is finished or skipped.
    if (!this.globals.tourDone) return;

    const foreman = this.firstForeman();
    if (!foreman) return;
    const panel = foreman.object3D?.userData.panel as Mesh | undefined;
    if (!panel) return;

    const prevIndex = this.newsIndex;
    // Pacing gate: figure out the beat we would move to next.
    const nextIndex = Math.min(this.newsIndex + 1, FOREMAN_NEWS.length - 1);
    const runs = (this.globals.runsCompleted as number) ?? 0;

    // Gate 1: hold the competitor (Phase 3) until the student has scaled up.
    if (
      this.newsIndex < COMPETITION_BEAT &&
      nextIndex >= COMPETITION_BEAT &&
      runs < RUNS_BEFORE_COMPETITION
    ) {
      (panel.userData.setText as (text: string) => void)(PACING_NUDGE.competition);
      panel.visible = true;
      if (!this.revealed) { this.revealed = true; this.fadeElapsed = 0; }
      return; // do not advance the news this time
    }

    // Gate 2: hold the end of the day until the student has worked through Phase 3.
    if (
      this.newsIndex < CLOSING_BEAT &&
      nextIndex >= CLOSING_BEAT &&
      runs < RUNS_BEFORE_CLOSING
    ) {
      (panel.userData.setText as (text: string) => void)(PACING_NUDGE.closing);
      panel.visible = true;
      if (!this.revealed) { this.revealed = true; this.fadeElapsed = 0; }
      return; // do not advance the news this time
    }

    this.newsIndex = Math.min(this.newsIndex + 1, FOREMAN_NEWS.length - 1);
    // Ring a soft bell only when there is genuinely a NEW beat to hear (not on
    // repeat clicks once he has reached his last bit of news).
    if (this.newsIndex !== prevIndex) Sfx.bell();
    const factory = this.globals.activeFactory as FactoryType | null;
    // The tour usually leaves his last line on the panel; if so, swap the news in
    // without re-running the first-time fade (it would flicker the panel to clear).
    const alreadyShowing = panel.visible;
    (panel.userData.setText as (text: string) => void)(
      fillNews(FOREMAN_NEWS[this.newsIndex], factory),
    );
    panel.visible = true;
    if (!this.revealed) {
      this.revealed = true;
      this.fadeElapsed = alreadyShowing ? CONSTANTS.foreman.panelFadeSeconds : 0;
    }

    // His first beat is the rising-demand news — that opens up "Expand the Line".
    this.globals.demandRising = true;
    // Reaching the first competition beat opens Phase 3: the ProductionSystem
    // watches this to drop the Price and spring the random challenge.
    if (this.newsIndex >= COMPETITION_BEAT) this.globals.competitionOpen = true;
    // Reaching the closing beat calls the end of the day: the ProductionSystem
    // watches this to show the End of Day Production Report.
    if (this.newsIndex >= CLOSING_BEAT) this.globals.dayOver = true;

    // Keep the dashboard's status pill in step with the phase of the day.
    if (this.newsIndex >= CLOSING_BEAT) {
      setFactoryHudStatus("Day's End", "done");
    } else if (this.newsIndex >= COMPETITION_BEAT) {
      setFactoryHudStatus("Competition!", "alert");
    } else {
      setFactoryHudStatus("Demand Rising", "active");
    }
  }

  // The one foreman entity (there is only ever one), or null before it is placed.
  private firstForeman(): ReturnType<World["createTransformEntity"]> | null {
    for (const foreman of this.queries.foremen.entities) return foreman;
    return null;
  }
}

// =============================================================================
// TutorialSystem — the opening goal card + the foreman's guided tour.
//
// The whole onboarding lives here, so the rest of the game stays untouched:
//
//   1. The moment a business is picked, SetupSystem shows the "Your Factory,
//      Your Goal" card (buildGoalCard) on the still-clear floor. Its two buttons
//      are TourButtons this system watches.
//   2. "Start the tour" sweeps the goal card away, reveals the cockpit (desk,
//      board, foreman), and walks the student through TOUR_STEPS one line at a
//      time in the foreman's speech panel — gently breathing a highlight on the
//      control he is talking about. A "narrative" step waits for the student to
//      click "Next ▸"; a "control" step hides Next and waits for the student to
//      actually USE the highlighted control (we watch the same Control/Pressed
//      tag the ProductionSystem does, so the run still happens for real).
//   3. "Skip tour" — on the goal card OR mid-tour — jumps straight to the game.
//
// Either way, finishing flips world.globals.tourDone, the one flag the
// ProductionSystem (its hints + breathing pulse) and the ForemanSystem (its news
// phases) wait on. So the real game — and all its scoring — is exactly as before;
// it just does not BEGIN until the tour is over.
// =============================================================================
export class TutorialSystem extends createSystem({
  pressedButtons: { required: [TourButton, Pressed] }, // a tour button was clicked
  tourParts: { required: [TourPart] }, // every current tour-UI piece (to sweep away)
  boards: { required: [ReadoutBoard] }, // the scores board (to highlight on step 2)
  cards: { required: [ControlCard] }, // the control cards (to highlight on steps 3–4)
  pressedCards: { required: [ControlCard, Pressed] }, // a control was just used
  foremen: { required: [Foreman] }, // the foreman (his speech panel carries the lines)
  foremanPrompts: { required: [ForemanPrompt] }, // his "Next" news card (hidden during the tour)
}) {
  private cockpitPlaced = false; // has the desk/board/foreman been revealed yet?
  private tutorialActive = false; // are we stepping through the foreman's lines?
  private stepIndex = 0; // which TOUR_STEPS line is showing
  // Control actions the foreman has UNLOCKED so far (a card is locked — dimmed +
  // un-clickable — until its tutorial step is reached). Unlocks accumulate as the
  // student progresses; endTour unlocks everything for the real game.
  private unlockedControls = new Set<number>();
  private nextEntity: ReturnType<World["createTransformEntity"]> | null = null; // the "Next ▸" button
  private nextMesh: Mesh | null = null; // its mesh (to show/hide per step)
  private pulseClock = 0; // animation clock for the breathing highlight
  private panelFading = false; // is the foreman's panel fading in for the first time?
  private panelFadeElapsed = 0; // seconds into that fade

  init(): void {
    // A tour button (Start / Skip / Next) was clicked.
    this.queries.pressedButtons.subscribe("qualify", (entity) => {
      this.onButton(entity.getValue(TourButton, "action") ?? 0);
    });

    // On a "use the control" step, the student actually using the highlighted
    // control is what advances the line. We watch the SAME Control/Pressed tag the
    // ProductionSystem reacts to, so the real action (cycle speed / run the line)
    // still happens — we just also step the tour forward.
    this.queries.pressedCards.subscribe("qualify", (entity) => {
      if (!this.tutorialActive) return;
      const step = TOUR_STEPS[this.stepIndex];
      if (step.wait !== "control") return;
      const want = this.controlForHighlight(step.highlight);
      if ((entity.getValue(ControlCard, "action") ?? 0) === want) this.advanceStep();
    });
  }

  update(delta: number): void {
    // Fade the foreman's speech panel in once, the first time the tour shows a line.
    if (this.panelFading) {
      this.panelFadeElapsed += delta;
      const k = Math.min(1, this.panelFadeElapsed / CONSTANTS.tour.panelFadeSeconds);
      const panel = this.foremanPanel();
      if (panel) (panel.material as MeshBasicMaterial).opacity = k;
      if (k >= 1) this.panelFading = false;
    }

    // While the foreman talks, gently breathe a highlight on the control (or the
    // board) he is pointing at, and keep every not-yet-introduced control LOCKED
    // (dimmed + un-clickable) so the student can only use what he has unlocked.
    if (this.tutorialActive) {
      this.updateHighlight(delta);
      this.applyControlLocks();
    }
  }

  // --- Button handling -------------------------------------------------------
  private onButton(action: number): void {
    Sfx.clunk(); // a soft confirming click (these are not ControlCards, so nothing else hears them)
    if (action === TOUR.start) this.startTour();
    else if (action === TOUR.skip) this.skipTour();
    else if (action === TOUR.next) this.onNext();
  }

  // "Next ▸" only does something on a narrative step (control steps wait for the
  // control itself).
  private onNext(): void {
    if (!this.tutorialActive) return;
    if (TOUR_STEPS[this.stepIndex].wait !== "next") return;
    this.advanceStep();
  }

  // --- Start / skip ----------------------------------------------------------
  // "Start the tour": clear the goal card, bring in the cockpit, hide the foreman's
  // news prompt, put up his "Next ▸" + "Skip tour" buttons, and show the first line.
  private startTour(): void {
    this.disposeTourParts(); // sweep the goal card + its buttons away
    this.placeCockpit();
    this.hideForemanPrompt(); // he is giving the tour, not the news yet
    this.buildTutorialButtons();
    this.tutorialActive = true;
    this.stepIndex = 0;
    this.unlockedControls.clear(); // everything starts locked; steps unlock controls one at a time
    this.panelFading = true;
    this.panelFadeElapsed = 0;
    this.showStep(0);
  }

  // "Skip tour": from the goal card, reveal the cockpit and start the game right
  // away; mid-tour, just end it. Either way the real game begins.
  private skipTour(): void {
    this.disposeTourParts();
    if (!this.cockpitPlaced) this.placeCockpit();
    this.endTour();
  }

  // The tour is over (last line passed, or skipped): hand off to the real game.
  // Clear any tour buttons, let the foreman's news prompt back in, rest the
  // highlights, and flip the one flag the ProductionSystem + ForemanSystem wait on.
  private endTour(): void {
    this.disposeTourParts();
    this.tutorialActive = false;
    this.resetHighlights();
    this.unlockAllControls(); // the real game begins — every control is usable now
    this.showForemanPrompt();
    this.globals.tourDone = true;
  }

  // Reveal the cockpit (once). These are the same builders the SetupSystem used to
  // call straight away; the tour just defers them until the student is ready.
  private placeCockpit(): void {
    if (this.cockpitPlaced) return;
    placeControlStation(this.world);
    placeReadoutBoard(this.world);
    placeForeman(this.world);
    this.cockpitPlaced = true;
  }

  // --- Steps -----------------------------------------------------------------
  // Put one line on the foreman's panel, show/hide his "Next ▸" button to match
  // (narrative vs control step), and start the highlight fresh for the new target.
  private showStep(i: number): void {
    const step = TOUR_STEPS[i];

    // Reaching a "use the control" step UNLOCKS that control (and it stays
    // unlocked for the rest of the tour — unlocks accumulate as you progress).
    if (step.wait === "control") {
      this.unlockedControls.add(this.controlForHighlight(step.highlight));
    }

    const panel = this.foremanPanel();
    if (panel) {
      // A step can carry headset-specific wording (controller words instead of
      // keyboard words) — use it whenever an XR session is actually running.
      const text = this.world.session && step.textVR ? step.textVR : step.text;
      (panel.userData.setText as (t: string) => void)(text);
      panel.visible = true;
    }

    // Next shows only on narrative steps. Dropping its RayInteractable while hidden
    // keeps a stray ray from clicking a card the student cannot even see.
    const showNext = step.wait === "next";
    if (this.nextMesh) this.nextMesh.visible = showNext;
    if (this.nextEntity) {
      const has = this.nextEntity.hasComponent(RayInteractable);
      if (showNext && !has) this.nextEntity.addComponent(RayInteractable);
      if (!showNext && has) this.nextEntity.removeComponent(RayInteractable);
    }

    Sfx.bell(); // a soft chime as the foreman speaks the next line
    this.resetHighlights(); // updateHighlight pulses the new target from here
  }

  private advanceStep(): void {
    this.resetHighlights();
    this.stepIndex += 1;
    if (this.stepIndex >= TOUR_STEPS.length) this.endTour();
    else this.showStep(this.stepIndex);
  }

  // --- Highlight (a calm breathing pulse on the current target) --------------
  private updateHighlight(delta: number): void {
    this.resetHighlights(); // start every card + the board at rest...
    const step = TOUR_STEPS[this.stepIndex];
    if (step.highlight === "none") return; // ...nothing to point at on a narrative step

    const C = CONSTANTS.tour;
    this.pulseClock += delta;

    if (step.highlight === "board") {
      const board = this.firstBoard();
      if (board) {
        board.scale.setScalar(1 + C.boardPulseDepth * Math.sin(this.pulseClock * C.pulseRate));
      }
      return;
    }

    // "speed" → Machine Speed, "hire" → Hire Worker, "start" → Start Line card.
    const want = this.controlForHighlight(step.highlight);
    const card = this.findCard(want);
    if (card) {
      card.scale.setScalar(1 + C.cardPulseDepth * Math.sin(this.pulseClock * C.pulseRate));
    }
  }

  // Rest the board and every control card back to their normal size.
  private resetHighlights(): void {
    const board = this.firstBoard();
    if (board) board.scale.setScalar(1);
    for (const card of this.queries.cards.entities) card.object3D?.scale.setScalar(1);
  }

  // --- Control locking (during the tour, only UNLOCKED controls are usable) --
  // Run every frame while the tutorial is active: a control the foreman has not
  // introduced yet stays dimmed AND un-clickable; once unlocked it is full
  // brightness + clickable. (Re-applied each frame so it always wins over the
  // ProductionSystem's own show/hide pass.)
  private applyControlLocks(): void {
    for (const card of this.queries.cards.entities) {
      const action = card.getValue(ControlCard, "action") ?? 0;
      this.setCardLocked(card, !this.unlockedControls.has(action));
    }
  }

  // Unlock every control — the handoff to the real game when the tour ends/skips.
  private unlockAllControls(): void {
    for (const card of this.queries.cards.entities) this.setCardLocked(card, false);
  }

  // Dim + drop the click target on a locked card; restore full brightness + the
  // click target (only if the card is actually visible) when unlocked.
  private setCardLocked(
    card: ReturnType<World["createTransformEntity"]>,
    locked: boolean,
  ): void {
    const mesh = card.object3D as Mesh | undefined;
    if (!mesh) return;
    (mesh.material as MeshBasicMaterial).color.setScalar(
      locked ? CONSTANTS.tour.lockedDim : 1,
    );
    const clickable = card.hasComponent(RayInteractable);
    if (locked) {
      if (clickable) card.removeComponent(RayInteractable);
    } else if (!clickable && mesh.visible) {
      card.addComponent(RayInteractable);
    }
  }

  // --- Tour-UI builders + helpers --------------------------------------------
  // The foreman's "Next ▸" (gold) and a quieter "Skip tour", floating just above
  // the desk in front of the control cards. Both are tagged TourPart so they get
  // swept away with the rest of the tour UI when it ends.
  private buildTutorialButtons(): void {
    const C = CONSTANTS.tour;

    const next = makeTextPlane({
      text: "Next ▸",
      width: C.nextButtonW,
      height: C.nextButtonH,
      background: UI.gold,
      textColor: UI.white,
      border: UI.goldText,
    });
    next.position.set(...C.nextButtonPos);
    this.nextMesh = next;
    this.nextEntity = this.world
      .createTransformEntity(next)
      .addComponent(RayInteractable)
      .addComponent(TourButton, { action: TOUR.next })
      .addComponent(TourPart);

    const skip = makeTextPlane({
      text: "Skip tour",
      width: C.tourSkipButtonW,
      height: C.tourSkipButtonH,
      background: UI.cream,
      textColor: UI.navy,
      border: UI.navy,
    });
    skip.position.set(...C.tourSkipButtonPos);
    this.world
      .createTransformEntity(skip)
      .addComponent(RayInteractable)
      .addComponent(TourButton, { action: TOUR.skip })
      .addComponent(TourPart);
  }

  // Sweep away every current tour-UI piece (goal card OR tutorial buttons). Drop
  // the RayInteractable tag first so the InputSystem tidies its pointer state
  // while the entity is still alive (the same pattern the SetupSystem uses).
  private disposeTourParts(): void {
    for (const part of [...this.queries.tourParts.entities]) {
      if (part.hasComponent(RayInteractable)) part.removeComponent(RayInteractable);
      part.dispose();
    }
    this.nextEntity = null;
    this.nextMesh = null;
  }

  // The foreman's news "Next" prompt — hidden + un-clickable while he gives the
  // tour, then brought back when the real game (his news) begins.
  private hideForemanPrompt(): void {
    for (const prompt of this.queries.foremanPrompts.entities) {
      if (prompt.object3D) prompt.object3D.visible = false;
      if (prompt.hasComponent(RayInteractable)) prompt.removeComponent(RayInteractable);
    }
  }
  private showForemanPrompt(): void {
    for (const prompt of this.queries.foremanPrompts.entities) {
      if (prompt.object3D) prompt.object3D.visible = true;
      if (!prompt.hasComponent(RayInteractable)) prompt.addComponent(RayInteractable);
    }
  }

  // The foreman's speech panel (rides on his figure's userData), or null before
  // the cockpit is up.
  private foremanPanel(): Mesh | null {
    for (const foreman of this.queries.foremen.entities) {
      return (foreman.object3D?.userData.panel as Mesh) ?? null;
    }
    return null;
  }

  private firstBoard(): Object3D | null {
    for (const board of this.queries.boards.entities) return board.object3D ?? null;
    return null;
  }

  private findCard(action: number): Object3D | null {
    for (const card of this.queries.cards.entities) {
      if ((card.getValue(ControlCard, "action") ?? 0) === action) return card.object3D ?? null;
    }
    return null;
  }

  // The control a "control" step waits for (and highlights). Only ever called for
  // the control steps, whose highlight is "speed", "hire", or "start".
  private controlForHighlight(highlight: TourStep["highlight"]): number {
    if (highlight === "hire") return CONTROL.hire;
    if (highlight === "start") return CONTROL.start;
    return CONTROL.speed;
  }
}
