// =============================================================================
// production.ts — the core game loop on the foreman's desk.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Pressed,
  RayInteractable,
  SphereGeometry,
  World,
  createSystem,
} from "@iwsdk/core";
import {
  Sfx,
} from "./sfx.js";
import {
  UI,
  prefersReducedMotion,
} from "./ui-style.js";
import {
  ControlCard,
  Dynamic,
  FactoryMachine,
  Foreman,
  ForemanPrompt,
  HintSign,
  OrderBoard,
  PredictionButton,
  PredictionPart,
  ReadoutBoard,
  RestartButton,
  SafetyButton,
  SafetyPart,
} from "./components.js";
import {
  CALLOUTS,
  CONSTANTS,
  CONTROL,
  HINTS,
  IDLE_NUDGE_SECONDS,
  ORDERS,
  PACING_NUDGE,
  PHASE3_CHALLENGES,
  PREDICTIONS,
  fillNews,
} from "./config.js";
import type {
  FactoryType,
  Order,
  Phase3Challenge,
  Prediction,
  SpeedSetting,
} from "./config.js";
import {
  applyShadows,
  makeBox,
  makeWorker,
  workerStationX,
} from "./room.js";
import {
  buildPrediction,
  buildReportBoard,
  buildSafetyEvent,
  expandCardText,
  hireCardText,
  makeTextPlane,
  repairCardText,
  speedCardText,
} from "./stations.js";
import type { OrderRow } from "./stations.js";
import { resetGame } from "./reset.js";
import { showCoinToast } from "./hud.js";
import { forcedChallenge } from "./dev.js";

