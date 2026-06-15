// =============================================================================
// ui-style.ts — the ONE place the polished "Market Harvest" UI look is defined.
// -----------------------------------------------------------------------------
// Both the 2D HTML dashboard (hud.ts) AND the in-world panels (environment.ts)
// import these, so the corner overlay and the scene boards always match exactly.
//
// It deliberately imports NOTHING — keeping it dependency-free means hud.ts and
// environment.ts can both pull it in with no risk of a circular import.
//
// The palette mirrors the farming module (Module 4): cream panels, navy text,
// warm gold accents. Colors are plain CSS strings so they drop straight into
// both DOM styles and canvas `fillStyle`.
// =============================================================================

export const UI = {
  cream: "#f3e9d2", // panel background (parchment)
  creamHud: "rgba(255, 252, 244, 0.95)", // the slightly lighter, see-through HUD card
  innerBox: "#fbf3df", // the highlighted inner box on the welcome card
  navy: "#1f3a5f", // headings, labels, borders
  gold: "#c8962a", // accent: selected borders, buttons, header bands
  goldText: "#8a6118", // readable gold for text/numbers on cream (AA contrast)
  track: "#e4ddd0", // the empty part of a meter bar
  white: "#ffffff", // text on colored bands/pills
  shadow: "rgba(31, 58, 95, 0.30)", // soft navy drop shadow
};

// One meter's look: the emoji that leads its row, the bright color of its bar,
// and the darker, high-contrast color used for its number/value text on cream.
export type MeterStyle = { icon: string; bar: string; text: string };

// Keyed by the EXACT board label (CONSTANTS.readouts), so the HUD row and the
// in-world board row for a given score always share an icon + colors.
export const METER_STYLE: Record<string, MeterStyle> = {
  "Production Output": { icon: "📦", bar: "#4a8fd6", text: "#1e5fa8" }, // blue — volume made
  "Raw Materials": { icon: "🪵", bar: "#b07a3c", text: "#7a5320" }, // woody amber — the supply
  "Worker Satisfaction": { icon: "🙂", bar: "#5fae4a", text: "#2e7d32" }, // green — a happy crew
  Price: { icon: "🪙", bar: "#c8962a", text: "#8a6118" }, // gold — coins per product
  Costs: { icon: "💸", bar: "#c0673a", text: "#9a4a28" }, // orange-red — coins paid OUT to run
  Profit: { icon: "💰", bar: "#7b61c8", text: "#5a3fa0" }, // purple — coins you KEEP from each sale
};

// The order the six meters appear, top to bottom (matches CONSTANTS.readouts).
export const METER_ORDER = [
  "Production Output",
  "Raw Materials",
  "Worker Satisfaction",
  "Price",
  "Costs",
  "Profit",
];

// The little status pill in the HUD header. Each "tone" is a background color
// the pill uses to signal the phase of the day (white text reads on all of them).
export const STATUS_TONE: Record<string, string> = {
  ready: "#2e7d32", // green — "Getting Ready" (still choosing)
  active: "#8a6118", // gold — open and running
  alert: "#b3402e", // red — a competitor / challenge has struck
  done: "#1f3a5f", // navy — the day is over
};
