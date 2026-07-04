// =============================================================================
// stations.ts — the text/card/panel builders — control desk, readout board, welcome, goal, report.
//
// Extracted verbatim from the original environment.ts during the module split
// (no behavior change). See the module map in README.md.
// =============================================================================

import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RayInteractable,
  SRGBColorSpace,
  World,
} from "@iwsdk/core";
import {
  createDayMeter,
  updateFactoryHud,
} from "./hud.js";
import { runsBeforeClosing } from "./dev.js";
import {
  METER_STYLE,
  UI,
  meterIcon,
} from "./ui-style.js";
import {
  ControlCard,
  DayPanel,
  Dynamic,
  FactoryChoice,
  HintSign,
  OrderBoard,
  PredictionButton,
  PredictionPart,
  ReadoutBoard,
  SafetyButton,
  SafetyPart,
  TourButton,
  TourPart,
  WelcomePart,
} from "./components.js";
import {
  CONSTANTS,
  CONTROL,
  FACTORY_TYPES,
  REPORT_CLOSING,
  REPORT_SCORES,
  REPORT_SUMMARY,
  REPORT_WRAP,
  TOUR,
  TOUR_GOAL,
  fillNews,
} from "./config.js";
import type {
  FactoryType,
  Prediction,
  ReportBand,
  ReportScore,
} from "./config.js";
import {
  applyShadows,
} from "./room.js";

// =============================================================================
// makeTextPlane
// A reusable label in the polished cream-card style: a rounded card (soft shadow
// + optional border) with crisp, auto-fit text drawn on a CanvasTexture. Pass
// "\n" to split a label over two lines, and an optional `icon` emoji that leads
// the first line (like the dashboard rows). Used for the production-line
// name-tags and the foreman's "Next" prompt.
//
// The font starts LARGE and shrinks only as much as needed so the longest line
// still fits inside the padding — labels are always as big as possible without
// spilling over the edge.
// =============================================================================
export function makeTextPlane(options: {
  text: string; // the label ("\n" starts a new line)
  width: number; // plane width in meters
  height: number; // plane height in meters
  background: number | string; // card fill
  textColor: number | string; // text color
  icon?: string; // optional emoji leading the first line
  border?: number | string; // optional border color
  maxFontSize?: number; // biggest font to try, in canvas pixels
  padding?: number; // empty margin as a fraction of the card (0.16 = 16%)
  fontWeight?: string; // "bold" by default
}): Mesh {
  const {
    text,
    width,
    height,
    background,
    textColor,
    icon,
    border,
    maxFontSize = 220,
    padding = 0.16,
    fontWeight = "bold",
  } = options;

  // A high-resolution canvas (matching the plane's shape) keeps the text sharp
  // even when the player walks right up to the card.
  const pxPerMeter = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;

  const style = { background, textColor, icon, border, maxFontSize, padding, fontWeight };
  paintAutoFitText(ctx, canvas.width, canvas.height, text, style);

  const mesh = makeCanvasPlane(canvas, width, height, true);

  // Let callers rewrite this label later (the production line's name-tags use
  // this when the student picks a business). We repaint the SAME canvas and
  // flag the texture as changed — the texture is re-used, so nothing leaks.
  const texture = (mesh.material as MeshBasicMaterial).map!;
  mesh.userData.setText = (newText: string): void => {
    paintAutoFitText(ctx, canvas.width, canvas.height, newText, style);
    texture.needsUpdate = true;
  };

  return mesh;
}

// =============================================================================
// paintAutoFitText
// The shared drawing core behind makeTextPlane: it draws a rounded cream card,
// then finds the LARGEST font that still fits inside the padding and draws the
// lines centered (with the optional icon leading the first line). Kept separate
// so a label can be REPAINTED later with new text (see makeTextPlane.setText).
// =============================================================================
export function paintAutoFitText(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string,
  style: {
    background: number | string;
    textColor: number | string;
    icon?: string;
    border?: number | string;
    maxFontSize: number;
    padding: number;
    fontWeight: string;
  },
): void {
  const { background, textColor, icon, border, maxFontSize, padding, fontWeight } = style;

  // The rounded card (a small margin leaves room for the soft drop shadow).
  ctx.clearRect(0, 0, canvasW, canvasH);
  const M = Math.round(canvasH * 0.07);
  drawCard(ctx, M, M, canvasW - M * 2, canvasH - M * 2, {
    fill: new Color(background).getStyle(),
    stroke: border !== undefined ? new Color(border).getStyle() : undefined,
    lineWidth: border !== undefined ? Math.max(3, Math.round(canvasH * 0.03)) : 0,
    radius: Math.round(canvasH * 0.2),
    shadow: true,
  });

  // The icon (if any) leads the first line so it scales with the text.
  const lines = text.split("\n");
  if (icon) lines[0] = lines[0] ? `${icon} ${lines[0]}` : icon;

  // Find the largest font that fits both the padded width and the padded height.
  const cardW = canvasW - M * 2;
  const cardH = canvasH - M * 2;
  const maxTextWidth = cardW * (1 - padding * 2);
  const maxTextHeight = cardH * (1 - padding * 2);
  const fitsAt = (size: number): boolean => {
    ctx.font = `${fontWeight} ${size}px sans-serif`;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    const blockHeight = lines.length * size * 1.2; // 1.2 = comfy line spacing
    return widest <= maxTextWidth && blockHeight <= maxTextHeight;
  };
  let fontSize = maxFontSize;
  while (fontSize > 12 && !fitsAt(fontSize)) {
    fontSize -= 4;
  }

  // Draw the text: bold, centered, stacked around the middle of the card.
  ctx.fillStyle = new Color(textColor).getStyle();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
  const lineHeight = fontSize * 1.2;
  const blockTop = canvasH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvasW / 2, blockTop + i * lineHeight);
  });
}

// =============================================================================
// makeCanvasPlane
// Wraps an already-drawn canvas onto a flat plane and hands back the mesh.
// Shared by makeTextPlane and the readout board so the texture/material setup
// lives in ONE place.
//
// We use an UNLIT material (MeshBasicMaterial) on purpose: these are
// informational surfaces (controls and scores), so we want them crisp and
// readable no matter how dim the room is. `fog: false` keeps the far readout
// board from fading into the haze.
// =============================================================================
export function makeCanvasPlane(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  transparent = false, // true when the canvas has see-through corners (rounded cards)
): Mesh {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; // so the colors read exactly as authored
  texture.anisotropy = 8; // stay sharp when viewed at an angle
  // UI canvases aren't power-of-two; skip mipmaps (crisp head-on text anyway and
  // it avoids the WebGL mipmap-generation warnings on these non-PoT textures).
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;

  const material = new MeshBasicMaterial({
    map: texture,
    fog: false, // never let the haze eat the text
    toneMapped: false, // keep the exact authored colors
    transparent, // let the rounded corners (and soft shadow) show the scene behind
    // Discard the fully-transparent corner pixels so a rounded card still writes
    // depth cleanly (no dark fringe, no sorting surprises with the dust/glows).
    alphaTest: transparent ? 0.02 : 0,
  });

  return new Mesh(new PlaneGeometry(width, height), material);
}

// =============================================================================
// Card-drawing helpers (the polished "Market Harvest" look)
// -----------------------------------------------------------------------------
// Small shared canvas helpers so the welcome panel, choice cards, and readout
// board all draw the SAME rounded cream cards with a soft drop shadow and crisp
// borders. They take a 2D context and plain pixel coordinates.
// =============================================================================

// Trace a rounded-rectangle path (does not fill/stroke — the caller does).
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Draw one rounded card: an optional soft drop shadow, a fill, and a border.
// `shadow` lifts the card off whatever is behind it (we draw onto a transparent
// canvas so the shadow shows through to the scene).
export function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    radius?: number;
    shadow?: boolean;
  } = {},
): void {
  const { fill = UI.cream, stroke, lineWidth = 0, radius = 28, shadow = false } = opts;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = UI.shadow;
    ctx.shadowBlur = radius * 1.4;
    ctx.shadowOffsetY = radius * 0.35;
  }
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  if (stroke && lineWidth > 0) {
    roundRectPath(ctx, x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth, radius);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Shrink-to-fit a single line of text to a maximum width, returning the px font
// size that fits (so titles never spill off their card).
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight = "bold",
  minSize = 12,
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px sans-serif`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px sans-serif`;
  }
  return size;
}

