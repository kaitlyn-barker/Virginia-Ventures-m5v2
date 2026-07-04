// =============================================================================
// systems.ts — the small systems: dust, player-bounds safety net, and the pick-a-business setup.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  BufferGeometry,
  Float32BufferAttribute,
  LocomotionSystem,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  Pressed,
  RayInteractable,
  Vector3,
  createComponent,
  createSystem,
} from "@iwsdk/core";
import {
  setFactoryHudStatus,
} from "./hud.js";
import {
  Sfx,
} from "./sfx.js";
import {
  FactoryChoice,
  FactoryMachine,
  WelcomePart,
} from "./components.js";
import {
  CONSTANTS,
  FACTORY_TYPES,
  ROOM,
} from "./config.js";
import type {
  FactoryType,
} from "./config.js";
import { prefersReducedMotion } from "./ui-style.js";
import {
  buildGoalCard,
  titleCase,
} from "./stations.js";

// =============================================================================
// makeDust
// Creates the cloud of floating motes as a single Points object (one efficient
// draw call for hundreds of specks). We also stash a per-mote "rise speed" on
// the object so the DustSystem can drift each one at its own gentle pace.
// =============================================================================
export function makeDust(W: number, L: number, H: number): Points {
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
    if (prefersReducedMotion()) return; // hold the dust still for reduced-motion viewers
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

