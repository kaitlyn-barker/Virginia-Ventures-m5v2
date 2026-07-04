// =============================================================================
// dev.ts — QA / testing query-string parameters.
//
// These are OPT-IN via the URL, so they never fire in normal classroom use, but
// they make a full playthrough testable in minutes instead of a long real-time
// session. See the QA script in README.md.
//
//   ?fast=1                 — shrink the run gates so Phase 3 and the End of Day
//                             report arrive after just a couple of runs.
//   ?challenge=<id>         — force a specific Phase-3 setback when the competitor
//                             opens, instead of the weighted random pick. One of:
//                             breakdown | delay | walkout | pricewar
// =============================================================================

import { RUNS_BEFORE_COMPETITION, RUNS_BEFORE_CLOSING } from "./config.js";

// Read one query-string param, guarded (some locked-down browsers can throw).
function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

// ?fast=1 — shrink the run-count gates for quick QA.
export function devFast(): boolean {
  return param("fast") === "1";
}

// The effective run gates (shrunk to 1 / 2 under ?fast=1, else the real values).
export function runsBeforeCompetition(): number {
  return devFast() ? 1 : RUNS_BEFORE_COMPETITION;
}
export function runsBeforeClosing(): number {
  return devFast() ? 2 : RUNS_BEFORE_CLOSING;
}

// ?challenge=<id> — force a specific Phase-3 challenge (or null for the normal
// weighted random pick). Only the known ids are honored.
const FORCEABLE = ["breakdown", "delay", "walkout", "pricewar"];
export function forcedChallenge(): string | null {
  const c = param("challenge");
  return c && FORCEABLE.includes(c) ? c : null;
}
