// =============================================================================
// reset.ts — "Play Again" without reloading the page.
//
// resetGame() puts the whole game back to its opening state IN PLACE — instant,
// no page refresh — so a class can run a different business in the same session.
// It coordinates the three stateful systems (each re-seeds its own fields and,
// via ProductionSystem, disposes every runtime-built entity tagged Dynamic),
// winds the shared phase flags back to the start, resets the corner HUD, and
// re-shows the business picker.
//
// Why a Dynamic-tag sweep instead of hand-listing entities: it is impossible to
// miss one. Anything created once a business is picked carries the Dynamic tag,
// so a single query clears them all — desk, cards, both boards + the note, the
// foreman + his prompt, the report + Play Again button, confetti, hint, and any
// welcome / goal / tour pieces still on screen (a teacher can hit "R" any time).
// The permanent scenery (room, floor, production line, dust) is untagged and
// survives. Called from the report's Play Again button (ProductionSystem) and the
// teacher "R" key (controls.ts).
// =============================================================================

import { World } from "@iwsdk/core";
import { ProductionSystem } from "./production.js";
import { ForemanSystem } from "./foreman.js";
import { TutorialSystem } from "./tutorial.js";
import { buildWelcome } from "./stations.js";
import { CONSTANTS } from "./config.js";
import { updateFactoryHud, setFactoryHudStatus } from "./hud.js";

export function resetGame(world: World): void {
  // 1. Each system tears down its runtime entities and re-seeds its own state.
  //    ProductionSystem.reset() runs the Dynamic-tag sweep that disposes EVERY
  //    runtime entity, so it must run before we build the fresh welcome (step 4).
  (world.getSystem(ProductionSystem) as ProductionSystem | undefined)?.reset();
  (world.getSystem(ForemanSystem) as ForemanSystem | undefined)?.reset();
  (world.getSystem(TutorialSystem) as TutorialSystem | undefined)?.reset();

  // 2. Wind the shared phase flags back to the start of the day.
  const g = world.globals as Record<string, unknown>;
  g.activeFactory = null;
  g.demandRising = false;
  g.competitionOpen = false;
  g.dayOver = false;
  g.runsCompleted = 0;
  g.tourDone = false;

  // 3. Reset the corner HUD to its opening "Getting Ready" state. (The in-world
  //    board that normally drives the HUD was just disposed, so without this the
  //    corner card would keep showing the finished game's numbers.)
  const seed = CONSTANTS.readouts.map((r) => ({
    label: r.label,
    value: r.value,
    fill: r.fill,
  }));
  updateFactoryHud(seed);
  setFactoryHudStatus("Getting Ready", "ready");

  // 4. Re-show the business picker on the now-clear floor.
  buildWelcome(world);
}
