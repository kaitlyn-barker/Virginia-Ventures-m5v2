// =============================================================================
// hud.ts — the top-left "My Factory" dashboard.
// -----------------------------------------------------------------------------
// A plain HTML overlay pinned to the upper-left corner of the screen, sitting on
// top of the 3D canvas. It ALWAYS shows the six live factory meters plus a
// little status pill, no matter where the player looks. Built once at startup
// and then refreshed in place (we keep references to the live number + bar
// elements, so updating is cheap).
//
// This is the SAME approach the farming module uses for its corner HUD: a
// `position: fixed` card with `pointer-events: none` so it never blocks a click.
// Being a DOM overlay, it shows in the BROWSER view; inside an immersive headset
// the in-world readout board (environment.ts) carries the same numbers.
//
// All the colors/icons live in ui-style.ts so this card and the in-world board
// match exactly.
// =============================================================================

import { UI, METER_STYLE, METER_ORDER, STATUS_TONE } from "./ui-style.js";

// One meter's live data, as the readout board stores it (label + display value
// + how full the bar is, 0..1). The HUD just mirrors these.
type Meter = { label: string; value: string; fill: number };

// The live elements we update after the first build (kept by meter label).
let hudEl: HTMLElement | null = null;
let statusChip: HTMLElement | null = null;
const rowRefs: Record<string, { value: HTMLElement; fill: HTMLElement }> = {};

// makeRow(label): build ONE meter row — "📦 Production Output [▓▓▓░░] 120".
// The label + icon sit on the left, a rounded track + colored fill in the
// middle, and the number on the right. Returns the row plus its live value/fill
// elements so refreshes are a one-line update.
function makeRow(label: string): {
  row: HTMLElement;
  value: HTMLElement;
  fill: HTMLElement;
} {
  const style = METER_STYLE[label] ?? { icon: "•", bar: UI.gold, text: UI.goldText };

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginBottom = "7px";

  const labelEl = document.createElement("span");
  labelEl.textContent = style.icon + " " + label;
  labelEl.style.color = UI.navy;
  labelEl.style.fontWeight = "700";
  labelEl.style.width = "150px";
  labelEl.style.whiteSpace = "nowrap";

  const track = document.createElement("div");
  track.style.width = "84px";
  track.style.height = "12px";
  track.style.background = UI.track;
  track.style.borderRadius = "6px";
  track.style.overflow = "hidden";
  track.style.flexShrink = "0";

  const fill = document.createElement("div");
  fill.style.height = "100%";
  fill.style.width = "50%";
  fill.style.background = style.bar;
  fill.style.borderRadius = "6px";
  fill.style.transition = "width 0.45s ease"; // bars glide to new values

  track.appendChild(fill);

  const value = document.createElement("span");
  value.style.color = style.text;
  value.style.fontWeight = "800";
  value.style.minWidth = "30px";
  value.style.textAlign = "right";
  value.style.transition = "transform 0.18s ease";

  row.appendChild(labelEl);
  row.appendChild(track);
  row.appendChild(value);
  return { row, value, fill };
}

// createFactoryHud(seed, status): build the dashboard once and drop it into the
// page, seeded with the starting numbers. Safe to call once; later calls no-op.
export function createFactoryHud(seed: Meter[], status: string): void {
  if (hudEl) return; // build only once
  if (typeof document === "undefined") return; // headless safety

  // If a previous build is still in the page (e.g. a dev hot-reload that kept the
  // DOM), remove it first so we never stack two dashboards.
  document.getElementById("factory-hud")?.remove();

  const hud = document.createElement("div");
  hud.id = "factory-hud";
  hud.style.position = "fixed";
  hud.style.top = "16px";
  hud.style.left = "16px";
  hud.style.zIndex = "1000";
  hud.style.background = UI.creamHud;
  hud.style.padding = "12px 16px 10px";
  hud.style.borderRadius = "14px";
  hud.style.border = `2px solid ${UI.navy}`;
  hud.style.fontFamily = "system-ui, sans-serif";
  hud.style.fontSize = "14px";
  hud.style.boxShadow = `0 4px 14px ${UI.shadow}`;
  hud.style.pointerEvents = "none"; // display-only; never blocks clicks

  // Header: the game's "My Factory" title + a status pill on the right.
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "16px";
  header.style.marginBottom = "9px";

  const title = document.createElement("span");
  title.textContent = "🏭 My Factory";
  title.style.color = UI.navy;
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";

  statusChip = document.createElement("span");
  statusChip.style.color = UI.white;
  statusChip.style.fontWeight = "700";
  statusChip.style.fontSize = "12px";
  statusChip.style.padding = "2px 10px";
  statusChip.style.borderRadius = "10px";
  statusChip.style.whiteSpace = "nowrap";

  header.appendChild(title);
  header.appendChild(statusChip);
  hud.appendChild(header);

  // One row per meter, in the canonical order.
  for (const label of METER_ORDER) {
    const r = makeRow(label);
    rowRefs[label] = { value: r.value, fill: r.fill };
    hud.appendChild(r.row);
  }

  document.body.appendChild(hud);
  hudEl = hud;

  setFactoryHudStatus(status, "ready");
  updateFactoryHud(seed);
}

// updateFactoryHud(meters): copy the live numbers + bar widths into the HUD.
// The readout board calls this every time it repaints, so the corner card always
// matches the in-world board. A number that changed gives a tiny "pop".
export function updateFactoryHud(meters: Meter[]): void {
  for (const meter of meters) {
    const ref = rowRefs[meter.label];
    if (!ref) continue;
    if (ref.value.textContent !== meter.value) {
      ref.value.textContent = meter.value;
      bumpValue(ref.value); // a small pop when a score changes
    }
    ref.fill.style.width = Math.max(0, Math.min(1, meter.fill)) * 100 + "%";
  }
}

// A quick scale "pop" so a changed number catches the eye, then settles back.
function bumpValue(el: HTMLElement): void {
  el.style.transform = "scale(1.35)";
  setTimeout(() => {
    el.style.transform = "scale(1)";
  }, 180);
}

// setFactoryHudStatus(text, tone): update the little pill in the header — the
// phase of the day. `tone` picks its background color (see STATUS_TONE).
export function setFactoryHudStatus(
  text: string,
  tone: keyof typeof STATUS_TONE | string = "active",
): void {
  if (!statusChip) return;
  statusChip.textContent = text;
  statusChip.style.background = STATUS_TONE[tone] ?? STATUS_TONE.active;
}
