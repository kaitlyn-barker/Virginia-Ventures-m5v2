// =============================================================================
// room.ts — procedural textures + the static scenery/mesh builders (walls, line, workers).
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  World,
} from "@iwsdk/core";
import {
  UI,
} from "./ui-style.js";
import {
  CONSTANTS,
  ROOM,
  WALL_INSET,
} from "./config.js";
import {
  makeTextPlane,
} from "./stations.js";

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
export function repeatingTexture(
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
export let brickCanvas: HTMLCanvasElement | null = null;
export function brickArt(): HTMLCanvasElement {
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
export function makeBrickTexture(repeatX: number, repeatY: number): CanvasTexture {
  return repeatingTexture(brickArt(), repeatX, repeatY);
}

// --- WOOD PLANKS (floor): long boards with light grain and seams. ------------
// Boards run down the tile's V axis so they read as long planks on the floor.
// Exported because the walkable floor lives in index.ts. Tints to warm brown.
export let plankCanvas: HTMLCanvasElement | null = null;
export function plankArt(): HTMLCanvasElement {
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
export let metalCanvas: HTMLCanvasElement | null = null;
export function metalArt(): HTMLCanvasElement {
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
export function makeMetalTexture(repeatX: number, repeatY: number): CanvasTexture {
  return repeatingTexture(metalArt(), repeatX, repeatY);
}

// --- ROUGH WOOD (timber beams + crates): coarser, knottier grain. ------------
// A rougher cousin of the floor planks for the heavy timber: bold vertical grain
// streaks and a couple of knots. Grayscale, tints to whatever wood color it's on.
export let woodCanvas: HTMLCanvasElement | null = null;
export function woodArt(): HTMLCanvasElement {
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
export function makeWoodTexture(repeatX: number, repeatY: number): CanvasTexture {
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
export function applyShadows(root: Object3D): void {
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

export function enableShadows(world: World): void {
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
export function makeRadialGlowTexture(): CanvasTexture {
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
export function makeTargetRingTexture(): CanvasTexture {
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
export function makeShaftTexture(): CanvasTexture {
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
export function makeSignFrame(material: MeshLambertMaterial): Group {
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
export function buildWallBarrier(): Group {
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
export function makeBox(
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
export function buildProductionLine(): Group {
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
export function makeWorker(): Group {
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
export function workerStationX(index: number): number {
  const C = CONSTANTS;
  if (C.maxWorkers <= 1) return (C.workerStationMinX + C.workerStationMaxX) / 2;
  const t = index / (C.maxWorkers - 1); // 0 at the first station, 1 at the last
  return C.workerStationMinX + t * (C.workerStationMaxX - C.workerStationMinX);
}