// Word-wrap `text` to `maxWidth` (in the CURRENT ctx.font) and draw it left-
// aligned from (x, y) downward; returns the y just past the last line.
export function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = "left",
): number {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = align;
  const anchorX = align === "center" ? x + maxWidth / 2 : x;
  let line = "";
  let cursorY = y;
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, anchorX, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += lineHeight;
  }
  ctx.textAlign = prevAlign;
  return cursorY;
}

// =============================================================================
// speedCardText
// The exact words shown on the "Machine Speed" card: the control's name on top,
// and the current setting below in ‹ chevrons › that hint "click to change."
// Both the builder (first draw) and the ProductionSystem (each click) use this,
// so the card always reads the same way.
// =============================================================================
export function speedCardText(label: string): string {
  // Show the plain-language tradeoff for the current pace right on the card, so
  // the speed/wear/crew choice is legible without having to discover it.
  const speed = CONSTANTS.speeds.find((s) => s.label === label);
  const blurb = speed?.blurb ? `\n${speed.blurb}` : "";
  return `Machine Speed\n‹ ${label} ›${blurb}`;
}

// =============================================================================
// hireCardText
// The words on the "Hire Worker" card: the action on top, and the current crew
// size out of the cap below. Once the crew is full it reads "Team Full" so the
// student can see there is no more room (the cap keeps the floor tidy). Both the
// builder and the ProductionSystem use this, so the card always reads the same.
// =============================================================================
export function hireCardText(count: number): string {
  const max = CONSTANTS.maxWorkers;
  const top = count >= max ? "Team Full" : "Hire Worker";
  return `${top}\n${count} / ${max}`;
}

// =============================================================================
// expandCardText
// The words on the one-time "Expand the Line" card, for each of its states:
// locked (until the foreman's news), ready to start, under construction (with a
// countdown of runs left), and finished. Both the builder and the ProductionSystem
// use this, so the card always reads the same way.
// =============================================================================
export function expandCardText(
  unlocked: boolean,
  state: "none" | "building" | "done",
  runsLeft: number,
): string {
  if (!unlocked) return "Expand Line\nSee foreman";
  if (state === "building") {
    return `Expanding…\n${runsLeft} run${runsLeft === 1 ? "" : "s"} left`;
  }
  if (state === "done") return "Line\nExpanded ✓";
  return "Expand the\nLine";
}

// =============================================================================
// repairCardText
// The words on the "Repair" card for each state: nothing wrong (the normal,
// reassuring state), a machine that has broken down and needs fixing, and the
// short "repairing" moment after it is clicked. Both the builder and the
// ProductionSystem use this, so the card always reads the same way.
// =============================================================================
export function repairCardText(state: "ok" | "broken" | "repairing"): string {
  if (state === "broken") return "Repair\nMachine ⚠";
  if (state === "repairing") return "Repairing…\nplease wait";
  return "Machine\nOK ✓";
}

// =============================================================================
// buildControlStation
// Builds the foreman's desk as a Group, plus the six control cards as separate
// meshes (so the caller can make each one a clickable RayInteractable entity).
// Everything is built around the desk's own origin (X = left/right, Y = up,
// Z = depth), with the player standing on the +Z side looking toward -Z.
//
// The cards are returned in CONTROL order — [Machine Speed, Hire Worker, Order
// Materials, Repair, Expand the Line, Start Line] — so the caller can tag each
// with its matching action.
// =============================================================================
// =============================================================================
// makeControlCard
// One control-desk button in the polished cream-card style: a rounded cream card
// (soft shadow + navy border) with an emoji icon on the left and the 1–2 line
// label on the right. The "Start Line" GO button is `primary` — a solid gold
// card with white text, so the action to take stands out (like the welcome's
// gold "Choose" pill). Returns a mesh with `userData.setText` so the
// ProductionSystem can rewrite the label later (the icon + style are kept).
// =============================================================================
export function makeControlCard(opts: {
  text: string;
  icon: string;
  width: number;
  height: number;
  primary?: boolean;
  digit?: number; // the keyboard number (1–6) shown in the card's corner
}): Mesh {
  const { text, icon, width, height, primary = false, digit } = opts;
  const pxPerMeter = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const fill = primary ? UI.gold : UI.cream;
  const textColor = primary ? UI.white : UI.navy;
  const border = primary ? UI.goldText : UI.navy;
  const M = Math.round(H * 0.06); // margin for the shadow
  const radius = Math.round(H * 0.22);

  const paint = (label: string): void => {
    ctx.clearRect(0, 0, W, H);
    drawCard(ctx, M, M, W - M * 2, H - M * 2, {
      fill,
      stroke: border,
      lineWidth: Math.max(4, Math.round(H * 0.03)),
      radius,
      shadow: true,
    });

    const lines = label.split("\n");
    // Icon on the left, vertically centered.
    const iconSize = Math.round(H * 0.42);
    const iconCx = M + (W - M * 2) * 0.18;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${iconSize}px sans-serif`;
    ctx.fillText(icon, iconCx, H / 2);

    // Label on the right: shrink the font until the widest line + the stack fit.
    const textLeft = M + (W - M * 2) * 0.34;
    const textRight = W - M - Math.round(W * 0.05);
    const textW = textRight - textLeft;
    const textCx = (textLeft + textRight) / 2;
    let size = Math.round(H * 0.26);
    const fits = (s: number): boolean => {
      ctx.font = `bold ${s}px sans-serif`;
      let widest = 0;
      for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
      return widest <= textW && lines.length * s * 1.25 <= H - M * 2 - 16;
    };
    while (size > 14 && !fits(size)) size -= 2;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillStyle = textColor;
    const lineH = size * 1.25;
    const top = H / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, textCx, top + i * lineH));

    // A small numbered badge in the top-left corner — the keyboard key (1–6) that
    // also triggers this control, for students who struggle with a mouse/ray.
    if (digit) {
      const bR = Math.round(H * 0.15);
      const bx = M + bR + Math.round(W * 0.03);
      const by = M + bR + Math.round(H * 0.05);
      ctx.beginPath();
      ctx.arc(bx, by, bR, 0, Math.PI * 2);
      ctx.fillStyle = primary ? UI.white : UI.navy;
      ctx.fill();
      ctx.fillStyle = primary ? UI.gold : UI.cream;
      ctx.font = `bold ${Math.round(bR * 1.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(digit), bx, by);
    }
  };

  paint(text);

  const card = makeCanvasPlane(canvas, width, height, true);
  const texture = (card.material as MeshBasicMaterial).map!;
  card.userData.setText = (newText: string): void => {
    paint(newText);
    texture.needsUpdate = true;
  };
  return card;
}

export function buildControlStation(): { desk: Group; cards: Mesh[] } {
  const C = CONSTANTS;
  const desk = new Group();
  desk.name = "ControlStation";

  const wood = new MeshLambertMaterial({ color: C.deskWoodColor });

  // The sturdy cabinet body of the desk.
  const cabinet = new Mesh(
    new BoxGeometry(C.deskWidth, C.deskHeight, C.deskDepth),
    wood,
  );
  cabinet.position.set(0, C.deskHeight / 2, 0);
  desk.add(cabinet);

  // A slightly overhanging top slab, tipped up toward the player like a console.
  const slab = new Mesh(
    new BoxGeometry(C.deskWidth + 0.1, 0.06, C.deskDepth + 0.08),
    wood,
  );
  slab.position.set(0, C.deskHeight + 0.02, 0);
  slab.rotation.x = C.consoleTilt;
  desk.add(slab);

  // The six control cards, evenly spaced across the console and lying flat on the
  // angled top so they face up toward the player. Each is a cream rounded card
  // (the same look as the welcome/dashboard) with an emoji icon and its label.
  // The "Start Line" GO button is the gold `primary` card so it clearly stands
  // apart. Each entry is { label, icon } in CONTROL order (so index === action).
  const cardSpecs = [
    { label: speedCardText(C.speeds[C.defaultSpeedIndex].label), icon: "⚙️" }, // CONTROL.speed
    { label: hireCardText(0), icon: "👷" }, // CONTROL.hire — "Hire Worker  0 / max"
    { label: "Order\nMaterials", icon: "📦" }, // CONTROL.order
    { label: repairCardText("ok"), icon: "🔧" }, // CONTROL.repair — "Machine OK" until a Phase 3 breakdown
    { label: expandCardText(false, "none", 0), icon: "🏗️" }, // CONTROL.expand — locked until the foreman's news
    { label: "Start\nLine", icon: "▶️" }, // CONTROL.start — the gold GO button
  ];
  const count = cardSpecs.length;
  const cards = cardSpecs.map((spec, i) => {
    const card = makeControlCard({
      text: spec.label,
      icon: spec.icon,
      width: C.cardWidth,
      height: C.cardHeight,
      primary: i === CONTROL.start,
      digit: i + 1, // cards are built in CONTROL order, so key N triggers card N-1
    });
    // Center the whole row on the desk: i spreads evenly around x = 0.
    card.position.set(
      (i - (count - 1) / 2) * C.cardSpacing,
      C.deskHeight + C.cardLift,
      0,
    );
    // Match the console's tilt: rotate the upright plane down onto the angled
    // top so its face points up-and-toward the player.
    card.rotation.x = C.consoleTilt - Math.PI / 2;
    return card;
  });

  return { desk, cards };
}

