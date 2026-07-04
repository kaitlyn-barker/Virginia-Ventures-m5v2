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

import { UI, METER_STYLE, METER_ORDER, STATUS_TONE, meterIcon, prefersReducedMotion } from "./ui-style.js";

// One meter's live data, as the readout board stores it (label + display value
// + how full the bar is, 0..1). The HUD just mirrors these.
type Meter = { label: string; value: string; fill: number };

// The live elements we update after the first build (kept by meter label).
let hudEl: HTMLElement | null = null;
let statusChip: HTMLElement | null = null;
const rowRefs: Record<string, { value: HTMLElement; fill: HTMLElement; labelEl: HTMLElement }> = {};

// makeRow(label): build ONE meter row — "📦 Production Output [▓▓▓░░] 120".
// The label + icon sit on the left, a rounded track + colored fill in the
// middle, and the number on the right. Returns the row plus its live value/fill
// elements so refreshes are a one-line update.
function makeRow(label: string): {
  row: HTMLElement;
  value: HTMLElement;
  fill: HTMLElement;
  labelEl: HTMLElement;
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
  return { row, value, fill, labelEl };
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
    rowRefs[label] = { value: r.value, fill: r.fill, labelEl: r.labelEl };
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
    // Keep the row's icon current (the Worker Satisfaction face swaps by band).
    const iconLabel = `${meterIcon(meter.label, meter.fill)} ${meter.label}`;
    if (ref.labelEl.textContent !== iconLabel) ref.labelEl.textContent = iconLabel;
  }
}

// A quick scale "pop" so a changed number catches the eye, then settles back.
function bumpValue(el: HTMLElement): void {
  if (prefersReducedMotion()) return; // honor the reduced-motion setting
  el.style.transform = "scale(1.35)";
  setTimeout(() => {
    el.style.transform = "scale(1)";
  }, 180);
}

// showCoinToast(delta): a small "+12 🪙" (green) / "−8 🪙" (red) that floats up and
// fades beside the corner dashboard whenever the Coins balance changes. Browser-
// only (a DOM overlay); in a headset the in-world Coins meter's gold flash carries
// the change. Guarded so a locked-down DOM degrades quietly.
export function showCoinToast(delta: number): void {
  if (typeof document === "undefined" || Math.round(delta) === 0) return;
  const toast = document.createElement("div");
  const n = Math.abs(Math.round(delta));
  toast.textContent = `${delta > 0 ? "+" : "−"}$${n} 🪙`;
  toast.style.position = "fixed";
  toast.style.left = "340px"; // just right of the top-left dashboard
  toast.style.top = "46px"; // beside the Coins row (the dashboard's first row)
  toast.style.zIndex = "1002";
  toast.style.fontFamily = "system-ui, sans-serif";
  toast.style.fontWeight = "800";
  toast.style.fontSize = "16px";
  toast.style.color = delta > 0 ? "#2e7d32" : "#b3402e"; // green up, red down
  toast.style.pointerEvents = "none";
  toast.style.transition = "transform 0.9s ease-out, opacity 0.9s ease-out";
  document.body.appendChild(toast);
  // Kick off the float-up + fade on the next frame, then remove it.
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(-30px)";
    toast.style.opacity = "0";
  });
  window.setTimeout(() => toast.remove(), 950);
}

// =============================================================================
// Day-progress meter — a separate DOM card pinned top-RIGHT (the corner opposite
// the factory dashboard). It fills as the student completes production runs
// through the work day; when the runs reach the day's length, the End of Day
// report appears. Browser-only (a DOM overlay); in a headset the in-world day
// panel beside the boards carries the same progress (see stations.buildDayPanel).
// =============================================================================
let dayBarEl: HTMLElement | null = null; // the live progress-bar fill
let dayLabelEl: HTMLElement | null = null; // the live "Run X of Y" text

// createDayMeter(done, total): build the top-right card once (removing any prior),
// seeded with the current run count out of the day's length.
export function createDayMeter(done: number, total: number): void {
  if (typeof document === "undefined") return; // headless safety
  document.getElementById("day-meter")?.remove(); // never stack two

  const card = document.createElement("div");
  card.id = "day-meter";
  card.style.position = "fixed";
  card.style.top = "16px";
  card.style.right = "16px";
  card.style.zIndex = "1000";
  card.style.minWidth = "190px";
  card.style.background = UI.creamHud;
  card.style.padding = "12px 16px";
  card.style.borderRadius = "14px";
  card.style.border = `2px solid ${UI.navy}`;
  card.style.fontFamily = "system-ui, sans-serif";
  card.style.boxShadow = `0 4px 14px ${UI.shadow}`;
  card.style.pointerEvents = "none"; // display-only; never blocks a click

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "8px";

  const title = document.createElement("span");
  title.textContent = "🕒 Day Progress";
  title.style.color = UI.navy;
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";

  const label = document.createElement("span");
  label.style.color = UI.goldText;
  label.style.fontWeight = "800";
  label.style.fontSize = "13px";
  label.style.whiteSpace = "nowrap";

  header.appendChild(title);
  header.appendChild(label);
  card.appendChild(header);

  const track = document.createElement("div");
  track.style.height = "12px";
  track.style.background = UI.track;
  track.style.borderRadius = "6px";
  track.style.overflow = "hidden";

  const bar = document.createElement("div");
  bar.style.height = "100%";
  bar.style.width = "0%";
  bar.style.background = UI.gold;
  bar.style.borderRadius = "6px";
  bar.style.transition = "width 0.45s ease"; // the bar glides as the day fills

  track.appendChild(bar);
  card.appendChild(track);

  document.body.appendChild(card);
  dayBarEl = bar;
  dayLabelEl = label;
  updateDayMeter(done, total);
}

// updateDayMeter(done, total): set the "Run X of Y" text and the bar width.
export function updateDayMeter(done: number, total: number): void {
  const clamped = Math.max(0, Math.min(total, done));
  if (dayLabelEl) dayLabelEl.textContent = `Run ${clamped} of ${total}`;
  if (dayBarEl) {
    dayBarEl.style.width = (total > 0 ? clamped / total : 0) * 100 + "%";
  }
}

// hideDayMeter(): remove the card (called on "Play Again" / reset).
export function hideDayMeter(): void {
  if (typeof document !== "undefined") {
    document.getElementById("day-meter")?.remove();
  }
  dayBarEl = null;
  dayLabelEl = null;
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
