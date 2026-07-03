// =============================================================================
// config.ts — all the game's tunable data — economics, news beats, report text, tour script.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================



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
export const CONSTANTS = {
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

  // --- Railroad shipping (VS.13: the railroad + the port at Norfolk) ---------
  // A painted rail car sits against the wall just past the output crate. Each
  // time a batch sells, a crate slides off the output toward the car — the goods
  // leaving by rail for the port. No new lights: it is a textured box + wheels.
  shipping: {
    railCarX: 5.4, // rail car world x — just past the output (4.4), tucked against the +X wall (6)
    railCarBodyColor: 0x7a3b2c, // boxcar red-brown
    railCarWheelColor: 0x2b2b2b, // dark iron wheels
    railColor: 0x4a4038, // the painted rail on the floor
    crateSize: 0.5, // the little shipping crate that slides to the car
    crateColor: 0x8a6a3a, // a filled crate (a touch lighter than the output crate)
    seconds: 1.6, // how long the crate takes to slide to the car
    rise: 0.55, // how high it arcs on the way (meters)
  },

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
    { label: "Coins", value: "$50", fill: 0.17 }, // the running money balance (headline) — seeded from coins.start / coins.max
    { label: "Production Output", value: "120", fill: 0.55 },
    { label: "Raw Materials", value: "120", fill: 1.0 },
    { label: "Worker Satisfaction", value: "68%", fill: 0.68 },
    { label: "Price", value: "$8", fill: 0.4 },
    { label: "Costs", value: "$0", fill: 0.0 }, // this run's costs, in coins (0 until the first run)
    { label: "Profit", value: "$0", fill: 0.0 }, // this run's profit, in coins (0 until the first run)
  ],

  // Seeds for the Costs/Profit meters before the first run (a reference sale, so
  // the dashboard looks populated). The margin (profit share) matches the old
  // Profit Margin seed; the line's first run replaces these with real numbers.
  profitDisplay: {
    seedRevenue: 100, // coins of the reference sale used to seed Costs/Profit
    seedMargin: 0.22, // starting profit share of a sale (0..1)
  },

  // --- Coins: the visible, honest money model (Phase 3.1) ---------------------
  // A running balance students can actually follow. Each run adds real coins —
  // revenue (items × price) minus real costs (materials used × material cost, plus
  // wages) — and one-time actions (reorder / repair / expand / safety guards)
  // subtract their coin price right away, while filled orders pay their bonus. The
  // Costs and Profit meters show THIS run's real coin breakdown; the Coins meter
  // shows the balance. (The abstract profit-margin still GRADES the report — this
  // is the money the student sees.) If the balance ever hits zero, the foreman
  // hands over one small loan so the day never dead-ends.
  coins: {
    start: 50, // starting purse (coins)
    max: 300, // a full Coins bar (for the meter fill)
    wagePerRun: 3, // coins each worker is paid per run
    orderCost: 12, // coins to reorder raw materials
    repairCost: 18, // coins to repair the machine after a breakdown
    expandCost: 40, // coins to expand the line
    guardsCost: 20, // coins to add safety guards (the safety event)
    loanAmount: 40, // the one-time loan handed over if the balance hits zero
    loanText:
      "You are out of coins! The bank gives you a one-time loan of $40 to keep the factory going. Spend it wisely.",
  },

  // --- Order board (the goal that makes every control matter) -----------------
  // A small board beside the readout board posts buyer ORDERS ("the railroad
  // needs 40 planks by the closing whistle"). Each run's output counts toward
  // every open order; fill one before its deadline (in runs) for a reward, or the
  // rival factory takes it. Sizes/positions mirror the readout board so the two
  // sit side by side; the order data itself lives in the ORDERS list below.
  orders: {
    width: 2.7, // board size left-to-right (meters)
    height: 2.4, // board size up-and-down (meters) — matches the readout board
    x: -3.9, // to the LEFT of the readout board (which is centered at x 0, ~4.4 wide)
    // y + z + tilt are taken from the readout board at build time (boardY / lineCenterZ / boardTilt)
    maxVisible: 3, // most order rows shown at once
    fillBonusMargin: 0.12, // a filled order bumps Profit by this (a placeholder reward until Phase 3.1 adds real coins)
    stealBehind: 0.6, // when the competitor opens, it takes any open order less than this fraction filled
    popSeconds: 0.4, // how long the little "stamp" scale-pop plays when an order resolves
    openColor: 0x1b6a6a, // teal — an order still in progress (the course accent)
    filledColor: 0x2e7d32, // green — FILLED ✓
    lostColor: 0xb3402e, // red — the rival took it
  },

  // --- Prediction prompts (one-tap "what will happen?" — see PREDICTIONS) ------
  // A question panel floats in front of the player (between the desk and the
  // board) with two tappable answer buttons beneath it. It appears at a decision
  // point, waits for one tap, then clears; the outcome + tally come later.
  predictions: {
    panelW: 3.2, // question panel size left-to-right (meters)
    panelH: 0.72, // question panel size up-and-down (meters)
    y: 2.0, // how high the question floats off the floor
    z: -2.85, // how far in front of the player (between the desk at -2.1 and the board)
    buttonW: 1.35, // answer button width (meters)
    buttonH: 0.42, // answer button height (meters)
    buttonY: 1.5, // answer buttons float just below the question
    buttonGap: 0.78, // each button sits this far left/right of center (meters)
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
  // A TIRED crew works slower: once Worker Satisfaction drops below this, each
  // worker's hands count for less that run (a discoverable consequence, so pushing
  // Fast run-after-run FEELS self-defeating instead of just being graded down at
  // the end). Kept gentle — the point is to notice it, not to be punished.
  tiredThreshold: 0.4, // below this satisfaction (0..1), the crew is "tired"
  tiredOutputScale: 0.6, // a tired crew's worker output is scaled by this (6 -> ~4 each)

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

  // --- Worker-safety event (production vs. workers — a real decision) ---------
  // Once the student has run the machine FAST and pushed Worker Satisfaction below
  // `threshold`, a worker gets hurt and the line PAUSES for one choice: add safety
  // guards (costs coins now, but the crew feels safer AND the machine runs steadier
  // from then on) or push on (keep the pace, but the shaken crew's satisfaction
  // drops hard and the machine breaks more for a few runs). It fires ONCE, only
  // from the student's own pushing — never at random — so it always feels earned,
  // and it feeds the debrief's "production vs. workers" question. All the numbers
  // and words live here.
  safetyEvent: {
    threshold: 0.45, // fires after a Fast run leaves satisfaction below this
    // "Add safety guards" outcome:
    guardsCostMargin: 0.1, // coins spent now (a Profit dip)
    guardsSatisfactionLift: 0.18, // the relieved crew's satisfaction climbs
    guardsWearRelief: 0.03, // a PERMANENT cut to how much Fast wears the machine
    // "Push on" outcome:
    pushSatisfactionHit: 0.15, // the shaken crew's satisfaction drops hard
    pushBreakdownBonus: 0.15, // extra breakdown chance...
    pushBreakdownRuns: 3, // ...for this many runs afterward
    // Words (4th–5th grade):
    question: "A worker got hurt pushing the machine so hard!",
    history: "In real factories, accidents like this led to new safety rules.",
    guardsLabel: "🛡️ Add safety\nguards",
    pushLabel: "⏩ Push on",
    guardsResult:
      "Safety guards added. The crew feels safer, and the machine runs steadier now.",
    pushResult:
      "We pushed on. The shaken crew is uneasy, and the machine may break more for a while.",
    // Layout (a small modal in front of the player, above the desk):
    panelW: 3.5, // question panel width (meters)
    panelH: 0.95, // question panel height (meters)
    y: 2.05, // how high the question floats
    z: -2.85, // how far in front (between the desk and the board)
    optionW: 1.6, // each option card's width (meters)
    optionH: 0.62, // each option card's height (meters)
    optionY: 1.35, // options float just below the question
    optionGap: 0.9, // each option sits this far left/right of center
  },

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

    // — WORKER WALKOUT challenge — an already-unhappy crew walks off for a few
    //   runs; ease the pace (satisfaction recovers) or hire fresh hands to cope.
    walkoutSatisfaction: 0.5, // only strikes if Worker Satisfaction is below this when the rival opens
    walkoutFraction: 0.5, // share of the crew that walks out (rounded up, at least 1)
    walkoutRuns: 3, // how many runs they stay off the line

    // — PRICE WAR challenge — the rival cuts prices AGAIN a few runs into the phase
    //   (on top of the opening cut); cope by expanding + efficient Fast bursts.
    pricewarDelayRuns: 3, // runs after the challenge strikes until the second price cut lands
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

  // --- Play Again button (on the End of Day report) ---------------------------
  // A gold button that floats just below the report board. Clicking it resets the
  // game in place (no page reload), so a student can run a DIFFERENT business in
  // the same class session without a teacher having to refresh the tab. The
  // position sits between the desk (z -2.1) and the report (z -3.8), low enough to
  // read as "the day's next step" but still above the desk's sightline so it is
  // never hidden.
  restart: {
    label: "Play Again", // button text (kept short + plain for 5th graders)
    icon: "🔄", // a recycle/again glyph leading the label
    width: 1.5, // button size left-to-right (meters)
    height: 0.36, // button size up-and-down (meters)
    y: 1.0, // how high it floats off the floor — just under the report, clear of the desk
    z: -3.6, // how far in front of the player it hangs (meters, toward -Z)
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
export type SpeedSetting = {
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
export const GROWTH_NEWS = [
  "Demand is rising! Buyers want more {product} than we can make right now. It is time to grow the factory. When people want more of something, the price goes up, so making more is worth more.",
  "Think back to the farm — winter stopped the work for months. This factory runs every day of the year, in any season, so we can keep filling orders no matter the weather.",
  "There are three ways to grow: hire more workers, run the machine faster, or expand the line. Each one has a cost.",
  "More workers means more wages. Running faster wears the machine until it breaks down. Expanding takes a few runs before it pays off.",
  "Keep the raw materials stocked and the crew happy, and these orders are ours to fill.",
];
export const COMPETITION_NEWS = [
  "News from town: a new factory has opened nearby! To keep our buyers, we had to lower our price. Watch the Price on the board fall. When another factory sells the same goods, prices fall, and you have to work smarter to keep your profit.",
  "Tough times test a good manager. Use your controls — reorder materials, change the speed, repair, or hire — to pull us through.",
];
export const CLOSING_NEWS = [
  "That is the closing whistle — the end of the day! You ran a real factory today. Let's look at how we did.",
];

// All the beats, in the order the student hears them.
export const FOREMAN_NEWS = [...GROWTH_NEWS, ...COMPETITION_NEWS, ...CLOSING_NEWS];
// Phase 3 begins at the first competition beat: reaching it drops the price and
// triggers the random challenge (watched by the ProductionSystem).
export const COMPETITION_BEAT = GROWTH_NEWS.length;
// The day ends at the closing beat: reaching it calls the end of the day, and the
// ProductionSystem shows the End of Day Production Report (watched via dayOver).
export const CLOSING_BEAT = GROWTH_NEWS.length + COMPETITION_NEWS.length;

// How many successful runs the student must complete before the foreman is
// allowed to move the day into each later phase. These two numbers are the
// only dials. Raise them to slow the pacing, lower them to speed it up.
export const RUNS_BEFORE_COMPETITION = 4; // produce this many before Phase 3 can start
export const RUNS_BEFORE_CLOSING = 7;     // produce this many before the day can end

// What the foreman says when the student tries to move the story forward too
// early. Shown on his speech panel instead of advancing the news.
export const PACING_NUDGE = {
  competition:
    "Not yet. Keep the line running and try growing the factory first. Hire a hand, change the speed, or expand. Come back once you have a few more runs done.",
  closing:
    "The day is not over yet. Keep the factory going and work through the trouble on the floor. We will close up once we have pushed through.",
};

// Fill the "{product}" / "{material}" / "{machine}" placeholders in a beat with
// the chosen business's words. (Plain split/join — no replaceAll — to stay
// ES2020-friendly.) Reused for the foreman's news AND the challenge announcements.
export function fillNews(template: string, factory: FactoryType | null): string {
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
  id: "breakdown" | "delay" | "walkout" | "pricewar"; // which setback (the system branches on it)
  name: string; // short headline for the status note
  announce: string; // what the status note says when it strikes (and how to cope)
  // Optional per-business weight multiplier (keyed by FACTORY_TYPES id). A higher
  // number makes this setback likelier for that business, so each trade's Phase 3
  // matches its personality. Missing = weight 1 (evenly likely).
  bias?: Record<string, number>;
};

export const PHASE3_CHALLENGES: Phase3Challenge[] = [
  {
    id: "breakdown",
    name: "MACHINE BREAKDOWN",
    announce:
      "The {machine} stopped with a puff of smoke and an amber warning light. Click “Repair” to fix it — it takes a moment and costs a little.",
    bias: { iron: 2 }, // the ironworks furnace breaks down more often
  },
  {
    id: "delay",
    name: "DELAYED SHIPMENT",
    announce:
      "Raw materials dropped sharply, and new orders now take longer to arrive. Slow the line or reorder early to cope.",
    bias: { lumber: 2 }, // lumber travels by rail/ship, so it sees more delays
  },
  {
    id: "walkout",
    name: "WORKER WALKOUT",
    announce:
      "Your worn-out crew has walked off the line! Ease the pace to win them back, or hire fresh hands to keep making goods.",
    // Only ever picked when the crew is ALREADY unhappy (see competition.walkoutSatisfaction)
    // and there are workers to walk out — so it always feels earned, never random-unfair.
  },
  {
    id: "pricewar",
    name: "PRICE WAR",
    announce:
      "The rival keeps undercutting us — another price cut is coming. To keep your profit, work smarter: expand the line, and use short Fast bursts without wearing the machine out.",
  },
];

// =============================================================================
// ORDERS — the buyer contracts posted on the order board. Each order asks for a
// QUANTITY of the factory's product within a DEADLINE (counted in production
// runs) for a coin BONUS. They are the game's goals: every run's output counts
// toward every open order, so hiring / speeding up / expanding all become "can I
// fill this in time?" instead of "what does this button do?".
//
// `phase` decides WHEN an order is posted:
//   "tutorial"    — the moment the cockpit appears (tuned to be fillable even at
//                   Slow, so a new player succeeds at their first order).
//   "growth"      — when the foreman says demand is rising (bigger, so Slow-only
//                   play misses the deadline — this is what makes hiring / going
//                   faster / expanding feel NEEDED rather than announced).
// When the competitor opens (Phase 3), any still-open order that is less than
// `orders.stealBehind` filled is TAKEN by the rival — a survivable but real loss.
//
// `{product}` is filled in from the chosen business. Buyers name real Virginia
// trade of the era (the railroad, the port at Norfolk, the general store) to tie
// the goal back to VS.13. Sizes assume ~5–9 goods per Slow run (+6 per worker,
// ×3 at Fast); tune quantity/deadline here to make an order easier or harder.
// =============================================================================
export type Order = {
  id: string; // short internal id
  buyer: string; // who wants the goods (names real Virginia trade)
  quantity: number; // how many {product} they want
  deadlineRuns: number; // runs allowed before the deadline passes
  bonus: number; // coins paid for filling it (shown now; a real payout in Phase 3.1)
  phase: "tutorial" | "growth"; // when it is posted
};

export const ORDERS: Order[] = [
  {
    id: "store",
    buyer: "The general store",
    quantity: 14, // small — a few Slow runs fill it
    deadlineRuns: 4,
    bonus: 10,
    phase: "tutorial",
  },
  {
    id: "railroad",
    buyer: "The railroad",
    quantity: 40, // big — Slow-only misses this; you must hire / speed up / expand
    deadlineRuns: 5,
    bonus: 60,
    phase: "growth",
  },
  {
    id: "port",
    buyer: "A Norfolk merchant",
    quantity: 24, // medium — reachable, but not while dawdling
    deadlineRuns: 4,
    bonus: 45,
    phase: "growth",
  },
];

// =============================================================================
// PREDICTIONS — one-tap "what do you think will happen?" prompts (the cheapest
// constructivist mechanic: force a hypothesis BEFORE the evidence arrives).
//
// Each fires ONCE, at a decision point, and the foreman poses a two-choice
// question. After the action plays out, a one-line callout confirms or upends the
// guess, and the end-of-day report tallies "Predictions right: N of M". They are
// never gated — answering is optional and progress never waits on it.
//
// `trigger` is the moment it appears:
//   "fast"   — the first time the student sets the machine to Fast
//   "hire"   — their first hire after the tour
//   "expand" — the moment they choose to expand the line
// `correct` is which option (0 or 1) the game will bear out. The outcomes are
// deterministic — Fast always tires the crew, a worker always adds output,
// expanding always costs now and pays later — so the "right" answer is fixed here.
// =============================================================================
export type Prediction = {
  trigger: "fast" | "hire" | "expand";
  question: string; // what the foreman asks
  options: [string, string]; // the two one-tap answers
  correct: 0 | 1; // which one the game bears out
  rightCallout: string; // shown if they guessed it
  wrongCallout: string; // shown if the result surprised them
};

export const PREDICTIONS: Prediction[] = [
  {
    trigger: "fast",
    question: "If we run the machine Fast, what happens to the crew?",
    options: ["🙂 Happier", "😟 More tired"],
    correct: 1,
    rightCallout: "You guessed it — running Fast wore the crew out.",
    wrongCallout: "Surprise — running Fast wore the crew out.",
  },
  {
    trigger: "hire",
    question: "Will one more worker make MORE goods next run?",
    options: ["📈 Yes, more", "➡️ About the same"],
    correct: 0,
    rightCallout: "You guessed it — more hands made more goods.",
    wrongCallout: "Surprise — more hands made more goods.",
  },
  {
    trigger: "expand",
    question: "Will expanding the line pay off right away?",
    options: ["✅ Right away", "⏳ Not yet"],
    correct: 1,
    rightCallout: "You guessed it — expanding costs now and pays off later.",
    wrongCallout: "Surprise — expanding costs now and pays off later.",
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
export type ReportBand = "high" | "medium" | "low";

export type ReportScore = {
  label: string; // matches the board row this score is read from
  percent: boolean; // shown as a "%" (0..1 score) or a whole number (output)?
  high: number; // at/above this is a "high" day (same units as the score)
  medium: number; // at/above this is "medium"; below it is "low"
  feedback: { high: string; medium: string; low: string }; // the line per band
};

export const REPORT_SCORES: ReportScore[] = [
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
export const REPORT_SUMMARY = [
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
export const REPORT_WRAP: Record<string, { high: string; low: string }> = {
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
export const REPORT_CLOSING =
  "Factories helped Virginia's economy grow, but balancing goods, workers, and profit was the real challenge, and today you ran one yourself.";


// What each tour button does. Plain numbers (stored in TourButton.action) with
// readable names, all handled in the TutorialSystem.
export const TOUR = {
  start: 0, // "Start the tour": reveal the cockpit and begin the foreman's walkthrough
  skip: 1, // "Skip tour": jump straight to the game (from the goal card OR mid-tour)
  next: 2, // "Next ▸": advance to the foreman's next line (on a narrative step)
};

// What each control card does. Plain numbers (stored in ControlCard.action) with
// readable names. All six are wired up in the ProductionSystem. EXPAND stays
// locked until the foreman announces rising demand (then it "opens up"); REPAIR
// sits idle ("Machine OK") unless a Phase 3 breakdown stops the machine.
export const CONTROL = {
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
export const HINTS = {
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
export const CALLOUTS = {
  // The first time the student hires a worker.
  firstHire:
    "Real factories employed hundreds of workers, far more than a family farm ever could.",
  // The first time the Raw Materials stock runs low (at/below materials.lowThreshold).
  lowMaterials:
    "Factories needed a steady supply of materials. If the supply stopped, the machines stopped.",
  // The first time Worker Satisfaction drops low (the crew is being pushed hard).
  workerSafety:
    "Your workers are getting worn out. In real factories, pushing crews too hard led to unsafe conditions, and later to new rules that helped keep workers safe.",
  // The first time a finished batch ships out to the rail car (VS.13).
  railroad:
    "The railroad carries our {product} to the port at Norfolk, where ships sell them far away.",
};

// =============================================================================
// TOUR_GOAL — the words on the "Your Factory, Your Goal" card.
//
// Shown the moment a business is picked, BEFORE the cockpit appears, in plain
// 5th-grade language. The TutorialSystem draws these onto the goal card; "Start
// the tour" then reveals the cockpit and begins the foreman's walkthrough.
// =============================================================================
export const TOUR_GOAL = {
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
export type TourStep = {
  text: string;
  textVR?: string; // said instead of `text` when the student is IN a headset (controller words instead of keyboard words)
  highlight: "none" | "board" | "speed" | "hire" | "start";
  wait: "next" | "control";
};

export const TOUR_STEPS: TourStep[] = [
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