// =============================================================================
// buildReadoutBoard
// Draws the whole readout board onto one canvas — parchment background, then a
// row per meter (a navy label, a simple bar, and the number) — and wraps it on
// a single plane. One canvas keeps the layout simple and the text crisp.
//
// The board is now LIVE: it keeps its current numbers in `userData.meters` and a
// `userData.redraw()` that repaints them. The ProductionSystem edits a meter's
// value/fill (and a 0..1 `highlight` glow) and calls redraw() to animate the
// board smoothly when a score changes.
// =============================================================================
export function buildReadoutBoard(): Mesh {
  const C = CONSTANTS;

  // Canvas sized to match the board's shape, at a comfortable resolution.
  const pxPerMeter = 256;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.boardWidth * pxPerMeter);
  canvas.height = Math.round(C.boardHeight * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const Hc = canvas.height;

  // The board's LIVE state — one entry per meter, seeded from the starting
  // numbers in CONSTANTS. `highlight` is the gold-flash strength (1 = just
  // changed, fading to 0). The ProductionSystem edits these and calls redraw().
  const meters = C.readouts.map((r) => ({
    label: r.label,
    value: r.value,
    fill: r.fill,
    highlight: 0,
  }));

  // Card + layout geometry (all in canvas pixels). A margin leaves room for the
  // soft drop shadow; everything else sits inside the rounded cream card.
  const M = 26; // outer margin (shadow room)
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = Hc - M * 2;
  const P = 44; // inner padding
  const contentX = cardX + P;
  const contentW = cardW - P * 2;
  const titleH = 96; // height of the header area at the top
  const rowsTop = cardY + titleH + 16;
  const rowsBottom = cardY + cardH - P;
  const rowH = (rowsBottom - rowsTop) / meters.length;

  // Repaint the entire board from the live `meters` state.
  const paint = (): void => {
    ctx.clearRect(0, 0, W, Hc); // transparent — the rounded corners show the scene

    // The cream card: rounded, navy-bordered, lifted off the room with a shadow.
    drawCard(ctx, cardX, cardY, cardW, cardH, {
      fill: UI.cream,
      stroke: UI.navy,
      lineWidth: 6,
      radius: 34,
      shadow: true,
    });

    // Header: a navy title across the top + a thin divider beneath it.
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = UI.navy;
    ctx.font = `800 52px sans-serif`;
    ctx.fillText("📊 Factory Dashboard", contentX, cardY + titleH * 0.55);
    ctx.strokeStyle = UI.track;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(contentX, cardY + titleH + 4);
    ctx.lineTo(contentX + contentW, cardY + titleH + 4);
    ctx.stroke();

    meters.forEach((meter, i) => {
      const style = METER_STYLE[meter.label] ?? {
        icon: "•",
        bar: UI.gold,
        text: UI.goldText,
      };
      const rowTop = rowsTop + i * rowH;
      const labelY = rowTop + rowH * 0.34; // icon + label + number sit on the top line
      const barY = rowTop + rowH * 0.6; // the bar sits just below
      const barH = Math.min(26, rowH * 0.28);
      const barR = barH / 2;
      const numFont = Math.round(Math.min(40, rowH * 0.34));
      const glow = meter.highlight; // 0..1 gold flash for a just-changed score

      // Icon + label on the left.
      ctx.font = `700 ${numFont}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = UI.navy;
      // Worker Satisfaction's face swaps 🙂/😐/😟 by band (meterIcon).
      ctx.fillText(`${meterIcon(meter.label, meter.fill)} ${meter.label}`, contentX, labelY);

      // The number on the right, in the meter's own color. A fading gold pill
      // sits behind it the instant it changes, so the eye catches the update.
      ctx.font = `800 ${numFont}px sans-serif`;
      ctx.textAlign = "right";
      const numRight = contentX + contentW;
      if (glow > 0) {
        const textW = ctx.measureText(meter.value).width;
        const padX = numFont * 0.4;
        const boxH = numFont * 1.5;
        ctx.globalAlpha = glow;
        ctx.fillStyle = UI.gold;
        roundRectPath(
          ctx,
          numRight - textW - padX,
          labelY - boxH / 2,
          textW + padX * 2,
          boxH,
          boxH / 2,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = glow > 0.5 ? UI.navy : style.text;
      ctx.fillText(meter.value, numRight, labelY);

      // A rounded bar: a tan track, a colored fill showing the level. While
      // highlighted the fill brightens toward gold and fades back.
      roundRectPath(ctx, contentX, barY, contentW, barH, barR);
      ctx.fillStyle = UI.track;
      ctx.fill();
      const fillW = Math.max(barH, contentW * Math.max(0, Math.min(1, meter.fill)));
      roundRectPath(ctx, contentX, barY, fillW, barH, barR);
      ctx.fillStyle = style.bar;
      ctx.fill();
      if (glow > 0) {
        ctx.globalAlpha = glow * 0.7;
        ctx.fillStyle = UI.gold;
        roundRectPath(ctx, contentX, barY, fillW, barH, barR);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  };

  paint(); // first draw, using the starting numbers

  const board = makeCanvasPlane(canvas, C.boardWidth, C.boardHeight, true);
  board.name = "ReadoutBoard";

  // Hand the ProductionSystem a way to drive the board: it edits userData.meters
  // and calls redraw() to repaint. The texture is reused, so nothing leaks. Each
  // repaint also pushes the same numbers to the top-left HTML dashboard, so the
  // corner card and the in-world board always agree.
  const texture = (board.material as MeshBasicMaterial).map!;
  board.userData.meters = meters;
  board.userData.redraw = (): void => {
    paint();
    texture.needsUpdate = true;
    updateFactoryHud(meters);
  };

  return board;
}

// =============================================================================
// placeControlStation
// Builds the foreman's control station and drops it into the world, right in
// front of where the player spawns. Called by the SetupSystem once a business
// is picked (so the floor stays clear while the student is still choosing).
//
// A sturdy wooden desk sits in front of the player with its top angled up like a
// console. Four cards rest on it: "Machine Speed", "Hire Worker", "Order
// Materials", and the amber "Start Line". Each card is its OWN entity marked
// RayInteractable (so the InputSystem treats it as a pointer/ray target) and
// carries a ControlCard with the action it performs. The ProductionSystem
// watches for clicks and acts on Machine Speed, Hire Worker, and Start Line.
// =============================================================================
export function placeControlStation(world: World): void {
  const station = buildControlStation();
  station.desk.position.set(0, 0, CONSTANTS.deskZ); // just in front of the player
  applyShadows(station.desk); // the wooden desk grounds itself (the cards are self-lit, so they're skipped)
  const deskEntity = world.createTransformEntity(station.desk);
  deskEntity.addComponent(Dynamic);
  // The cards come back in CONTROL order, so the card's index IS its action.
  station.cards.forEach((card, action) => {
    world
      .createTransformEntity(card, deskEntity)
      .addComponent(RayInteractable)
      .addComponent(ControlCard, { action })
      .addComponent(Dynamic);
  });

  // A small hint banner floats just above the desk. It starts hidden; the
  // ProductionSystem shows the first-time hints on it one line at a time, then
  // fades them away. It reuses the fade-able parchment note panel for a look that
  // matches the rest of the boards.
  const C = CONSTANTS;
  const hint = makeNotePlane(C.hints.width, C.hints.height);
  hint.name = "HintBanner";
  hint.position.set(0, C.hints.y, C.deskZ + C.hints.forward);
  world.createTransformEntity(hint).addComponent(HintSign).addComponent(Dynamic);
}

// =============================================================================
// placeReadoutBoard
// Builds the readout board and hangs it high above the production line, where
// the player can glance UP from the desk and read it. It shows five meters —
// Production Output, Raw Materials, Worker Satisfaction, Price, and Profit
// Margin — and is display only (no interaction). Also called by the SetupSystem
// once a business is picked.
// =============================================================================
export function placeReadoutBoard(world: World): void {
  const C = CONSTANTS;
  const board = buildReadoutBoard();
  board.position.set(0, C.boardY, C.lineCenterZ);
  board.rotation.x = C.boardTilt; // tip it down a touch toward the player
  const boardEntity = world.createTransformEntity(board);
  boardEntity.addComponent(ReadoutBoard).addComponent(Dynamic); // so the ProductionSystem can find it

  // Seed the Price row with the chosen business's selling price (coins per
  // product) before the board is ever drawn, so it reads right from the start.
  // The Phase 3 competitor news is what later drops it. (Both this and the
  // ProductionSystem read the same activeFactory.basePrice, so they always agree.)
  const factory = world.globals.activeFactory as FactoryType | null;
  if (factory) {
    const meters = board.userData.meters as Array<{
      label: string;
      value: string;
      fill: number;
    }>;
    const priceRow = meters.find((m) => m.label === "Price");
    if (priceRow) {
      priceRow.value = `$${factory.basePrice}`;
      priceRow.fill = factory.basePrice / C.priceMax;
      (board.userData.redraw as () => void)();
    }
  }

  // The farm-vs-factory note sits just below the board, a touch toward the
  // player. It starts hidden + see-through; the ProductionSystem fills in the
  // number and fades it in the first time a run finishes. We keep a reference to
  // it on the board, so the system can reach it through the ReadoutBoard query.
  const note = makeNotePlane();
  note.position.set(0, C.noteY, C.lineCenterZ + C.noteForward);
  note.rotation.x = C.boardTilt; // share the board's gentle downward tilt
  world.createTransformEntity(note).addComponent(Dynamic);
  board.userData.note = note;
}

// =============================================================================
// OrderRow — one buyer order as the order board draws it. The ProductionSystem
// fills these in (via board.userData.orders) and calls redraw().
// =============================================================================
export type OrderRow = {
  buyer: string; // "The railroad"
  target: string; // "40 planks" (quantity + product)
  quantity: number; // how many are needed (drives the bar)
  progress: number; // how many have been made toward it
  runsLeft: number; // runs remaining before the deadline
  bonus: number; // coin reward, shown as "$60"
  status: "open" | "filled" | "lost"; // open, FILLED ✓, or taken by the rival
};

// =============================================================================
// buildOrderBoard
// A rounded cream card (like the readout board) that lists the current buyer
// orders. Each row shows who wants what, a progress bar toward the quantity, the
// coin reward, and either the runs left, a green "FILLED ✓" stamp, or a red
// "Rival took it". Holds `userData.orders` (an OrderRow[]) + `userData.redraw()`;
// the ProductionSystem edits the array and calls redraw() as runs complete.
// =============================================================================
export function buildOrderBoard(): Mesh {
  const O = CONSTANTS.orders;
  const pxPerMeter = 320;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(O.width * pxPerMeter);
  canvas.height = Math.round(O.height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const orders: OrderRow[] = [];

  const redraw = (): void => {
    ctx.clearRect(0, 0, W, H);

    // Card + navy border + soft shadow.
    const M = Math.round(H * 0.025);
    const cardX = M;
    const cardY = M;
    const cardW = W - M * 2;
    const cardH = H - M * 2;
    const radius = Math.round(H * 0.05);
    drawCard(ctx, cardX, cardY, cardW, cardH, {
      fill: UI.cream,
      stroke: UI.navy,
      lineWidth: 6,
      radius,
      shadow: true,
    });

    // Teal title band, clipped to the rounded top corners.
    const titleH = Math.round(cardH * 0.13);
    ctx.save();
    roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
    ctx.clip();
    ctx.fillStyle = new Color(CONSTANTS.tealColor).getStyle();
    ctx.fillRect(cardX, cardY, cardW, titleH);
    ctx.restore();
    ctx.fillStyle = UI.white;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(titleH * 0.52)}px sans-serif`;
    ctx.fillText("📋 Orders", W / 2, cardY + titleH / 2);

    const areaTop = cardY + titleH;
    const areaBottom = cardY + cardH - Math.round(cardH * 0.03);
    const pad = cardX + Math.round(cardW * 0.06);
    const right = cardX + cardW - Math.round(cardW * 0.06);
    const innerW = right - pad;

    // Empty state: no orders posted yet.
    if (orders.length === 0) {
      ctx.fillStyle = UI.navy;
      ctx.textAlign = "center";
      ctx.font = `${Math.round(cardH * 0.06)}px sans-serif`;
      ctx.fillText("Waiting for the first order…", W / 2, (areaTop + areaBottom) / 2);
      return;
    }

    const shown = orders.slice(0, O.maxVisible);
    // Size each row for a FULL board (maxVisible rows), NOT the current count —
    // otherwise a single order stretches to fill the whole card, its fonts scale
    // up with it, and the buyer line overruns the reward (e.g. "The gene$10s").
    // Then center the stack vertically so a short list still sits nicely.
    const blockH = (areaBottom - areaTop) / O.maxVisible;
    const stackTop =
      areaTop + ((areaBottom - areaTop) - blockH * shown.length) / 2;

    shown.forEach((order, i) => {
      const top = stackTop + i * blockH;
      const statusColor =
        order.status === "filled"
          ? new Color(O.filledColor).getStyle()
          : order.status === "lost"
            ? new Color(O.lostColor).getStyle()
            : new Color(O.openColor).getStyle();

      // Row 1: "The railroad wants" (left) + "$60" reward (right).
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = `bold ${Math.round(blockH * 0.2)}px sans-serif`;
      ctx.fillStyle = UI.navy;
      const line1Y = top + blockH * 0.2;
      ctx.fillText(`${order.buyer} wants`, pad, line1Y);
      ctx.textAlign = "right";
      ctx.fillStyle = UI.goldText;
      ctx.fillText(`$${order.bonus}`, right, line1Y);

      // Row 2: the target ("40 planks"), navy, a touch bigger.
      ctx.textAlign = "left";
      ctx.fillStyle = UI.navy;
      ctx.font = `bold ${Math.round(blockH * 0.24)}px sans-serif`;
      ctx.fillText(order.target, pad, top + blockH * 0.42);

      // Progress bar (track + fill), colored by status.
      const barY = top + blockH * 0.58;
      const barH = Math.round(blockH * 0.12);
      const frac = Math.max(0, Math.min(1, order.progress / order.quantity));
      roundRectPath(ctx, pad, barY, innerW, barH, barH / 2);
      ctx.fillStyle = UI.track;
      ctx.fill();
      if (frac > 0) {
        roundRectPath(ctx, pad, barY, Math.max(barH, innerW * frac), barH, barH / 2);
        ctx.fillStyle = statusColor;
        ctx.fill();
      }

      // Row 3: progress count + status.
      const line3Y = top + blockH * 0.82;
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(blockH * 0.17)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = UI.navy;
      ctx.fillText(`${Math.min(order.progress, order.quantity)} / ${order.quantity}`, pad, line3Y);

      ctx.textAlign = "right";
      ctx.fillStyle = statusColor;
      ctx.font = `bold ${Math.round(blockH * 0.18)}px sans-serif`;
      const statusText =
        order.status === "filled"
          ? "FILLED ✓"
          : order.status === "lost"
            ? "Rival took it"
            : `${order.runsLeft} ${order.runsLeft === 1 ? "run" : "runs"} left`;
      ctx.fillText(statusText, right, line3Y);

      // A thin divider under each row except the last.
      if (i < shown.length - 1) {
        ctx.strokeStyle = UI.track;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pad, top + blockH);
        ctx.lineTo(right, top + blockH);
        ctx.stroke();
      }
    });
  };

  redraw();

  const board = makeCanvasPlane(canvas, O.width, O.height, true);
  board.name = "OrderBoard";
  board.userData.orders = orders;
  board.userData.redraw = (): void => {
    redraw();
    (board.material as MeshBasicMaterial).map!.needsUpdate = true;
  };
  return board;
}

// =============================================================================
// placeOrderBoard
// Mounts the order board just to the LEFT of the readout board (same height,
// depth, and downward tilt), tagged OrderBoard so the ProductionSystem can find
// it. Called alongside placeReadoutBoard when the cockpit appears.
// =============================================================================
export function placeOrderBoard(world: World): void {
  const C = CONSTANTS;
  const board = buildOrderBoard();
  board.position.set(C.orders.x, C.boardY, C.lineCenterZ);
  board.rotation.x = C.boardTilt; // share the readout board's gentle downward tilt
  world.createTransformEntity(board).addComponent(OrderBoard).addComponent(Dynamic);
}

// =============================================================================
// buildDayPanel
// The in-world "Day Progress" panel — a rounded cream card (like the order board)
// that fills as the student completes production runs. Shows "Run X of Y", a gold
// progress bar, and a short status line. Holds `userData.setProgress(done, total)`
// which the ProductionSystem calls each run. Mirrors the order board so the three
// panels (Orders · Dashboard · Day) read as one dashboard across the top.
// =============================================================================
export function buildDayPanel(): Mesh {
  const D = CONSTANTS.dayMeter;
  const pxPerMeter = 320;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(D.width * pxPerMeter);
  canvas.height = Math.round(D.height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  let done = 0; // runs completed so far
  let total = 1; // the day's length in runs (seeded by setProgress)

  const redraw = (): void => {
    ctx.clearRect(0, 0, W, H);

    // Card + navy border + soft shadow (same look as the order board).
    const M = Math.round(H * 0.025);
    const cardX = M;
    const cardY = M;
    const cardW = W - M * 2;
    const cardH = H - M * 2;
    const radius = Math.round(H * 0.05);
    drawCard(ctx, cardX, cardY, cardW, cardH, {
      fill: UI.cream,
      stroke: UI.navy,
      lineWidth: 6,
      radius,
      shadow: true,
    });

    // Teal title band, clipped to the rounded top corners.
    const titleH = Math.round(cardH * 0.13);
    ctx.save();
    roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
    ctx.clip();
    ctx.fillStyle = new Color(CONSTANTS.tealColor).getStyle();
    ctx.fillRect(cardX, cardY, cardW, titleH);
    ctx.restore();
    ctx.fillStyle = UI.white;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(titleH * 0.52)}px sans-serif`;
    ctx.fillText("🕒 Day Progress", W / 2, cardY + titleH / 2);

    const clamped = Math.max(0, Math.min(total, done));
    const frac = total > 0 ? clamped / total : 0;
    const pad = cardX + Math.round(cardW * 0.08);
    const innerW = cardW - Math.round(cardW * 0.16);

    // The big "Run X of Y" count.
    ctx.fillStyle = UI.navy;
    ctx.font = `bold ${Math.round(cardH * 0.17)}px sans-serif`;
    ctx.fillText(`Run ${clamped} of ${total}`, W / 2, cardY + titleH + cardH * 0.24);

    // The progress bar (track + gold fill).
    const barY = cardY + titleH + cardH * 0.44;
    const barH = Math.round(cardH * 0.12);
    roundRectPath(ctx, pad, barY, innerW, barH, barH / 2);
    ctx.fillStyle = UI.track;
    ctx.fill();
    if (frac > 0) {
      roundRectPath(ctx, pad, barY, Math.max(barH, innerW * frac), barH, barH / 2);
      ctx.fillStyle = new Color(D.barColor).getStyle();
      ctx.fill();
    }

    // A short status line under the bar.
    const status =
      clamped >= total
        ? "The whistle blows — day's end!"
        : clamped === total - 1
          ? "Last run of the day!"
          : "Keep the line running.";
    ctx.fillStyle = UI.goldText;
    ctx.font = `${Math.round(cardH * 0.08)}px sans-serif`;
    ctx.fillText(status, W / 2, cardY + titleH + cardH * 0.66);
  };

  redraw();

  const panel = makeCanvasPlane(canvas, D.width, D.height, true);
  panel.name = "DayPanel";
  panel.userData.setProgress = (d: number, t: number): void => {
    done = d;
    total = t;
    redraw();
    (panel.material as MeshBasicMaterial).map!.needsUpdate = true;
  };
  return panel;
}

// =============================================================================
// placeDayPanel
// Drops the day-progress panel to the RIGHT of the readout board (same height,
// depth, and tilt), tagged DayPanel so the ProductionSystem can update it, and
// creates the matching top-right DOM meter for the browser view. Both are seeded
// at 0 of the day's length (runsBeforeClosing).
// =============================================================================
export function placeDayPanel(world: World): void {
  const C = CONSTANTS;
  const panel = buildDayPanel();
  panel.position.set(C.dayMeter.x, C.boardY, C.lineCenterZ);
  panel.rotation.x = C.boardTilt; // share the readout board's gentle downward tilt
  world.createTransformEntity(panel).addComponent(DayPanel).addComponent(Dynamic);

  // Seed both the in-world panel and the browser DOM meter at 0 of the day length.
  const total = runsBeforeClosing();
  (panel.userData.setProgress as (d: number, t: number) => void)(0, total);
  createDayMeter(0, total);
}

// =============================================================================
// reportBandFor
// Sorts one final score into a simple high / medium / low band using the cutoffs
// on its REPORT_SCORES entry. The value is in the SAME units as the cutoffs:
// Production Output is the raw running total, while Worker Satisfaction and Profit
// Margin are fractions (0..1). Used by the End of Day report to pick the feedback.
// =============================================================================
export function reportBandFor(score: ReportScore, value: number): ReportBand {
  if (value >= score.high) return "high";
  if (value >= score.medium) return "medium";
  return "low";
}

// =============================================================================
// fitWrappedLines
// Shrink a block of text until its word-wrapped lines fit BOTH a max width AND a
// max height, then return the chosen lines + font size + line height. Shared by
// the End of Day report's per-score history line, dynamic summary, and closing
// takeaway so each one fills its own area without ever overflowing.
// =============================================================================
export function fitWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  weight = "", // "" for normal, "bold" for headings
  minSize = 11,
): { lines: string[]; size: number; lineH: number } {
  const prefix = weight ? `${weight} ` : "";
  let size = startSize;
  let lines: string[] = [];
  while (size > minSize) {
    ctx.font = `${prefix}${size}px sans-serif`;
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length * size * 1.25 <= maxHeight) break;
    size -= 2;
  }
  ctx.font = `${prefix}${size}px sans-serif`;
  return { lines, size, lineH: size * 1.25 };
}

// =============================================================================
// buildReportBoard
// Draws the End of Day Production Report onto one parchment canvas plane. It reads
// the three FINAL live scores (it NEVER recomputes a score), and for each shows
// the name, the final number, and a plain-language line connecting how the student
// did to what really happened in Virginia's factories (REPORT_WRAP — the "high"
// line for a high OR medium day, the "low" line only for a low day). A gold band
// carries the dynamic how-balanced summary (REPORT_SUMMARY, chosen by how many
// scores landed "high"), and a teal band at the very bottom carries the one
// always-shown closing takeaway (REPORT_CLOSING). All text shrinks-to-fit so
// nothing overflows. The board starts see-through so it can be faded in.
// =============================================================================
export function buildReportBoard(
  output: number, // final Production Output (the raw running total)
  satisfaction: number, // final Worker Satisfaction (0..1)
  margin: number, // final profit SHARE (0..1) — used to GRADE the Profit score
  profitCoins: number, // final Profit in coins — what the Profit row DISPLAYS
  factory: FactoryType | null, // the chosen business (fills in "{product}")
  recapLines: string[] = [], // plain recap lines (orders / predictions / safety) — NOT graded
): Mesh {
  const C = CONSTANTS;
  const R = C.report;

  // Pair each report score with the value it is GRADED on, by label. Profit is
  // graded on its profitability margin (how well costs were managed), even though
  // it DISPLAYS the actual coins below — the bands live in margin units.
  const gradeByLabel: Record<string, number> = {
    "Production Output": output,
    "Worker Satisfaction": satisfaction,
    Profit: margin,
  };

  // Work out each row's band, number, and history line once, up front, and count
  // the strong scores so we can pick the matching dynamic summary line.
  let highCount = 0;
  const rows = REPORT_SCORES.map((score) => {
    const value = gradeByLabel[score.label] ?? 0;
    const band = reportBandFor(score, value);
    if (band === "high") highCount += 1;
    const wrap = REPORT_WRAP[score.label];
    return {
      band, // drives the row's star grade (★★★ high / ★★ medium / ★ low)
      label: score.label,
      // Profit shows the actual coins; the percentage scores show "%"; Production
      // Output shows a whole number. (All match how the live board reads them.)
      value:
        score.label === "Profit"
          ? `$${Math.round(profitCoins)}`
          : score.percent
            ? `${Math.round(value * 100)}%`
            : String(Math.round(value)),
      // The history line: the "high" text for a high OR medium day, the "low" text
      // only for a genuinely low day. (Falls back to the per-band feedback if a
      // score ever lacks a REPORT_WRAP entry.)
      comment: wrap
        ? band === "low"
          ? wrap.low
          : wrap.high
        : fillNews(score.feedback[band], factory),
    };
  });
  const summary = fillNews(REPORT_SUMMARY[highCount], factory);

  // Canvas sized to match the board's shape, at a comfortable resolution.
  const pxPerMeter = 256;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(R.width * pxPerMeter);
  canvas.height = Math.round(R.height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Card geometry: a rounded cream card (navy border + soft shadow).
  const M = Math.round(H * 0.025);
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;
  const radius = Math.round(H * 0.045);

  ctx.clearRect(0, 0, W, H);
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius,
    shadow: true,
  });

  // Three bands, all clipped to the card's rounded corners: a gold title across
  // the top, a gold dynamic-summary band, and a teal "big takeaway" band at the
  // very bottom (teal = the course's Virginia-history accent).
  const title = "🏁 End of Day — Production Report";
  const titleH = Math.round(cardH * 0.12);
  const closingH = Math.round(cardH * 0.15); // teal closing band (very bottom)
  const summaryH = Math.round(cardH * 0.16); // gold summary band (just above it)
  const closingTop = cardY + cardH - closingH;
  const summaryTop = closingTop - summaryH;

  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, cardY, cardW, titleH);
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, summaryTop, cardW, summaryH);
  ctx.fillStyle = new Color(C.tealColor).getStyle();
  ctx.fillRect(cardX, closingTop, cardW, closingH);
  ctx.restore();

  // Title text, white, centered, shrunk to fit.
  ctx.fillStyle = UI.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let titleSize = Math.round(titleH * 0.5);
  ctx.font = `bold ${titleSize}px sans-serif`;
  while (titleSize > 16 && ctx.measureText(title).width > cardW * 0.9) {
    titleSize -= 2;
    ctx.font = `bold ${titleSize}px sans-serif`;
  }
  ctx.fillText(title, W / 2, cardY + titleH / 2);

  // The three score blocks fill the space between the title and summary bands,
  // reserving a thin strip just above the summary for the recap lines (plain
  // "Orders filled: N of M" / "Predictions right: N of M" — recaps, NOT graded
  // scores, so the three-score rubric stays intact).
  const areaTop = cardY + titleH;
  const recapLineH = Math.round(cardH * 0.07);
  const recapStripH = recapLines.length * recapLineH;
  const blocksBottom = summaryTop - recapStripH;
  const blockH = (blocksBottom - areaTop) / rows.length;
  const pad = cardX + Math.round(cardW * 0.05);
  const right = cardX + cardW - Math.round(cardW * 0.05);
  const innerW = right - pad;

  rows.forEach((row, i) => {
    const top = areaTop + i * blockH;

    // The score name (with its icon) on the left and the final number on the
    // right, in the meter's own color.
    const style = METER_STYLE[row.label];
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(blockH * 0.24)}px sans-serif`;
    const nameY = top + blockH * 0.28;
    ctx.fillStyle = UI.navy;
    ctx.textAlign = "left";
    ctx.fillText(`${style?.icon ?? ""} ${row.label}`.trim(), pad, nameY);
    ctx.fillStyle = style?.text ?? UI.navy;
    ctx.textAlign = "right";
    ctx.fillText(row.value, right, nameY);

    // A friendly star grade beside the number — ★★★ for a great score, ★★ for
    // a solid one, ★ for a tough day. Kids read stars at a glance, like any
    // level-clear screen. (The gray stars are drawn first, then the earned
    // ones are drawn over them in gold.)
    const numberWidth = ctx.measureText(row.value).width; // number font still active
    const starCount = row.band === "high" ? 3 : row.band === "medium" ? 2 : 1;
    ctx.font = `${Math.round(blockH * 0.2)}px sans-serif`;
    const allStars = "★★★";
    const starsX =
      right - numberWidth - Math.round(cardW * 0.02) - ctx.measureText(allStars).width;
    ctx.textAlign = "left";
    ctx.fillStyle = UI.track;
    ctx.fillText(allStars, starsX, nameY);
    ctx.fillStyle = UI.gold;
    ctx.fillText("★".repeat(starCount), starsX, nameY);

    // The history line under the name, wrapped + shrunk to fit the lower half of
    // the block (so blocks never overlap).
    const fit = fitWrappedLines(
      ctx,
      row.comment,
      innerW,
      blockH * 0.46,
      Math.round(blockH * 0.2),
    );
    ctx.fillStyle = UI.navy;
    ctx.textAlign = "left";
    ctx.font = `${fit.size}px sans-serif`;
    let y = top + blockH * 0.54;
    fit.lines.forEach((line) => {
      ctx.fillText(line, pad, y);
      y += fit.lineH;
    });

    // A thin tan divider under each block except the last, like a row rule.
    if (i < rows.length - 1) {
      ctx.strokeStyle = UI.track;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad, top + blockH);
      ctx.lineTo(right, top + blockH);
      ctx.stroke();
    }
  });

  // Recap lines in the reserved strip (navy, centered) — plain counts, deliberately
  // NOT graded scores, so the three-score rubric is intact.
  if (recapLines.length > 0) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = UI.navy;
    const baseSize = Math.round(recapLineH * 0.52);
    const maxW = cardW * 0.92;
    recapLines.forEach((line, i) => {
      // Shrink each line to fit the card width.
      const size = fitFontSize(ctx, line, maxW, baseSize, "bold");
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillText(line, W / 2, blocksBottom + recapLineH * (i + 0.5));
    });
  }

  // Dynamic summary line (white on the gold band), shrunk to fit.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.white;
  const sum = fitWrappedLines(ctx, summary, cardW * 0.9, summaryH * 0.82, Math.round(summaryH * 0.3), "bold");
  ctx.font = `bold ${sum.size}px sans-serif`;
  const sumStart = summaryTop + summaryH / 2 - ((sum.lines.length - 1) * sum.lineH) / 2;
  sum.lines.forEach((line, i) => ctx.fillText(line, W / 2, sumStart + i * sum.lineH));

  // The one closing takeaway (white on the teal band), always shown, shrunk to fit.
  ctx.fillStyle = UI.white;
  const close = fitWrappedLines(ctx, REPORT_CLOSING, cardW * 0.9, closingH * 0.82, Math.round(closingH * 0.3), "bold");
  ctx.font = `bold ${close.size}px sans-serif`;
  const closeStart = closingTop + closingH / 2 - ((close.lines.length - 1) * close.lineH) / 2;
  close.lines.forEach((line, i) => ctx.fillText(line, W / 2, closeStart + i * close.lineH));

  const board = makeCanvasPlane(canvas, R.width, R.height, true);
  board.name = "ReportBoard";

  // Start see-through so the ProductionSystem can fade it in once it appears.
  // (Fades via opacity, so no alpha-test — see makeNotePlane.)
  const material = board.material as MeshBasicMaterial;
  material.transparent = true;
  material.alphaTest = 0;
  material.opacity = 0;

  return board;
}

