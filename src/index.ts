// =============================================================================
// index.ts — the entry point for "The Factory Floor: Building Virginia's
// Industry" (Module 5).
//
// This file does the WORLD SETUP only:
//   1. Create the world (XR + locomotion + grabbing + physics).
//   2. Place the player at standing height near one end of the room.
//   3. Lay down the walkable floor.
//   4. Build the scenery (handled by buildEnvironment in environment.ts).
//   5. Wire up browser mouse-look (right-drag to look around).
//
// At this step there is no game logic, no UI, and no machines — just the empty,
// atmospheric factory you walk into.
// =============================================================================

import {
  World,
  SessionMode,
  VisibilityState,
  Mesh,
  PlaneGeometry,
  MeshLambertMaterial,
  LocomotionEnvironment,
  LocomotionSystem,
  TurningMethod,
  EnvironmentType,
} from "@iwsdk/core";

import {
  buildEnvironment,
  makePlankTexture,
  ROOM,
  ROOM_CENTER_Z,
  FLOOR_MARGIN,
} from "./environment.js";
import { setupBrowserControls } from "./controls.js";
import { installResilience } from "./resilience.js";

// -----------------------------------------------------------------------------
// CONSTANTS — the few tunable numbers that belong to world setup.
// -----------------------------------------------------------------------------
const CONSTANTS = {
  eyeHeight: 1.6, // standing eye height, in meters (where the camera sits)
  // (Look/move feel for the flat screen lives with the code that uses it, in
  // controls.ts.)

  // --- VR comfort (anti motion-sickness) --------------------------------------
  // Smooth gliding is the #1 motion-sickness trigger in VR, especially for kids.
  // Teleport ("hop") is the comfortable way to get around — it is built into the
  // engine (pull the RIGHT thumbstick back, aim the arc, let go) and the tutorial
  // teaches it. These settings make the remaining smooth movement gentle:
  comfort: {
    vignette: 0.8, // comfort tunnel strength while gliding (0 = off, 1 = max) — narrows the view edges so the brain reads less "the room is moving"
    walkSpeedVR: 2.0, // in-headset glide speed (m/s) — a calm walking pace (the engine default, 5, reads as sprinting and churns stomachs)
    walkSpeedBrowser: 3.5, // browser WASD speed (m/s) — a flat screen can't cause motion sickness, so desktop keeps a brisker pace
  },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  // Offer a VR headset experience, and keep offering it ("always").
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
  },
  features: {
    // Locomotion lets the player walk. `useWorker` runs the movement math off
    // the main thread for smoothness. `browserControls` turns on WASD + arrow
    // keys for desktop. (The player spawns at the world origin; environment.ts
    // positions the room so the origin is near one end — see ROOM_CENTER_Z.)
    //
    // The comfort settings here are for young players in a headset: a strong
    // comfort vignette while gliding, crisp 45° snap turns (never smooth
    // spinning), and NO jumping — a sudden camera hop is a classic sickness
    // trigger, and the game never needs it. Teleport ("hop travel") stays on
    // and is the recommended way to move.
    locomotion: {
      useWorker: true,
      browserControls: true,
      comfortAssistLevel: CONSTANTS.comfort.vignette,
      turningMethod: TurningMethod.SnapTurn,
      enableJumping: false,
    },
    grabbing: true, // allow picking things up later
    physics: true, // allow physical objects later
  },
  render: {
    // We light the room ourselves in environment.ts, so turn off the default
    // gradient sky/lighting — otherwise it would fight our warm interior look.
    defaultLighting: false,
    // The camera is the player's head. Put it at standing eye height and aim it
    // straight down the length of the room (rotation [0,0,0] looks toward -Z).
    camera: {
      position: [0, CONSTANTS.eyeHeight, 0],
      rotation: [0, 0, 0],
    },
  },
}).then((world) => {
  // ---------------------------------------------------------------------------
  // COMFORT: gentle glide speed. The engine's default glide (5 m/s) feels like
  // sprinting in a headset and is the main cause of motion sickness. Sliding
  // speed can't be set through World.create, so we set it on the running system:
  // a calm walking pace in the headset, a brisker one for browser WASD (a flat
  // screen can't cause motion sickness). The visibilityState signal fires
  // immediately with the current mode and again on every enter/exit of XR.
  // ---------------------------------------------------------------------------
  const locomotion = world.getSystem(LocomotionSystem);
  if (locomotion) {
    world.visibilityState.subscribe((state) => {
      const inHeadset = state !== VisibilityState.NonImmersive;
      locomotion.config.slidingSpeed.value = inHeadset
        ? CONSTANTS.comfort.walkSpeedVR
        : CONSTANTS.comfort.walkSpeedBrowser;
    });
  }

  // ---------------------------------------------------------------------------
  // FLOOR — a flat plank-wood plane the player can walk on.
  // Adding the LocomotionEnvironment component (type STATIC) tells the
  // locomotion system "this is solid ground," so the player walks on it instead
  // of falling through the world.
  //
  // We make the floor a little BIGGER than the room (by FLOOR_MARGIN on every
  // side) so there is always solid ground under the player everywhere they can
  // walk, even right up against a wall. The extra floor sits behind the walls
  // where it cannot be seen, so the room looks exactly the same inside.
  // ---------------------------------------------------------------------------
  const floorWidth = ROOM.width + FLOOR_MARGIN * 2;
  const floorLength = ROOM.length + FLOOR_MARGIN * 2;
  // Long plank boards run down the length of the room. The texture is gray, so
  // the floor color (a warm worn brown) still tints it; the repeat counts are
  // chosen so each board looks a believable width and is not stretched. (The
  // boards run along the room's length — the Z axis — once the plane is laid flat.)
  const floor = new Mesh(
    new PlaneGeometry(floorWidth, floorLength),
    new MeshLambertMaterial({
      color: ROOM.floorColor,
      map: makePlankTexture(Math.round(floorWidth / 1.8), Math.round(floorLength / 3)),
    }),
  );
  floor.rotation.x = -Math.PI / 2; // lay the plane down flat
  floor.position.z = ROOM_CENTER_Z; // line the floor up with the (shifted) room
  floor.receiveShadow = true; // the floor catches the soft shadows of everything in the room
  world
    .createTransformEntity(floor)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // ---------------------------------------------------------------------------
  // SCENERY — walls, roof, windows, lights, fog, dust, and accents.
  // ---------------------------------------------------------------------------
  buildEnvironment(world);

  // ---------------------------------------------------------------------------
  // FLAT-SCREEN CONTROLS — look + move for a mouse/keyboard AND a touchscreen,
  // plus the one-time controls hint and the teacher "R" restart key. All of it
  // lives in controls.ts and only runs in the browser view (a headset uses head
  // tracking + thumbsticks). The official guidance is "rotate world.camera
  // yourself" for first-person browser views, which is what it does.
  // ---------------------------------------------------------------------------
  setupBrowserControls(world);

  // ---------------------------------------------------------------------------
  // RESILIENCE — the safety nets for a school device having a bad moment. Wired
  // up LAST, so the system error boundary can wrap every system that's now been
  // registered (in buildEnvironment). See resilience.ts:
  //   • one crashing system is skipped for a frame instead of freezing the game
  //   • a lost 3D canvas shows a friendly "click to restart" card, not a freeze
  // ---------------------------------------------------------------------------
  installResilience(world);
});
