// =============================================================================
// foreman.ts — the foreman figure and the system that delivers his between-phase news.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  World,
  createSystem,
} from "@iwsdk/core";
import {
  setFactoryHudStatus,
} from "./hud.js";
import {
  Sfx,
} from "./sfx.js";
import {
  UI,
} from "./ui-style.js";
import {
  Dynamic,
  Foreman,
  ForemanPrompt,
} from "./components.js";
import {
  CLOSING_BEAT,
  COMPETITION_BEAT,
  CONSTANTS,
  FOREMAN_NEWS,
  PACING_NUDGE,
  fillNews,
} from "./config.js";
import { runsBeforeClosing, runsBeforeCompetition } from "./dev.js";
import type {
  FactoryType,
} from "./config.js";
import {
  applyShadows,
  makeTargetRingTexture,
} from "./room.js";
import {
  makeNotePlane,
  makeTextPlane,
} from "./stations.js";

// =============================================================================
// makeForeman
// Builds the foreman figure — the same simple build as the workers (boxes +
// cylinders, origin at the feet), but in a brown coat with a brimmed hat and a
// pale clipboard, so he clearly reads as the boss rather than a worker. He is
// stationary; the ForemanSystem only ever rewrites the speech panel above him.
// =============================================================================
export function makeForeman(): Group {
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
export function placeForeman(world: World): void {
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
  foremanEntity.addComponent(Foreman).addComponent(Dynamic);
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
    .addComponent(ForemanPrompt)
    .addComponent(Dynamic);

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
  promptCards: { required: [ForemanPrompt] }, // his "Next" card (to pulse when a new note waits)
}) {
  private newsIndex = -1; // which beat is showing (-1 = none yet)
  private revealed = false; // has the panel been shown at least once?
  private fadeElapsed = 0; // seconds into the panel's first fade-in
  private noticeActive = false; // is a NEW note waiting to be read (prompt pulsing)?
  private noticeClock = 0; // animation clock for the notice pulse

  init(): void {
    // Clicking his "Next" card is now the ONLY way to advance the news, so the
    // student reads every beat deliberately — one click per note.
    this.queries.prompts.subscribe("qualify", () => this.advanceNews());
  }

  // Play Again: re-seed the news state. The foreman figure + his panel are entities
  // disposed by the Dynamic sweep (see ProductionSystem.reset), so there is nothing
  // to tear down here — just wind the beats back to the beginning.
  reset(): void {
    this.newsIndex = -1;
    this.revealed = false;
    this.fadeElapsed = 0;
    this.noticeActive = false;
    this.noticeClock = 0;
  }

  update(delta: number): void {
    const foreman = this.firstForeman();
    if (!foreman) return; // not placed yet (still in the Setup phase)

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

    // The "new message" notice: gently pulse his "Next" prompt (and chime once)
    // whenever a fresh note is waiting, so the student knows to go read it — he
    // stands off to the side and is easy to forget. It goes quiet once every
    // available note has been read.
    this.updateNotice(delta);
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
    // (The gate values are shrunk by ?fast=1 for quick QA — see dev.ts.)
    if (
      this.newsIndex < COMPETITION_BEAT &&
      nextIndex >= COMPETITION_BEAT &&
      runs < runsBeforeCompetition()
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
      runs < runsBeforeClosing()
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

  // Is there genuinely a NEW beat the student could advance to right now? False if
  // he is already on his last beat, if the tour has not finished, or if the next
  // beat is a phase gate still waiting on more production runs (mirrors the gates
  // in advanceNews, so the notice only lights when a click would truly reveal news).
  private hasNewMessage(): boolean {
    if (!this.globals.tourDone || this.globals.dayOver) return false;
    const nextIndex = Math.min(this.newsIndex + 1, FOREMAN_NEWS.length - 1);
    if (nextIndex === this.newsIndex) return false; // already at the last beat
    const runs = (this.globals.runsCompleted as number) ?? 0;
    if (
      this.newsIndex < COMPETITION_BEAT &&
      nextIndex >= COMPETITION_BEAT &&
      runs < runsBeforeCompetition()
    ) {
      return false; // the competitor is gated until the student has scaled up
    }
    if (
      this.newsIndex < CLOSING_BEAT &&
      nextIndex >= CLOSING_BEAT &&
      runs < runsBeforeClosing()
    ) {
      return false; // the closing whistle is gated until Phase 3 is worked through
    }
    return true;
  }

  // Drive the "new note waiting" notice on his prompt: chime once when a fresh note
  // becomes available, breathe the prompt while it waits, and swap its label so the
  // call to action is unmistakable. Reset to a calm, still prompt when nothing's new.
  private updateNotice(delta: number): void {
    const available = this.hasNewMessage();
    if (available && !this.noticeActive) {
      this.noticeActive = true;
      this.noticeClock = 0;
      Sfx.bell(); // "ding — the foreman has news"
      this.setPromptLabel(true);
    } else if (!available && this.noticeActive) {
      this.noticeActive = false;
      this.setPromptLabel(false);
    }
    if (this.noticeActive) this.noticeClock += delta;

    const C = CONSTANTS.foreman;
    for (const prompt of this.queries.promptCards.entities) {
      const obj = prompt.object3D;
      if (!obj) continue;
      obj.scale.setScalar(
        this.noticeActive && obj.visible
          ? 1 + C.noticePulseDepth * Math.sin(this.noticeClock * C.noticePulseRate)
          : 1,
      );
    }
  }

  // Swap the prompt's words: a bright "New note ▸" when one is ready, a calm
  // "Foreman" when he has nothing new. (The 🗣️ icon set when the prompt was built
  // rides along on every relabel.)
  private setPromptLabel(active: boolean): void {
    for (const prompt of this.queries.promptCards.entities) {
      const setText = prompt.object3D?.userData.setText as
        | ((t: string) => void)
        | undefined;
      setText?.(active ? "New note ▸" : "Foreman");
    }
  }

  // The one foreman entity (there is only ever one), or null before it is placed.
  private firstForeman(): ReturnType<World["createTransformEntity"]> | null {
    for (const foreman of this.queries.foremen.entities) return foreman;
    return null;
  }
}