// =============================================================================
// makeNotePlane
// A small parchment message panel with a teal border and navy text, word-wrapped
// to fit and centered. It starts hidden and see-through; the caller fills in the
// wording via userData.setText and fades it in. Used for the "farm vs. factory"
// callout under the board (default size) AND reused for the foreman's speech
// panel (pass a width/height).
// =============================================================================
export function makeNotePlane(
  width: number = CONSTANTS.noteWidth,
  height: number = CONSTANTS.noteHeight,
): Mesh {
  const C = CONSTANTS;
  // A high pixel density keeps the text crisp even when a panel (like the hint
  // banner) floats right in front of the player — the old 256 px/m was upscaled
  // and looked blurry up close. Capped so the widest panel's canvas stays a
  // GPU-safe size (≤ 4096 px on its longest side).
  const pxPerMeter = Math.min(1024, 4096 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(height * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  // Draw the note as a rounded cream card (gold border + soft shadow) with navy
  // text, word-wrapped and centered — the same look as the welcome/dashboard.
  // The font shrinks only as much as needed so the lines fit the panel height.
  const M = Math.round(H * 0.05);
  const paint = (text: string): void => {
    ctx.clearRect(0, 0, W, H);
    drawCard(ctx, M, M, W - M * 2, H - M * 2, {
      fill: UI.cream,
      stroke: UI.gold,
      lineWidth: Math.max(4, Math.round(H * 0.025)),
      radius: Math.round(H * 0.16),
      shadow: true,
    });

    ctx.fillStyle = UI.navy;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = W * 0.84;
    let fontSize = Math.round(H * 0.2);
    let lines: string[] = [];
    while (fontSize > 12) {
      ctx.font = `bold ${fontSize}px sans-serif`;
      lines = wrapLines(ctx, text, maxWidth);
      if (lines.length * fontSize * 1.3 <= H * 0.8) break;
      fontSize -= 4;
    }

    const lineHeight = fontSize * 1.3;
    const top = H / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, top + i * lineHeight));
  };

  paint(""); // empty until the first run fills it in

  const note = makeCanvasPlane(canvas, width, height, true);
  note.name = "FarmNote";
  note.visible = false; // shown after the first run finishes

  // Make the material fade-able. The note fades via material.opacity, so it must
  // NOT also alpha-test (that would clip the whole card at low opacity) — only
  // the transparent blending from makeCanvasPlane's `transparent` flag is kept.
  const material = note.material as MeshBasicMaterial;
  material.transparent = true;
  material.alphaTest = 0;
  material.opacity = 0;

  const texture = material.map!;
  note.userData.setText = (text: string): void => {
    paint(text);
    texture.needsUpdate = true;
  };

  return note;
}

