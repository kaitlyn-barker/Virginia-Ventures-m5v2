// =============================================================================
// environment.ts — the composition root for "The Factory Floor" (Module 5).
//
// buildEnvironment() assembles the static room and registers every game system.
// The rest of the game now lives in focused modules (config, components, room,
// stations, systems, production, foreman, tutorial); this file wires them
// together and re-exports the handful of things index.ts needs. Split out of a
// single 6,277-line file with no behavior change. See README.md for the map.
// =============================================================================

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EnvironmentType,
  Fog,
  Group,
  HemisphereLight,
  LocomotionEnvironment,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  World,
} from "@iwsdk/core";
import {
  createFactoryHud,
} from "./hud.js";
import {
  FactoryMachine,
} from "./components.js";
import {
  CONSTANTS,
  ROOM,
  ROOM_CENTER_Z,
} from "./config.js";
import {
  ForemanSystem,
} from "./foreman.js";
import {
  ProductionSystem,
} from "./production.js";
import {
  buildProductionLine,
  buildWallBarrier,
  enableShadows,
  makeBrickTexture,
  makeRadialGlowTexture,
  makeShaftTexture,
  makeSignFrame,
  makeWoodTexture,
} from "./room.js";
import {
  buildWelcome,
} from "./stations.js";
import {
  Dust,
  DustSystem,
  PlayerBoundsSystem,
  SetupSystem,
  makeDust,
} from "./systems.js";
import {
  TutorialSystem,
} from "./tutorial.js";

// Re-exported for index.ts (the floor + world setup need these).
export { ROOM, ROOM_CENTER_Z, FLOOR_MARGIN } from "./config.js";
export { makePlankTexture } from "./room.js";

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

