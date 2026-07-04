// =============================================================================
// resilience.ts — keep the factory standing when the browser has a bad moment.
// -----------------------------------------------------------------------------
// School devices (Chromebooks, shared iPads, low-memory laptops) are where this
// game lives, and they DO hiccup: the graphics card can drop the whole 3D
// canvas under memory pressure, or one system can hit a bad value and throw. On
// a normal page either of those freezes everything with a black screen and a
// wall of red console errors — a terrible moment in front of a class.
//
// This module adds two quiet safety nets so a hiccup stays a hiccup:
//
//   1. A SYSTEM ERROR BOUNDARY — if any one system throws while updating, we
//      catch it, log it ONCE, and let every other system keep running. One bad
//      system goes idle for a frame instead of taking the whole game down.
//
//   2. A GRAPHICS-CONTEXT SAFETY CARD — if the browser loses the WebGL context
//      (the 3D canvas), we show a friendly, kid-readable "click to restart" card
//      instead of a frozen black screen.
//
// Both are wired up ONCE from index.ts, AFTER every system is registered.
// =============================================================================

import { World } from "@iwsdk/core";
import { UI } from "./ui-style.js";

// installResilience(world): turn on both safety nets. Call once at startup,
// after buildEnvironment has registered all the systems (so the error boundary
// can wrap every one of them).
export function installResilience(world: World): void {
  installSystemErrorBoundary(world);
  installContextLossCard(world);
}

// =============================================================================
// 1. SYSTEM ERROR BOUNDARY
// -----------------------------------------------------------------------------
// The frame loop is: renderer.setAnimationLoop → world.update → each system's
// update(). That loop has no try/catch of its own, so a throw in ONE system
// bubbles out and (a) skips every system after it that frame and (b) re-throws
// every frame, flooding the console. We wrap each system's update() in a
// try/catch so a throw is contained to that system and logged just once.
// =============================================================================

// How elics stores a system at runtime: an update method and a class name we can
// name in the log. (getSystems() isn't in the public World type, so we reach for
// it through a narrow cast below.)
type RuntimeSystem = {
  update: (delta: number, time: number) => void;
  constructor: { name: string };
};

// Systems we've already wrapped, so a second install (or a re-registered system)
// never double-wraps and stacks try/catches.
const wrapped = new WeakSet<object>();

function installSystemErrorBoundary(world: World): void {
  const systems =
    (world as unknown as { getSystems?: () => RuntimeSystem[] }).getSystems?.() ??
    [];
  for (const system of systems) wrapSystemUpdate(system);
}

// Replace one system's update() with a guarded version. The first crash is
// logged (with a plain-language note and the real error for a developer); after
// that the same system stays quiet so the console isn't buried. If the trouble
// was a one-frame fluke, the system simply works again next frame.
function wrapSystemUpdate(system: RuntimeSystem): void {
  if (!system || typeof system.update !== "function" || wrapped.has(system)) {
    return;
  }
  wrapped.add(system);

  const name = system.constructor?.name ?? "System";
  const original = system.update.bind(system);
  let alreadyLogged = false;

  system.update = (delta: number, time: number): void => {
    try {
      original(delta, time);
    } catch (error) {
      if (!alreadyLogged) {
        alreadyLogged = true;
        console.error(
          `[factory] ${name} hit a snag and was skipped this frame — the rest ` +
            `of the game keeps running. (This note shows once.)`,
          error,
        );
      }
    }
  };
}

// =============================================================================
// 2. GRAPHICS-CONTEXT SAFETY CARD
// -----------------------------------------------------------------------------
// When the GPU drops the 3D canvas, the browser fires "webglcontextlost" on the
// canvas element and the picture freezes. We call preventDefault() (which tells
// the browser we'd accept a restore, keeping the canvas from dying permanently)
// and put up a calm full-screen card telling the student to click to restart. A
// reload is the most reliable fix on a school device, so that's what the button
// does.
// =============================================================================

function installContextLossCard(world: World): void {
  if (typeof document === "undefined") return; // headless safety
  const canvas = world.renderer?.domElement as HTMLCanvasElement | undefined;
  if (!canvas) return;

  canvas.addEventListener(
    "webglcontextlost",
    (event: Event) => {
      // Signal that we intend to recover — without this the context is gone for
      // good and no "restored" event can ever fire.
      event.preventDefault();
      showReloadCard();
    },
    false,
  );
}

// The card is built at most once (a lost context can fire more than one event).
let reloadCard: HTMLElement | null = null;

function showReloadCard(): void {
  if (typeof document === "undefined" || reloadCard) return;

  // A soft dim backdrop over the whole screen. This overlay is the ONE that IS
  // clickable (the HUD and toasts are pointer-events:none), so the button works.
  const overlay = document.createElement("div");
  overlay.id = "factory-reload-card";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2000"; // above the HUD (1000) and coin toast (1002)
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(31, 58, 95, 0.55)"; // navy wash
  overlay.style.fontFamily = "system-ui, sans-serif";

  // The parchment card, matching the game's cream + navy look.
  const card = document.createElement("div");
  card.style.background = UI.cream;
  card.style.border = `3px solid ${UI.navy}`;
  card.style.borderRadius = "16px";
  card.style.padding = "28px 32px";
  card.style.maxWidth = "360px";
  card.style.textAlign = "center";
  card.style.boxShadow = `0 8px 26px ${UI.shadow}`;

  const heading = document.createElement("div");
  heading.textContent = "🔧 The factory needs a quick restart";
  heading.style.color = UI.navy;
  heading.style.fontWeight = "800";
  heading.style.fontSize = "18px";
  heading.style.marginBottom = "10px";

  const body = document.createElement("div");
  body.textContent =
    "The screen took a little break. Click the button to load it back up — your class code stays the same.";
  body.style.color = UI.navy;
  body.style.fontSize = "14px";
  body.style.lineHeight = "1.4";
  body.style.marginBottom = "18px";

  const button = document.createElement("button");
  button.textContent = "Reload the factory";
  button.style.background = UI.gold;
  button.style.color = UI.white;
  button.style.fontWeight = "800";
  button.style.fontSize = "15px";
  button.style.border = "none";
  button.style.borderRadius = "10px";
  button.style.padding = "10px 22px";
  button.style.cursor = "pointer";
  button.onclick = () => {
    try {
      window.location.reload();
    } catch {
      /* if reload is blocked, the card just stays up — nothing worse happens */
    }
  };

  card.appendChild(heading);
  card.appendChild(body);
  card.appendChild(button);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  reloadCard = overlay;
}