// =============================================================================
// ScoreTween — one in-flight number-and-bar animation on the readout board.
// The ProductionSystem keeps a short list of these so a changed score glides to
// its new value while a gold highlight fades. (Scratch animation state, not
// entity tracking — safe to hold on the system.)
// =============================================================================
export type ScoreTween = {
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
  restartPressed: { required: [RestartButton, Pressed] }, // the report's "Play Again" button was clicked
  orderBoards: { required: [OrderBoard] }, // the buyer-orders board beside the readout board
  predictionPressed: { required: [PredictionButton, Pressed] }, // a prediction answer was tapped
  predictionParts: { required: [PredictionPart] }, // every piece of the current prediction prompt
  safetyPressed: { required: [SafetyButton, Pressed] }, // a worker-safety choice was tapped
  safetyParts: { required: [SafetyPart] }, // every piece of the current safety event
  dynamics: { required: [Dynamic] }, // every runtime-built entity — swept away on "Play Again"
}) {
  // --- Current settings + run state ---
  private speedIndex = CONSTANTS.defaultSpeedIndex; // 0=Slow, 1=Medium, 2=Fast
  private running = false; // is a batch playing right now?
  private runElapsed = 0; // seconds into the current run
  private runDuration = 0; // how long this run lasts (from the speed setting)
  private runBeltSpeed = 0; // belt scroll speed locked in for this run
  private runWearAdd = 0; // machine wear this run adds when it finishes (from the pace)
  private itemsMade = 0; // how many goods this batch produced
  private tiredLoss = 0; // goods LOST this run because the crew was tired (0 if not) — for the honest toast
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
  private taughtRailroad = false; // has the "ships out by rail to Norfolk" note been shown?
  private shipElapsed = -1; // >=0 while a sold crate slides to the rail car (-1 = idle)
  private workerClock = 0; // animation clock for the workers' idle bob (Phase 3.2 juice)

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

  // --- Coins: the visible, honest money balance (Phase 3.1) ------------------
  private coins = 0; // the running money balance
  private coinsIndex = 0; // which board row is Coins
  private lastRunProfit = 0; // this run's profit in real coins (revenue − real costs)
  private lastRunCosts = 0; // this run's costs in real coins (materials used + wages)
  private loanTaken = false; // has the one-time zero-balance loan been given?

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
  // WORKER WALKOUT challenge:
  private walkoutRuns = 0; // runs left with part of the crew off the line (0 = nobody out)
  private walkoutWorkers = 0; // how many workers walked out
  // PRICE WAR challenge:
  private priceWarRuns = 0; // runs left until the rival's SECOND price cut lands (0 = none pending)

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

  // --- Buyer orders (the goals that make every control matter) ---------------
  private orderBoard: Mesh | null = null; // the order board beside the readout board
  // The live orders, in the order posted. Scratch state (not entity tracking) —
  // safe to hold on the system, like the score tweens.
  private activeOrders: Array<{
    cfg: Order; // the config entry (buyer, quantity, deadline, bonus)
    progress: number; // how many goods have been made toward it
    runsLeft: number; // runs remaining before the deadline
    status: "open" | "filled" | "lost"; // open, filled ✓, or taken by the rival
  }> = [];
  private ordersPosted: Record<string, boolean> = {}; // which phases' orders are out
  private ordersFilled = 0; // how many have been filled (shown on the report)
  private stealChecked = false; // has the competitor's one-time order grab run?
  private orderPopElapsed = -1; // >=0 while the little "stamp" pop plays (-1 = idle)

  // --- Prediction prompts (one-tap "what will happen?" — see PREDICTIONS) -----
  private predictionsPosed: Record<string, boolean> = {}; // which prompts have fired (once each)
  private pendingPrediction: Prediction | null = null; // the prompt currently on screen (null = none)
  private predictionAnswered: Record<string, number> = {}; // trigger -> the option tapped
  private predictionAwaiting = new Set<string>(); // answered, waiting for the outcome to show the callout
  private predictionsRight = 0; // guesses the game bore out (for the report)
  private predictionsTotal = 0; // predictions resolved so far
  private runStrained = false; // was the run just finished a Fast (crew-straining) one? (for the "fast" outcome)

  // --- Worker-safety event (production vs. workers — a real decision) ---------
  private safetyEventDone = false; // has the one-time event fired?
  private safetyEventActive = false; // is the line PAUSED waiting for the choice?
  private safetyWearRelief = 0; // permanent cut to Fast's machine wear (from choosing guards)
  private safetyPushRuns = 0; // runs of raised breakdown risk left (from choosing to push on)
  private safetyDecision: "guards" | "push" | null = null; // what they chose (for the report)

  // --- Gentle guidance: the breathing pulse + tidy "only active controls" -----
  private pulseClock = 0; // animation clock for the breathing pulse
  private idleTime = 0; // seconds since the student last pressed a control (drives idle nudges)
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
    this.coinsIndex = C.readouts.findIndex((r) => r.label === "Coins");
    // Seed every per-game mutable field (Production Output / Satisfaction from the
    // board seeds, the profit-share + reference sale, starting materials, and all
    // the run/phase/order flags). resetState() is the SINGLE source of truth for a
    // fresh game — "Play Again" calls it too — so a load and a reset can't drift.
    this.resetState();

    // React the instant a control card is clicked (InputSystem adds Pressed).
    this.queries.pressedCards.subscribe("qualify", (entity) => {
      this.onCardPressed(entity);
    });

    // "Play Again" on the End of Day report → reset the game IN PLACE (no page
    // reload): dispose every dynamic entity, re-seed all state, and re-show the
    // business picker, so the student can run a different factory instantly.
    this.queries.restartPressed.subscribe("qualify", () => {
      Sfx.clunk();
      resetGame(this.world);
    });

    // Grab the order board the moment it appears (placed with the cockpit).
    this.queries.orderBoards.subscribe("qualify", (entity) => {
      this.orderBoard = (entity.object3D as Mesh) ?? null;
    });

    // A prediction answer was tapped → record the guess and clear the prompt.
    this.queries.predictionPressed.subscribe("qualify", (entity) => {
      this.onPredictionAnswer(entity.getValue(PredictionButton, "value") ?? 0);
    });

    // A worker-safety choice was tapped → apply it and unpause the line.
    this.queries.safetyPressed.subscribe("qualify", (entity) => {
      this.onSafetyChoice(entity.getValue(SafetyButton, "value") ?? 0);
    });
  }

  // --- Play Again: tear the game down and re-seed it, in place -----------------
  // Called by resetGame(). Frees everything this system created during a run — the
  // smoke, the workers/annex hung on the production line, and every entity tagged
  // Dynamic (desk, cards, boards, foreman, report, buttons, confetti, hint, note)
  // — then re-seeds all our state. resetGame() handles the globals, the HUD, and
  // re-showing the picker; the ForemanSystem and TutorialSystem re-seed their own.
  reset(): void {
    // Smoke first (it has its own tidy teardown that frees the shared geometry).
    this.removeSmokePuff();

    // The production line itself is permanent scenery, but the workers and the
    // expansion annex were hung on it at runtime — take them off and free them,
    // and tuck the traveling good back to the start in case we reset mid-run.
    for (const line of this.queries.lines.entities) {
      const group = line.object3D;
      if (!group) continue;
      const workers = (group.userData.workers as Object3D[]) ?? [];
      const annex = (group.userData.annexParts as Object3D[]) ?? [];
      const pile = (group.userData.pile as Object3D[]) ?? [];
      for (const part of [...workers, ...annex, ...pile]) this.disposeObject3D(part);
      workers.length = 0;
      annex.length = 0;
      pile.length = 0;
      const product = group.userData.product as Mesh | undefined;
      if (product) {
        product.visible = false;
        product.position.x = CONSTANTS.intakeX;
        const glow = product.userData.glow as Mesh | undefined;
        if (glow) (glow.material as MeshBasicMaterial).opacity = 0;
      }
      const shipCrate = group.userData.shipCrate as Mesh | undefined;
      if (shipCrate) shipCrate.visible = false; // tuck away a crate mid-ship
    }

    // Dispose EVERY runtime-built entity in one sweep (copy first — disposing
    // mutates the live query). Drop RayInteractable first so the InputSystem tidies
    // its pointer state while the entity is still alive (same as the pick teardown).
    for (const entity of [...this.queries.dynamics.entities]) {
      if (entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
      entity.dispose();
    }

    this.resetState();
  }

  // Remove an Object3D from the scene and free its GPU resources. Used for the
  // line's runtime children (workers, annex), which are plain Object3Ds, not
  // entities — each has its own geometry + material, so disposing is safe.
  private disposeObject3D(obj: Object3D): void {
    obj.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    obj.parent?.remove(obj);
  }

  // Re-seed every per-game mutable field to its opening value. The ONE place that
  // lists them all — called from init() (so it runs on every load) and reset() (so
  // Play Again matches a fresh load exactly). Indices/belt spans are set once in
  // init() and never change, so they are deliberately NOT reset here.
  private resetState(): void {
    const C = CONSTANTS;
    this.speedIndex = C.defaultSpeedIndex;
    this.running = false;
    this.runElapsed = 0;
    this.runDuration = 0;
    this.runBeltSpeed = 0;
    this.runWearAdd = 0;
    this.itemsMade = 0;
    this.tiredLoss = 0;
    this.transformed = false;
    this.brokeDown = false;
    this.pendingMargin = 0;
    this.pendingSatisfaction = 0;
    this.pendingMaterials = 0;
    this.workers = 0;
    this.fastStreak = 0;
    this.materials = C.materials.start;
    this.taughtFirstHire = false;
    this.taughtLowMaterials = false;
    this.taughtWorkerSafety = false;
    this.taughtRailroad = false;
    this.shipElapsed = -1;
    this.machineWear = 0;
    this.costBurden = 0;
    this.expandUnlocked = false;
    this.expandState = "none";
    this.expandRunsLeft = 0;
    this.expandAnnexAdded = false;
    this.outputValue = parseFloat(C.readouts[this.outputIndex].value); // "120" -> 120
    this.satisfactionValue =
      parseFloat(C.readouts[this.satisfactionIndex].value) / 100; // "68%" -> 0.68
    this.marginValue = C.profitDisplay.seedMargin; // 0.22 (grades the report)
    this.lastRevenue = C.profitDisplay.seedRevenue; // 100 coins
    this.coins = C.coins.start; // the starting money purse
    this.lastRunProfit = 0;
    this.lastRunCosts = 0;
    this.loanTaken = false;
    this.noteShown = false;
    this.noteFadeElapsed = 0;
    this.tweens = [];
    this.priceValue = 0;
    this.priceSeeded = false;
    this.competitionStarted = false;
    this.challenge = null;
    this.machineDown = false;
    this.repairing = false;
    this.repairElapsed = 0;
    this.smokeElapsed = 0; // the puffs + shared geometry are freed by removeSmokePuff()
    this.shipmentSlow = false;
    this.shipmentPending = false;
    this.shipmentElapsed = 0;
    this.walkoutRuns = 0;
    this.walkoutWorkers = 0;
    this.priceWarRuns = 0;
    this.reportShown = false;
    this.reportBoard = null; // its entity is disposed by the Dynamic sweep
    this.reportFadeElapsed = 0;
    this.confetti = null; // its entity is disposed by the Dynamic sweep
    this.confettiEntity = null;
    this.confettiVelocities = null;
    this.confettiElapsed = 0;
    this.orderBoard = null; // re-captured when a new board is placed
    this.activeOrders = [];
    this.ordersPosted = {};
    this.ordersFilled = 0;
    this.stealChecked = false;
    this.orderPopElapsed = -1;
    this.predictionsPosed = {};
    this.pendingPrediction = null; // any on-screen prompt is disposed by the Dynamic sweep
    this.predictionAnswered = {};
    this.predictionAwaiting = new Set();
    this.predictionsRight = 0;
    this.predictionsTotal = 0;
    this.runStrained = false;
    this.safetyEventDone = false;
    this.safetyEventActive = false; // any on-screen event UI is disposed by the Dynamic sweep
    this.safetyWearRelief = 0;
    this.safetyPushRuns = 0;
    this.safetyDecision = null;
    this.pulseClock = 0;
    this.idleTime = 0;
    this.controlsLaidOut = false;
    this.startHinted = false;
    this.runsFinished = 0;
    this.hintQueue = [];
    this.hintQueued = { start: false, again: false, foreman: false };
    this.hintActive = false;
    this.hintElapsed = 0;
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

    // Post buyer orders as the day's phases open. The tutorial order appears once
    // the cockpit is up and the tour is over (guaranteed fillable at Slow); the
    // bigger "growth" orders appear when the foreman says demand is rising; and
    // when the competitor opens, it grabs any order we are too far behind on.
    if (this.orderBoard && this.globals.tourDone && !this.ordersPosted.tutorial) {
      this.postOrders("tutorial");
    }
    if (this.orderBoard && this.globals.demandRising && !this.ordersPosted.growth) {
      this.postOrders("growth");
    }
    if (this.globals.competitionOpen && !this.stealChecked) {
      this.stealChecked = true;
      this.competitorSteal();
    }
    if (this.orderPopElapsed >= 0) this.advanceOrderPop(delta);

    if (this.running) this.advanceRun(delta);
    if (this.repairing) this.advanceRepair(delta);
    if (this.shipmentPending) this.advanceShipment(delta);
    if (this.shipElapsed >= 0) this.advanceShip(delta);
    this.updateWorkers(delta); // idle bob + tired droop (Phase 3.2 juice)
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
      this.updateIdleNudge(delta);
    }
  }

  // Keep a 30-minute class block moving: if the student stalls after the tour —
  // nothing running, no modal open, day not over — the foreman offers a nudge
  // that fits the moment. The clock resets on any control press (onCardPressed).
  private updateIdleNudge(delta: number): void {
    // Don't count time while something is already happening or a decision is up.
    if (
      this.running ||
      this.repairing ||
      this.machineDown ||
      this.reportShown ||
      this.globals.dayOver ||
      this.safetyEventActive ||
      this.pendingPrediction ||
      this.shipElapsed >= 0
    ) {
      this.idleTime = 0;
      return;
    }
    this.idleTime += delta;
    if (this.idleTime < IDLE_NUDGE_SECONDS) return;
    this.idleTime = 0; // wait another full stretch before nudging again
    // Pick the nudge that fits: out of stock → order; growth unlocked → grow; else run.
    if (this.materials <= CONSTANTS.materials.lowThreshold) {
      this.setNote(PACING_NUDGE.idleOrder);
    } else if (this.expandUnlocked && this.expandState === "none") {
      this.setNote(PACING_NUDGE.idleGrow);
    } else {
      this.setNote(PACING_NUDGE.idleRun);
    }
  }

  // --- Click handling --------------------------------------------------------
  // Trigger a control by its action (0–5), as if its card were clicked — for the
  // keyboard 1–6 shortcuts (accessibility). Only after the tour (during the tour
  // the student uses the ray/click so the TutorialSystem can track the step), and
  // only for a currently-usable card (a hidden or tour-locked card has no
  // RayInteractable, so it is quietly ignored).
  pressControl(action: number): void {
    if (!this.globals.tourDone) return;
    for (const card of this.queries.allCards.entities) {
      if ((card.getValue(ControlCard, "action") ?? -1) !== action) continue;
      if (!card.hasComponent(RayInteractable)) return; // hidden or locked — ignore
      this.onCardPressed(card);
      return;
    }
  }

  private onCardPressed(entity: ReturnType<World["createTransformEntity"]>): void {
    Sfx.clunk(); // a soft woody click whenever a control is used
    this.idleTime = 0; // the student just acted — reset the idle-nudge clock
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

    // The first time the student sets the machine to Fast, ask them to predict
    // what it does to the crew (before they run it — a hypothesis before evidence).
    if (CONSTANTS.speeds[this.speedIndex].strainsCrew) this.maybePosePrediction("fast");
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

    // On their first hire of the real game, ask them to predict whether the extra
    // worker will make more next run (the answer shows on the next run's output).
    this.maybePosePrediction("hire");
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
    this.addCost(C.materials.orderMarginCost); // margin dip (grades the report)
    this.spendCoins(C.coins.orderCost); // and the real coin cost of the reorder
    const factory = this.globals.activeFactory as FactoryType | null;
    const material = factory ? factory.material : "materials";
    this.setNote(`Fresh ${material} arrives by rail — the stock is full again.`);
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
    this.addCost(C.expand.marginCost); // margin dip (grades the report)
    this.spendCoins(C.coins.expandCost); // and the real coin cost of the expansion
    this.repaintExpandCard();

    // Ask them to predict whether expanding pays off right away (it does not — it
    // costs now and pays over the next few runs; the callout lands when it does).
    this.maybePosePrediction("expand");
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

    // The worker-safety event pauses the line until the student decides.
    if (this.safetyEventActive) {
      this.setNote("A worker is hurt — choose how to handle it before running again.");
      return;
    }

    const speed = C.speeds[this.speedIndex];
    this.running = true;
    this.runElapsed = 0;
    // Track how long we've been pushing the hardest pace (it resets the moment we
    // ease off) — it feeds both crew strain and (through wear) breakdowns.
    this.fastStreak = speed.strainsCrew ? this.fastStreak + 1 : 0;
    this.runStrained = speed.strainsCrew; // remember for the "Fast tires the crew" prediction outcome

    // Decide up front whether the machine breaks down this run. The chance is the
    // business's own risk PLUS the wear we've built up running fast — so a
    // breakdown grows likely "later," the more we push the pace. Choosing to PUSH
    // ON through the safety event raises the risk for a few runs afterward.
    const pushRisk = this.safetyPushRuns > 0 ? C.safetyEvent.pushBreakdownBonus : 0;
    if (this.safetyPushRuns > 0) this.safetyPushRuns -= 1;
    const chance = Math.min(
      C.breakdown.maxChance,
      factory.breakdownRisk + this.machineWear + pushRisk,
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
    //
    // A TIRED crew (Worker Satisfaction below the threshold) works slower, so each
    // worker's hands count for less this run. We track the goods lost so the run's
    // toast can say so honestly — pushing Fast until the crew drags then FEELS
    // self-defeating, rather than only showing up as a low grade at the end.
    //
    // During a WORKER WALKOUT, the walked-out hands aren't on the line, so only the
    // remaining crew makes goods.
    const activeWorkers = Math.max(
      0,
      this.workers - (this.walkoutRuns > 0 ? this.walkoutWorkers : 0),
    );
    const fullWorkerOutput = activeWorkers * C.workerOutputPerRun;
    const crewTired =
      activeWorkers > 0 && this.satisfactionValue < C.tiredThreshold;
    const workerOutput = crewTired
      ? Math.round(fullWorkerOutput * C.tiredOutputScale)
      : fullWorkerOutput;
    this.tiredLoss = fullWorkerOutput - workerOutput;
    const wanted =
      Math.round(factory.throughput * speed.multiplier) +
      workerOutput +
      (this.expandState === "done" ? C.expand.outputBonus : 0);
    this.itemsMade = Math.min(wanted, this.materials);
    this.pendingMaterials = this.materials - this.itemsMade;
    this.pendingMargin = this.marginFor(factory, speed);
    this.pendingSatisfaction = this.satisfactionFor(factory, speed);
    this.runDuration = speed.runSeconds;
    this.runBeltSpeed = speed.beltSpeed;
    // Safety guards (if the student chose them) make the machine wear slower for
    // good — a small permanent relief on top of the pace's own wear.
    this.runWearAdd = speed.wearAdd - this.safetyWearRelief;
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
    this.startShip(); // send a crate sliding out to the rail car (the goods ship by rail)
    this.addToPile(); // stack a finished-goods cube in the output crate (Phase 3.2 juice)

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

    // Money: the REAL coin breakdown of THIS run's sale. Revenue = items × price;
    // costs = the materials this run used (× material cost) + the crew's wages; the
    // profit is what's left, and it lands in the running Coins balance. (marginValue
    // is still kept, above/below, purely to GRADE the report — see the plan.)
    this.marginValue = this.pendingMargin;
    const runFactory = this.globals.activeFactory as FactoryType | null;
    const revenue = this.itemsMade * this.priceValue;
    this.lastRevenue = revenue;
    const materialsCost = runFactory ? this.itemsMade * runFactory.materialCost : 0;
    const wages = this.workers * C.coins.wagePerRun;
    const fromCosts = this.lastRunCosts;
    const fromProfit = this.lastRunProfit;
    this.lastRunCosts = materialsCost + wages;
    this.lastRunProfit = revenue - this.lastRunCosts;
    const fromCoins = this.coins;
    this.coins += this.lastRunProfit;
    // Glide the three money meters to their new real-coin values (Coins is the
    // running balance; Costs / Profit are this run's breakdown).
    const fill = (v: number): number => Math.max(0, Math.min(1, v / C.coins.max));
    this.startTween(this.costsIndex, fromCosts, this.lastRunCosts, fill(fromCosts), fill(this.lastRunCosts), (n) => `$${Math.round(n)}`);
    this.startTween(this.profitIndex, fromProfit, this.lastRunProfit, fill(fromProfit), fill(this.lastRunProfit), (n) => `$${Math.round(n)}`);
    this.refreshCoinsMeter(fromCoins);
    if (this.lastRunProfit !== 0) showCoinToast(this.lastRunProfit); // +N / −N near the board
    this.maybeLoan(); // a rough run can drop the balance to zero — offer the one-time loan

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
        this.resolvePrediction("expand"); // it finally paid off — settle the "right away?" guess
      }
      this.repaintExpandCard();
    }

    // Phase-3 countdowns: a WORKER WALKOUT ends after its runs (the crew returns),
    // and a PRICE WAR's second cut lands when its counter runs out.
    if (this.walkoutRuns > 0) {
      this.walkoutRuns -= 1;
      if (this.walkoutRuns <= 0) {
        this.walkoutWorkers = 0;
        this.setNote("Your crew is back on the line. Keep the pace kind to them.");
      }
    }
    if (this.priceWarRuns > 0) {
      this.priceWarRuns -= 1;
      if (this.priceWarRuns <= 0) {
        this.dropPrice(); // the rival's second cut lands
        this.setNote("The rival cut prices again! Work smarter to protect your profit.");
      }
    }

    // Reveal the farm-vs-factory note with this batch's number.
    this.showNote();

    // Teaching moment (once, on the second run): name the railroad + Norfolk port
    // the goods ship out to (runs AFTER showNote so it takes the note that run).
    this.maybeTeachRailroad();

    // If a tired crew dragged this run's output down, say so honestly (right after
    // the farm note, so it takes the note this run). This is what makes pushing
    // Fast until the crew is worn out FEEL self-defeating.
    if (this.tiredLoss > 0) {
      this.setNote(
        `The tired crew made ${this.tiredLoss} fewer this run. Ease off to let them recover.`,
      );
    }

    // Teaching moment (once): if this run drained the stock low, explain why a
    // steady supply mattered. Runs AFTER showNote so it takes the note that run.
    this.maybeTeachLowMaterials();

    // The one-time worker-safety EVENT (a real decision), if this Fast run pushed
    // the crew below the safety line — from the student's own choices, not random.
    this.maybeFireSafetyEvent();

    // First-time hints: nudge the player to keep going after the first run, then
    // toward the foreman after the second. Each is shown only once, then it fades.
    this.runsFinished += 1;
    this.globals.runsCompleted = this.runsFinished;
    if (this.runsFinished === 1) this.queueHint("again");
    if (this.runsFinished === 2) this.queueHint("foreman");

    // Credit this batch toward every open order, and settle any that just filled
    // or ran out of time. (A broken run makes no goods, so it never calls this —
    // a breakdown doesn't burn an order's deadline.)
    this.advanceOrders(this.itemsMade);

    // Settle any prediction whose evidence just arrived (kept last so the callout
    // wins the status note on the run it resolves): a Fast run shows the crew got
    // tired; the run after a hire shows the extra worker's output. (Expand settles
    // above, the run its payoff lands.)
    if (this.runStrained) this.resolvePrediction("fast");
    this.resolvePrediction("hire");
  }

  // A broken run: no goods, a repair cost, a frustrated crew — but fixing it
  // clears the built-up wear, so easing off the pace afterward keeps it running.
  private finishRunBroken(): void {
    const C = CONSTANTS;
    this.running = false;
    this.brokeDown = false;
    Sfx.uhoh(); // a soft "uh-oh" — this run broke down
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
    const product = factory ? factory.product : "goods";
    // A clear side-by-side, with THIS run's real number — so the farm-to-factory
    // leap is felt, not just told (learning objective #1).
    this.setNote(
      `By hand: about 1 ${product} a day.  •  ` +
        `Your factory this run: ${this.itemsMade}!`,
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

  // Teaching moment (once): name the railroad + the port at Norfolk the goods ship
  // out to (VS.13). Held to the SECOND run so the first run keeps the farm-vs-
  // factory side-by-side (runsFinished is still pre-increment here).
  private maybeTeachRailroad(): void {
    if (!this.globals.tourDone) return;
    if (this.taughtRailroad) return;
    if (this.runsFinished < 1) return; // let run 1 show the farm contrast first
    this.taughtRailroad = true;
    const factory = this.globals.activeFactory as FactoryType | null;
    this.setNote(fillNews(CALLOUTS.railroad, factory));
  }

  // --- Shipping the goods out by rail (VS.13) --------------------------------
  // A batch just sold: send a filled crate sliding off the output crate to the
  // rail car. Purely visual — the sale already happened.
  private startShip(): void {
    Sfx.whoosh(); // a gentle whoosh as the goods head off by rail
    for (const line of this.queries.lines.entities) {
      const crate = line.object3D?.userData.shipCrate as Mesh | undefined;
      if (!crate) continue;
      crate.visible = true;
      crate.position.set(CONSTANTS.outputX, 0.35, 0);
      (crate.material as MeshLambertMaterial).opacity = 1;
    }
    this.shipElapsed = 0;
  }

  // Glide the shipping crate from the output to the rail car in a little arc, fade
  // it as it "loads," then tuck it away. Writes only into the crate's transform +
  // material — no per-frame allocation.
  private advanceShip(delta: number): void {
    const S = CONSTANTS.shipping;
    this.shipElapsed += delta;
    const t = Math.min(1, this.shipElapsed / S.seconds);
    const done = t >= 1;
    for (const line of this.queries.lines.entities) {
      const crate = line.object3D?.userData.shipCrate as Mesh | undefined;
      if (!crate) continue;
      if (done) {
        crate.visible = false;
        continue;
      }
      const x = CONSTANTS.outputX + (S.railCarX - CONSTANTS.outputX) * this.smooth(t);
      crate.position.set(x, 0.35 + Math.sin(Math.PI * t) * S.rise, 0);
      // Fade out over the last third as it settles onto the car.
      (crate.material as MeshLambertMaterial).opacity =
        t > 0.66 ? Math.max(0, 1 - (t - 0.66) / 0.34) : 1;
    }
    if (done) this.shipElapsed = -1;
  }

  // --- Feedback juice (Phase 3.2) --------------------------------------------
  // Give the workers a subtle idle bob (livelier while a batch runs) and a weary
  // forward slump + shrink when the crew is worn down. Writes only into each
  // figure's transform — no allocation, the DustSystem pattern.
  private updateWorkers(delta: number): void {
    const J = CONSTANTS.juice;
    this.workerClock += delta;
    const tired = this.satisfactionValue < CONSTANTS.tiredThreshold;
    const amp = this.running ? J.bobRun : J.bobIdle;
    const ease = Math.min(1, delta * 4);
    const targetTilt = tired ? J.droopTilt : 0;
    const targetScale = tired ? J.droopScale : 1;
    for (const line of this.queries.lines.entities) {
      const workers = (line.object3D?.userData.workers as Group[]) ?? [];
      for (let i = 0; i < workers.length; i++) {
        const w = workers[i];
        // Bob straight up (abs sine keeps their feet from dipping below the floor).
        w.position.y = Math.abs(Math.sin(this.workerClock * J.bobSpeed + i * 1.3)) * amp;
        w.rotation.x += (targetTilt - w.rotation.x) * ease; // ease into / out of the slump
        const s = w.scale.x + (targetScale - w.scale.x) * ease;
        w.scale.setScalar(s);
      }
    }
  }

  // Stack a finished-goods cube in the output crate each run, so output growth is
  // visible in the WORLD, not only a number. When the crate fills to the cap, it
  // "ships out" — the small cubes clear and the pile starts fresh.
  private addToPile(): void {
    const J = CONSTANTS.juice;
    const factory = this.globals.activeFactory as FactoryType | null;
    const color = factory ? factory.color : CONSTANTS.rawMaterialColor;
    for (const line of this.queries.lines.entities) {
      const group = line.object3D;
      if (!group) continue;
      const pile = (group.userData.pile as Object3D[]) ?? [];
      if (pile.length >= J.pileCap) {
        for (const c of pile) this.disposeObject3D(c); // the full crate ships out
        pile.length = 0;
      }
      const idx = pile.length;
      const cube = makeBox(
        J.pileCubeSize,
        J.pileCubeSize,
        J.pileCubeSize,
        color,
        [
          CONSTANTS.outputX + (idx % 2 === 0 ? -0.16 : 0.16), // two columns
          0.5 + Math.floor(idx / 2) * (J.pileCubeSize + 0.02), // stacked at the crate rim, up
          0,
        ],
      );
      group.add(cube);
      pile.push(cube);
    }
  }

  // --- Worker-safety event ---------------------------------------------------
  // Once (and only once), the first time the student's OWN pushing — a Fast run
  // that leaves the crew below the safety threshold — hurts a worker, pause the
  // line for a real choice: add safety guards or push on. Gated on a Fast run so
  // it's always earned by their choices, never random. (Called from finishRun,
  // after the run's satisfaction has settled.)
  private maybeFireSafetyEvent(): void {
    if (!this.globals.tourDone) return;
    if (this.safetyEventDone) return;
    if (!this.runStrained) return; // only a Fast (crew-straining) run can trigger it
    if (this.satisfactionValue >= CONSTANTS.safetyEvent.threshold) return;
    this.safetyEventDone = true;
    this.taughtWorkerSafety = true; // the event covers the teaching moment too
    this.safetyEventActive = true; // pause the line until a choice is made
    buildSafetyEvent(this.world);
    Sfx.uhoh(); // a soft "uh-oh" — a worker got hurt
    this.setNote(CONSTANTS.safetyEvent.question);
  }

  // Resolve the safety choice: apply its effects, clear the prompt, unpause.
  private onSafetyChoice(value: number): void {
    const S = CONSTANTS.safetyEvent;
    Sfx.clunk();
    for (const part of [...this.queries.safetyParts.entities]) {
      if (part.hasComponent(RayInteractable)) part.removeComponent(RayInteractable);
      part.dispose();
    }
    this.safetyEventActive = false;
    if (value === 0) {
      // Add safety guards: pay now, the relieved crew lifts, and the machine wears
      // slower from here on (a small PERMANENT relief).
      this.safetyDecision = "guards";
      this.addCost(S.guardsCostMargin); // margin dip (grades the report)
      this.spendCoins(CONSTANTS.coins.guardsCost); // and the real coin cost of the guards
      this.safetyWearRelief = S.guardsWearRelief;
      this.liftSatisfaction(S.guardsSatisfactionLift);
      this.setNote(S.guardsResult);
    } else {
      // Push on: the shaken crew drops hard, and the machine breaks more for a few
      // runs.
      this.safetyDecision = "push";
      this.safetyPushRuns = S.pushBreakdownRuns;
      this.liftSatisfaction(-S.pushSatisfactionHit);
      this.setNote(S.pushResult);
    }
  }

  // Nudge Worker Satisfaction by `delta` (kept in band) and glide the meter to it.
  private liftSatisfaction(delta: number): void {
    const C = CONSTANTS;
    const from = this.satisfactionValue;
    const to = Math.max(C.satisfactionMin, Math.min(C.satisfactionMax, from + delta));
    this.satisfactionValue = to;
    this.startTween(this.satisfactionIndex, from, to, from, to, (n) => `${Math.round(n * 100)}%`);
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

  // Charge a one-time cost to the PROFIT-SHARE burden that lowers the report grade
  // (the burden heals back out over later runs). This no longer touches the Costs/
  // Profit meters — those now show the run's real coin breakdown — so the coin
  // deduction rides alongside via spendCoins().
  private addCost(amount: number): void {
    const factory = this.globals.activeFactory as FactoryType | null;
    if (!factory) return;
    this.costBurden += amount;
    this.marginValue = this.marginFor(factory, CONSTANTS.speeds[this.speedIndex]);
  }

  // --- Coins: the honest money balance ---------------------------------------
  // Glide the Coins meter to the current balance (with the gold-flash bump).
  private refreshCoinsMeter(from: number): void {
    const max = CONSTANTS.coins.max;
    const clamp = (v: number): number => Math.max(0, Math.min(1, v / max));
    this.startTween(
      this.coinsIndex,
      from,
      this.coins,
      clamp(from),
      clamp(this.coins),
      (n) => `$${Math.round(n)}`,
    );
  }

  // Spend coins on a one-time action (reorder / repair / expand / safety guards):
  // deduct, show a −N toast, glide the meter, and offer the loan if we hit zero.
  private spendCoins(amount: number): void {
    const from = this.coins;
    this.coins -= amount;
    showCoinToast(-amount);
    this.refreshCoinsMeter(from);
    this.maybeLoan();
  }

  // Earn coins (a filled order's bonus): add, show a +N toast, glide the meter.
  private earnCoins(amount: number): void {
    const from = this.coins;
    this.coins += amount;
    showCoinToast(amount);
    this.refreshCoinsMeter(from);
  }

  // If the balance runs dry, hand over ONE small loan so the day never dead-ends.
  private maybeLoan(): void {
    if (this.loanTaken || this.coins > 0) return;
    this.loanTaken = true;
    const from = this.coins;
    this.coins += CONSTANTS.coins.loanAmount;
    showCoinToast(CONSTANTS.coins.loanAmount);
    this.refreshCoinsMeter(from);
    this.setNote(CONSTANTS.coins.loanText);
  }

  // --- Buyer orders ----------------------------------------------------------
  // Post the orders for one phase (tutorial / growth) onto the board.
  private postOrders(phase: "tutorial" | "growth"): void {
    if (!this.orderBoard) return;
    this.ordersPosted[phase] = true;
    for (const cfg of ORDERS.filter((o) => o.phase === phase)) {
      this.activeOrders.push({
        cfg,
        progress: 0,
        runsLeft: cfg.deadlineRuns,
        status: "open",
      });
    }
    this.refreshOrderBoard();
    this.popOrderBoard();
  }

  // Rebuild the board's display rows from the live orders and repaint it.
  private refreshOrderBoard(): void {
    if (!this.orderBoard) return;
    const factory = this.globals.activeFactory as FactoryType | null;
    const product = factory?.product ?? "goods";
    const rows: OrderRow[] = this.activeOrders.map((o) => ({
      buyer: o.cfg.buyer,
      target: `${o.cfg.quantity} ${product}`,
      quantity: o.cfg.quantity,
      progress: o.progress,
      runsLeft: o.runsLeft,
      bonus: o.cfg.bonus,
      status: o.status,
    }));
    // Mutate the SAME array the board's redraw() closes over (don't replace it).
    const live = this.orderBoard.userData.orders as OrderRow[];
    live.length = 0;
    live.push(...rows);
    (this.orderBoard.userData.redraw as () => void)();
  }

  // Credit a batch toward every open order; settle any that just filled (reward!)
  // or ran out of runs (the rival gets it).
  private advanceOrders(items: number): void {
    if (this.activeOrders.length === 0) return;
    let resolved = false;
    for (const o of this.activeOrders) {
      if (o.status !== "open") continue;
      o.progress += items;
      if (o.progress >= o.cfg.quantity) {
        o.status = "filled";
        this.ordersFilled += 1;
        this.earnCoins(o.cfg.bonus); // the bonus is real money now (Phase 3.1)
        Sfx.coin();
        this.setNote(`Order filled! ${o.cfg.buyer} paid a $${o.cfg.bonus} bonus.`);
        resolved = true;
      } else {
        o.runsLeft -= 1;
        if (o.runsLeft <= 0) {
          o.status = "lost";
          this.setNote(
            `Out of time — the rival factory filled ${o.cfg.buyer.toLowerCase()}'s order.`,
          );
          resolved = true;
        }
      }
    }
    this.refreshOrderBoard();
    if (resolved) this.popOrderBoard();
  }


  // When the competitor opens, it grabs any still-open order we are too far behind
  // on — a survivable but real loss that makes Phase 3 land.
  private competitorSteal(): void {
    let stole = false;
    for (const o of this.activeOrders) {
      if (o.status !== "open") continue;
      if (o.progress / o.cfg.quantity < CONSTANTS.orders.stealBehind) {
        o.status = "lost";
        stole = true;
      }
    }
    if (stole) {
      this.refreshOrderBoard();
      this.popOrderBoard();
      this.setNote("The new factory grabbed an order we were too slow to fill.");
    }
  }

  // A quick "stamp" scale-pop on the order board when an order resolves.
  private popOrderBoard(): void {
    this.orderPopElapsed = 0;
  }
  private advanceOrderPop(delta: number): void {
    if (!this.orderBoard) {
      this.orderPopElapsed = -1;
      return;
    }
    const dur = CONSTANTS.orders.popSeconds;
    this.orderPopElapsed += delta;
    if (this.orderPopElapsed >= dur) {
      this.orderBoard.scale.setScalar(1);
      this.orderPopElapsed = -1;
      return;
    }
    // A gentle up-and-back bump (0 → +8% → 0) over the pop's duration.
    const t = this.orderPopElapsed / dur;
    this.orderBoard.scale.setScalar(1 + 0.08 * Math.sin(Math.PI * t));
  }

  // --- Prediction prompts ----------------------------------------------------
  // Pose the prompt for `trigger`, once, at its decision point — but only after
  // the tour (so it never fights the tutorial), and never two at once.
  private maybePosePrediction(trigger: string): void {
    if (!this.globals.tourDone) return;
    if (this.predictionsPosed[trigger] || this.pendingPrediction) return;
    const pred = PREDICTIONS.find((p) => p.trigger === trigger);
    if (!pred) return;
    this.predictionsPosed[trigger] = true;
    this.pendingPrediction = pred;
    buildPrediction(this.world, pred);
    Sfx.bell(); // the foreman speaks up to ask
  }

  // An answer was tapped: record the guess, sweep the prompt away, and start
  // waiting for the outcome (the callout + tally land when the evidence arrives).
  private onPredictionAnswer(value: number): void {
    const pred = this.pendingPrediction;
    if (!pred) return;
    Sfx.clunk();
    this.predictionAnswered[pred.trigger] = value;
    this.predictionAwaiting.add(pred.trigger);
    this.pendingPrediction = null;
    for (const part of [...this.queries.predictionParts.entities]) {
      if (part.hasComponent(RayInteractable)) part.removeComponent(RayInteractable);
      part.dispose();
    }
  }

  // The evidence for a prediction just arrived: compare the guess to what the game
  // bore out, tally it for the report, and post the confirming/upending callout.
  private resolvePrediction(trigger: string): void {
    if (!this.predictionAwaiting.has(trigger)) return;
    this.predictionAwaiting.delete(trigger);
    const pred = PREDICTIONS.find((p) => p.trigger === trigger);
    if (!pred) return;
    const right = this.predictionAnswered[trigger] === pred.correct;
    this.predictionsTotal += 1;
    if (right) this.predictionsRight += 1;
    this.setNote(right ? pred.rightCallout : pred.wrongCallout);
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
      // Track the runtime-added pieces so "Play Again" can take them back off the
      // (otherwise permanent) production line.
      (group.userData.annexParts as Object3D[]).push(deck, bin);
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

    const factory = this.globals.activeFactory as FactoryType | null;
    const fid = factory?.id ?? "";

    // Which setbacks can strike right now. The WORKER WALKOUT only qualifies when
    // the crew is ALREADY unhappy AND there are workers to walk out — so it always
    // feels earned by the student's own pushing, never random-unfair. The rest are
    // always in the running.
    const eligible = PHASE3_CHALLENGES.filter((c) => {
      if (c.id === "walkout") {
        return (
          this.workers > 0 &&
          this.satisfactionValue < CONSTANTS.competition.walkoutSatisfaction
        );
      }
      return true;
    });

    // Pick one, weighted by the business's personality (ironworks breaks down more,
    // lumber sees more shipment delays — see each challenge's `bias`).
    const weights = eligible.map((c) => c.bias?.[fid] ?? 1);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    let picked = eligible[eligible.length - 1];
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        picked = eligible[i];
        break;
      }
    }
    // QA override: ?challenge=<id> forces a specific setback (see dev.ts).
    const forced = forcedChallenge();
    if (forced) {
      picked = PHASE3_CHALLENGES.find((c) => c.id === forced) ?? picked;
    }
    this.challenge = picked;

    switch (picked.id) {
      case "breakdown":
        this.strikeBreakdown();
        break;
      case "delay":
        this.strikeDelayedShipment();
        break;
      case "walkout":
        this.strikeWalkout();
        break;
      case "pricewar":
        this.strikePriceWar();
        break;
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
    Sfx.uhoh(); // a soft "uh-oh" — the machine broke down
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

  // WORKER WALKOUT: part of the already-unhappy crew walks off the line for a few
  // runs, so fewer hands make goods. Cope by easing the pace (they come back) or
  // hiring fresh workers. Only ever chosen when the crew is already low (see
  // startCompetition), so it lands as a consequence, not a random punishment.
  private strikeWalkout(): void {
    const C = CONSTANTS;
    this.walkoutWorkers = Math.max(
      1,
      Math.ceil(this.workers * C.competition.walkoutFraction),
    );
    this.walkoutRuns = C.competition.walkoutRuns;
    this.announceChallenge();
  }

  // PRICE WAR: the rival will cut prices AGAIN a few runs from now (on top of the
  // opening cut). We just start the countdown here + post the warning/tip; the
  // second cut lands in finishRun when the counter runs out.
  private strikePriceWar(): void {
    this.priceWarRuns = CONSTANTS.competition.pricewarDelayRuns;
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
    this.addCost(C.competition.repairMarginCost); // margin dip (grades the report)
    this.spendCoins(C.coins.repairCost); // and the real coin cost of the repair
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
    this.addCost(C.materials.orderMarginCost); // margin dip (grades the report)
    this.spendCoins(C.coins.orderCost); // and the real coin cost of the (delayed) reorder
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
    // The plain recap lines shown under the scores (NOT graded): orders filled,
    // predictions right, and the worker-safety choice.
    const recapLines: string[] = [];
    if (this.activeOrders.length > 0) {
      recapLines.push(`📋 Orders filled: ${this.ordersFilled} of ${this.activeOrders.length}`);
    }
    if (this.predictionsTotal > 0) {
      recapLines.push(`🔮 Predictions right: ${this.predictionsRight} of ${this.predictionsTotal}`);
    }
    if (this.safetyDecision === "guards") recapLines.push("🛡️ Worker safety: added guards");
    else if (this.safetyDecision === "push") recapLines.push("⏩ Worker safety: pushed on");

    const board = buildReportBoard(
      this.outputValue, // final Production Output (the live running total)
      this.satisfactionValue, // final Worker Satisfaction (0..1)
      this.marginValue, // final profit SHARE (0..1) — GRADES the Profit score
      this.coins, // the final Coins balance — the money the Profit row DISPLAYS
      factory,
      recapLines,
    );

    board.position.set(0, C.report.y, C.report.z); // float it in front of the player
    this.reportBoard = board;
    this.reportFadeElapsed = 0;
    this.world.createTransformEntity(board).addComponent(Dynamic);

    // A gold "Play Again" button just below the report. Clicking it resets the
    // game in place (see resetGame) so a student can try a DIFFERENT business in
    // the same class session — it lands back on the business picker. Same card
    // style as the tour's "Start the tour" button.
    const R = C.restart;
    const againButton = makeTextPlane({
      text: R.label,
      icon: R.icon,
      width: R.width,
      height: R.height,
      background: UI.gold,
      textColor: UI.white,
      border: UI.goldText,
    });
    againButton.position.set(0, R.y, R.z);
    this.world
      .createTransformEntity(againButton)
      .addComponent(RayInteractable)
      .addComponent(RestartButton)
      .addComponent(Dynamic);

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
    if (prefersReducedMotion()) return; // no confetti burst for reduced-motion viewers
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
    this.confettiEntity = this.world
      .createTransformEntity(confetti)
      .addComponent(Dynamic);
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
