// =============================================================================
// tutorial.ts — the opening goal card + the foreman's guided tour.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Pressed,
  RayInteractable,
  World,
  createSystem,
} from "@iwsdk/core";
import {
  Sfx,
} from "./sfx.js";
import {
  UI,
} from "./ui-style.js";
import {
  ControlCard,
  Foreman,
  ForemanPrompt,
  ReadoutBoard,
  TourButton,
  TourPart,
} from "./components.js";
import {
  CONSTANTS,
  CONTROL,
  TOUR,
  TOUR_STEPS,
} from "./config.js";
import type {
  TourStep,
} from "./config.js";
import {
  placeForeman,
} from "./foreman.js";
import {
  makeTextPlane,
  placeControlStation,
  placeReadoutBoard,
} from "./stations.js";

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