// =============================================================================
// wrapLines
// Breaks a sentence into lines that each fit within `maxWidth` (using the
// canvas's CURRENT font). A small helper for word-wrapped text like the note.
// =============================================================================
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// =============================================================================
// titleCase
// Tiny helper: "iron ore" -> "Iron Ore". The businesses store their product and
// material in lowercase; we capitalize them for the on-line name-tags.
// =============================================================================
export function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

// =============================================================================
// makeChoiceCard
// Draws one "pick this business" card in the polished cream-card style: a rounded
// cream panel (soft shadow + navy border) with a gold header band holding the
// business name in white, the plain-language description wrapped underneath in
// navy, and a small gold "Choose" pill at the bottom so it reads as a button.
// =============================================================================
export function makeChoiceCard(factory: FactoryType): Mesh {
  const C = CONSTANTS;
  const pxPerMeter = 512;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.choiceW * pxPerMeter);
  canvas.height = Math.round(C.choiceH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 18; // margin (shadow room)
  const radius = 30;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;

  // The cream card body (rounded, soft shadow).
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    radius,
    shadow: true,
  });

  // Gold header band across the top, clipped to the card's rounded top corners.
  const headerH = Math.round(cardH * 0.19);
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = UI.gold;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();

  // Navy border on top of everything.
  roundRectPath(ctx, cardX + 3, cardY + 3, cardW - 6, cardH - 6, radius);
  ctx.strokeStyle = UI.navy;
  ctx.lineWidth = 6;
  ctx.stroke();

  // The business name, white, centered on the gold band.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.white;
  const nameSize = fitFontSize(ctx, factory.name, cardW - 50, Math.round(headerH * 0.5), "bold");
  ctx.font = `bold ${nameSize}px sans-serif`;
  ctx.fillText(factory.name, W / 2, cardY + headerH / 2);

  // Description: navy, wrapped, centered under the header.
  ctx.fillStyle = UI.navy;
  ctx.textBaseline = "top";
  const bodySize = Math.round(H * 0.048);
  ctx.font = `${bodySize}px sans-serif`;
  const padX = Math.round(cardW * 0.1);
  drawWrapped(
    ctx,
    factory.blurb,
    cardX + padX,
    cardY + headerH + Math.round(cardH * 0.07),
    cardW - padX * 2,
    bodySize * 1.34,
    "center",
  );

  // A small gold "Choose" pill near the bottom, so the card reads as a button.
  const pillW = Math.round(cardW * 0.56);
  const pillH = Math.round(cardH * 0.1);
  const pillX = W / 2 - pillW / 2;
  const pillY = cardY + cardH - pillH - Math.round(cardH * 0.06);
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = UI.gold;
  ctx.fill();
  ctx.fillStyle = UI.white;
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(pillH * 0.5)}px sans-serif`;
  ctx.fillText("Choose", W / 2, pillY + pillH / 2);

  const card = makeCanvasPlane(canvas, C.choiceW, C.choiceH, true);
  card.name = `Choice_${factory.id}`;
  return card;
}

// =============================================================================
// makeWelcomePanel
// Draws the "modal" header card that sits above the choice cards: a rounded cream
// card (soft shadow + navy border) with a small gold uppercase eyebrow, the big
// navy title, and an amber-bordered inner box carrying a heading + one friendly
// line — the same shape as the farming module's "How to Play" card.
// =============================================================================
export function makeWelcomePanel(): Mesh {
  const C = CONSTANTS;
  const pxPerMeter = 512;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.welcomePanelW * pxPerMeter);
  canvas.height = Math.round(C.welcomePanelH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 22;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;

  // The cream modal card.
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius: 36,
    shadow: true,
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Font sizes are based on the WIDTH (not the height), so the panel can be kept
  // SHORT — hugging its text — without shrinking the words.
  const eyebrowFont = Math.round(W * 0.0165);
  const titleMax = Math.round(W * 0.055);
  const headingFont = Math.round(W * 0.0275);
  const descFont = Math.round(W * 0.019);

  // Eyebrow: small, gold, spaced-out capitals (we insert spaces for the spacing).
  ctx.fillStyle = UI.goldText;
  ctx.font = `bold ${eyebrowFont}px sans-serif`;
  ctx.fillText("G E T   S T A R T E D", W / 2, cardY + Math.round(H * 0.1));

  // Title: big and navy.
  ctx.fillStyle = UI.navy;
  const titleSize = fitFontSize(ctx, "The Factory Floor", cardW - 120, titleMax, "bold");
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText("The Factory Floor", W / 2, cardY + Math.round(H * 0.28));

  // Inner amber box, sized to HUG its heading + one line of description (so there
  // is no big empty space below the text), anchored near the bottom of the card.
  const boxPadTop = Math.round(H * 0.065);
  const headingGap = Math.round(H * 0.095); // heading baseline → description baseline
  const boxPadBot = Math.round(H * 0.065);
  const boxH = boxPadTop + headingFont + headingGap + descFont + boxPadBot;
  const boxX = cardX + Math.round(cardW * 0.05);
  const boxW = cardW - Math.round(cardW * 0.1);
  const boxY = cardY + cardH - boxH - Math.round(H * 0.06);
  drawCard(ctx, boxX, boxY, boxW, boxH, {
    fill: UI.innerBox,
    stroke: UI.gold,
    lineWidth: 5,
    radius: 24,
  });

  ctx.fillStyle = UI.navy;
  ctx.textBaseline = "middle";
  ctx.font = `bold ${headingFont}px sans-serif`;
  ctx.fillText("Pick Your Business", W / 2, boxY + boxPadTop + headingFont / 2);

  ctx.font = `${descFont}px sans-serif`;
  ctx.fillText(
    "Run a factory in early Virginia — choose a trade below to begin!",
    W / 2,
    boxY + boxPadTop + headingFont + headingGap + descFont / 2,
  );

  const panel = makeCanvasPlane(canvas, C.welcomePanelW, C.welcomePanelH, true);
  panel.name = "WelcomePanel";
  return panel;
}

// =============================================================================
// buildWelcome
// Puts the opening "pick your business" screen in front of the player: one cream
// "modal" header card (eyebrow + title + inner box) and three business choice
// cards in a row beneath it (one per FACTORY_TYPES entry). The header card is a
// non-interactive entity; each choice card is its OWN entity so it can be clicked.
//
// Every piece is tagged `WelcomePart` so the SetupSystem can sweep the whole
// welcome away in one go once a choice is made. Each card also carries a
// `FactoryChoice` remembering which business it offers.
// =============================================================================
export function buildWelcome(world: World): void {
  const C = CONSTANTS;

  // The cream modal header card (non-interactive).
  const panel = makeWelcomePanel();
  panel.position.set(0, C.welcomePanelY, C.welcomeZ);
  world.createTransformEntity(panel).addComponent(WelcomePart).addComponent(Dynamic);

  // Three business choice cards, evenly spaced left-to-right (i = 0,1,2 ->
  // -gap, 0, +gap). Each is clickable and remembers its place in FACTORY_TYPES.
  FACTORY_TYPES.forEach((factory, i) => {
    const card = makeChoiceCard(factory);
    card.position.set((i - 1) * C.choiceGap, C.choiceY, C.welcomeZ);
    world
      .createTransformEntity(card)
      .addComponent(RayInteractable)
      .addComponent(FactoryChoice, { index: i })
      .addComponent(WelcomePart)
      .addComponent(Dynamic);
  });
}

// =============================================================================
// makeGoalPanel
// Draws the "Your Factory, Your Goal" card: a rounded cream panel (navy border +
// soft shadow) with a teal title band across the top, a navy "Today you will:"
// heading, and the four plain-language goals as wrapped bullets beneath it. The
// body font shrinks just enough that the whole list fits the card. The words all
// live in TOUR_GOAL, so they are easy to edit in one place.
// =============================================================================
export function makeGoalPanel(): Mesh {
  const C = CONSTANTS.tour;
  const pxPerMeter = 360;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(C.goalPanelW * pxPerMeter);
  canvas.height = Math.round(C.goalPanelH * pxPerMeter);
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;

  const M = 24;
  const cardX = M;
  const cardY = M;
  const cardW = W - M * 2;
  const cardH = H - M * 2;
  const radius = 36;

  // The cream card body.
  drawCard(ctx, cardX, cardY, cardW, cardH, {
    fill: UI.cream,
    stroke: UI.navy,
    lineWidth: 6,
    radius,
    shadow: true,
  });

  // A teal title band across the top, clipped to the card's rounded top corners.
  const bandH = Math.round(cardH * 0.16);
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = new Color(CONSTANTS.tealColor).getStyle();
  ctx.fillRect(cardX, cardY, cardW, bandH);
  ctx.restore();

  // Title (cream) centered on the teal band.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI.cream;
  const titleSize = fitFontSize(ctx, TOUR_GOAL.title, cardW - 80, Math.round(bandH * 0.52), "bold");
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.fillText(TOUR_GOAL.title, W / 2, cardY + bandH / 2);

  // Body area below the band.
  const padX = Math.round(cardW * 0.07);
  const bodyX = cardX + padX;
  const bodyW = cardW - padX * 2;
  const bodyTop = cardY + bandH + Math.round(cardH * 0.06);
  const bodyBottom = cardY + cardH - Math.round(cardH * 0.05);
  const indent = Math.round(bodyW * 0.045); // hanging indent for wrapped bullet lines

  // Lay out the heading + wrapped bullets at a given body font size. Returns the
  // bottom Y the text reaches (so we can shrink the font until it all fits). When
  // `draw` is false it only measures; the two passes share the exact same layout.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const layoutBody = (size: number, draw: boolean): number => {
    const lineH = size * 1.32;
    let y = bodyTop;

    // Heading.
    if (draw) {
      ctx.font = `bold ${size}px sans-serif`;
      ctx.fillStyle = UI.navy;
      ctx.fillText(TOUR_GOAL.heading, bodyX, y);
    }
    y += lineH + size * 0.45; // heading + a little breathing room before the bullets

    // Bullets, each wrapped with a hanging indent.
    for (const bullet of TOUR_GOAL.bullets) {
      ctx.font = `${size}px sans-serif`; // set before wrapLines (it measures with the current font)
      const wrapped = wrapLines(ctx, bullet, bodyW - indent);
      wrapped.forEach((line, i) => {
        if (draw) {
          ctx.fillStyle = UI.navy;
          ctx.fillText(i === 0 ? `•  ${line}` : line, i === 0 ? bodyX : bodyX + indent, y);
        }
        y += lineH;
      });
      y += size * 0.4; // a small gap between bullets
    }
    return y;
  };

  let bodySize = Math.round(H * 0.052);
  while (bodySize > 18 && layoutBody(bodySize, false) > bodyBottom) {
    bodySize -= 2;
  }
  layoutBody(bodySize, true);

  const panel = makeCanvasPlane(canvas, C.goalPanelW, C.goalPanelH, true);
  panel.name = "GoalCard";
  return panel;
}

// =============================================================================
// buildGoalCard
// Floats the "Your Factory, Your Goal" card in front of the player (on the clear
// floor, before the cockpit appears) with two buttons beneath it: a gold "Start
// the tour" and a quieter "Skip tour". The panel is a non-interactive entity;
// each button is its OWN clickable entity carrying a TourButton action. Every
// piece is tagged TourPart so the TutorialSystem can sweep the whole goal card
// away in one go once a button is clicked.
// =============================================================================
export function buildGoalCard(world: World): void {
  const C = CONSTANTS.tour;

  const panel = makeGoalPanel();
  panel.position.set(0, C.goalPanelY, C.goalPanelZ);
  world.createTransformEntity(panel).addComponent(TourPart).addComponent(Dynamic);

  // "Start the tour" — the gold primary button.
  const start = makeTextPlane({
    text: "Start the tour",
    icon: "▶️",
    width: C.startButtonW,
    height: C.startButtonH,
    background: UI.gold,
    textColor: UI.white,
    border: UI.goldText,
  });
  start.position.set(...C.startButtonPos);
  world
    .createTransformEntity(start)
    .addComponent(RayInteractable)
    .addComponent(TourButton, { action: TOUR.start })
    .addComponent(TourPart)
    .addComponent(Dynamic);

  // "Skip tour" — a smaller, quieter cream button beside it.
  const skip = makeTextPlane({
    text: "Skip tour",
    width: C.skipButtonW,
    height: C.skipButtonH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.navy,
  });
  skip.position.set(...C.skipButtonPos);
  world
    .createTransformEntity(skip)
    .addComponent(RayInteractable)
    .addComponent(TourButton, { action: TOUR.skip })
    .addComponent(TourPart)
    .addComponent(Dynamic);
}

// =============================================================================
// buildPrediction
// Floats a one-tap prediction prompt in front of the player: a cream question
// card ("🗣️ If we run Fast, what happens to the crew?") with two gold answer
// buttons beneath it. The panel is non-interactive; each button is its own
// clickable entity carrying a PredictionButton value (0 or 1). Every piece is
// tagged PredictionPart so the ProductionSystem can sweep the whole prompt away
// the moment an answer is tapped. (Dynamic too, so "Play Again" clears it.)
// =============================================================================
export function buildPrediction(world: World, prediction: Prediction): void {
  const P = CONSTANTS.predictions;

  const panel = makeTextPlane({
    text: prediction.question,
    icon: "🗣️",
    width: P.panelW,
    height: P.panelH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.gold,
  });
  panel.position.set(0, P.y, P.z);
  world
    .createTransformEntity(panel)
    .addComponent(PredictionPart)
    .addComponent(Dynamic);

  prediction.options.forEach((label, i) => {
    const button = makeTextPlane({
      text: label,
      width: P.buttonW,
      height: P.buttonH,
      background: UI.gold,
      textColor: UI.white,
      border: UI.goldText,
    });
    button.position.set(i === 0 ? -P.buttonGap : P.buttonGap, P.buttonY, P.z);
    world
      .createTransformEntity(button)
      .addComponent(RayInteractable)
      .addComponent(PredictionButton, { value: i })
      .addComponent(PredictionPart)
      .addComponent(Dynamic);
  });
}

// =============================================================================
// buildSafetyEvent
// Floats the worker-safety decision in front of the player: a cream panel with
// the "a worker got hurt" line + the foreman's history line, and two choice
// cards beneath it — a gold "Add safety guards" (the responsible choice) and a
// red-bordered "Push on" (the risky one). Each card is its own clickable entity
// carrying a SafetyButton value (0 = guards, 1 = push). Every piece is tagged
// SafetyPart so the ProductionSystem can sweep the whole event away once a choice
// is made (Dynamic too, so "Play Again" clears it).
// =============================================================================
export function buildSafetyEvent(world: World): void {
  const S = CONSTANTS.safetyEvent;

  const panel = makeTextPlane({
    text: `${S.question}\n${S.history}`,
    icon: "⚠️",
    width: S.panelW,
    height: S.panelH,
    background: UI.cream,
    textColor: UI.navy,
    border: UI.gold,
  });
  panel.position.set(0, S.y, S.z);
  world
    .createTransformEntity(panel)
    .addComponent(SafetyPart)
    .addComponent(Dynamic);

  // Option 0 — add safety guards (the responsible, recommended choice): gold.
  const guards = makeTextPlane({
    text: S.guardsLabel,
    width: S.optionW,
    height: S.optionH,
    background: UI.gold,
    textColor: UI.white,
    border: UI.goldText,
  });
  guards.position.set(-S.optionGap, S.optionY, S.z);
  world
    .createTransformEntity(guards)
    .addComponent(RayInteractable)
    .addComponent(SafetyButton, { value: 0 })
    .addComponent(SafetyPart)
    .addComponent(Dynamic);

  // Option 1 — push on (the risky choice): cream with a warning-red border.
  const push = makeTextPlane({
    text: S.pushLabel,
    width: S.optionW,
    height: S.optionH,
    background: UI.cream,
    textColor: UI.navy,
    border: 0xb3402e, // warning red — this is the risky choice
  });
  push.position.set(S.optionGap, S.optionY, S.z);
  world
    .createTransformEntity(push)
    .addComponent(RayInteractable)
    .addComponent(SafetyButton, { value: 1 })
    .addComponent(SafetyPart)
    .addComponent(Dynamic);
}

