// =============================================================================
// components.ts — the ECS tag components the systems query on.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  Types,
  createComponent,
} from "@iwsdk/core";

// Marks every entity BUILT AT RUNTIME once a business is picked (the control desk
// + cards, both boards + the note, the foreman + his prompt, the report board and
// its Play Again button, the confetti, the hint banner, and the welcome / goal /
// tour pieces). "Play Again" resets the game in place by disposing everything
// tagged Dynamic in one sweep — so nothing dynamic gets missed — then re-showing
// the business picker. The persistent scenery (room, floor, production line, dust)
// is NOT tagged, so it survives a reset. See resetGame() in reset.ts.
export const Dynamic = createComponent("Dynamic", {});

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

// Marks the order board (beside the readout board). The ProductionSystem finds it
// through this tag to post buyer orders, advance their progress each run, and
// stamp them FILLED or LOST.
export const OrderBoard = createComponent("OrderBoard", {});

// The two answer buttons on a one-tap prediction prompt. `value` is which option
// was tapped (0 or 1). The ProductionSystem watches for a clicked PredictionButton
// to record the guess.
export const PredictionButton = createComponent("PredictionButton", {
  value: { type: Types.Int8, default: 0 },
});
// Tags every piece of the CURRENT prediction prompt (its question panel + the two
// buttons), so the whole thing can be swept away in one go once an answer is
// tapped.
export const PredictionPart = createComponent("PredictionPart", {});

// The two choice cards on the worker-safety event. `value` is which was chosen
// (0 = add safety guards, 1 = push on). The ProductionSystem watches for a clicked
// SafetyButton to resolve the event.
export const SafetyButton = createComponent("SafetyButton", {
  value: { type: Types.Int8, default: 0 },
});
// Tags every piece of the worker-safety event (its panel + the two choice cards),
// so the whole thing can be swept away once a choice is made.
export const SafetyPart = createComponent("SafetyPart", {});

// Marks the small "what to do next" hint banner above the desk. The
// ProductionSystem finds it through this tag and shows the first-time hints on it,
// one short line at a time, then fades them away.
export const HintSign = createComponent("HintSign", {});

// Marks the "Play Again" button that appears on the End of Day report. Clicking
// it resets the game in place (see resetGame in reset.ts) so a student can try a
// different business in the same class session. The ProductionSystem builds the
// button when it shows the report and watches for the click.
export const RestartButton = createComponent("RestartButton", {});

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
