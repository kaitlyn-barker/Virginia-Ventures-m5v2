// =============================================================================
// controls.ts — the flat-screen (browser) look + move controls, for BOTH a
// mouse/keyboard and a touchscreen (Chromebook / iPad, standard in 5th-grade
// classrooms). Inside a headset none of this runs — the head and thumbsticks
// take over — so everything here is guarded to the non-immersive (browser) view.
//
// What it wires up:
//   • LOOK — mouse: hold the RIGHT button and drag. Touch: drag one finger on
//     empty space. A short tap is left alone so it still selects a card (the
//     engine forwards taps to clickable entities).
//   • MOVE — mouse: the engine's built-in WASD / arrow keys. Touch: an on-screen
//     joystick (bottom-left) that we translate into those same WASD keys, so the
//     player glides at the same gentle browser walking pace.
//   • A one-time controls HINT that adapts to the device (mouse vs. touch).
//   • A teacher "R" restart key (flat screen only; behind a confirm).
//
// Moving the touch joystick through the SAME WASD keys the engine already binds
// (rather than shoving world.player around ourselves) matters: locomotion runs on
// a worker thread that owns the player's position, so a direct position write
// would just be overwritten next frame. Feeding the existing input is the way
// that actually sticks.
// =============================================================================

import { World, VisibilityState } from "@iwsdk/core";
import { UI } from "./ui-style.js";
import { resetGame } from "./reset.js";
import { Sfx } from "./sfx.js";
import { ProductionSystem } from "./production.js";

// -----------------------------------------------------------------------------
// CONSTANTS — the feel of the flat-screen controls. (World-setup-style tunables,
// kept here beside the code they drive, the same way index.ts keeps its own.)
// -----------------------------------------------------------------------------
const CONSTANTS = {
  lookSensitivity: 0.0025, // how fast a drag turns the view (radians per pixel)
  maxPitch: Math.PI / 2 - 0.05, // stop just short of straight up/down (no flipping)

  // Touch look: how far a finger must move before a drag counts as "looking"
  // (below this it stays a tap, so tapping a card still selects it).
  touchDragThreshold: 8, // pixels

  // The on-screen movement joystick (touch only).
  joystick: {
    size: 132, // diameter of the base ring, in CSS pixels
    thumb: 58, // diameter of the draggable thumb, in CSS pixels
    margin: 26, // gap from the bottom-left corner, in CSS pixels
    deadzone: 0.28, // ignore tiny wiggles near the center (0..1 of the radius)
    pressAt: 0.4, // how far toward an edge counts as "hold this direction" (0..1)
  },
};

// The WASD codes the engine's browser locomotion binds, in the order
// [forward, left, back, right]. We synthesize these from the joystick.
const MOVE_KEYS = { forward: "KeyW", left: "KeyA", back: "KeyS", right: "KeyD" };

export function setupBrowserControls(world: World): void {
  if (typeof document === "undefined") return; // headless safety
  const camera = world.camera;
  const canvas = world.renderer.domElement;
  const C = CONSTANTS;

  // 'YXZ' order: turn left/right (yaw) first, then look up/down (pitch), so the
  // horizon stays level as you drag.
  camera.rotation.order = "YXZ";
  let yaw = camera.rotation.y;
  let pitch = camera.rotation.x;

  const inBrowser = () =>
    world.visibilityState.value === VisibilityState.NonImmersive;

  // Apply a look delta (in pixels) to the camera, clamping pitch so it can't flip.
  const look = (deltaX: number, deltaY: number): void => {
    yaw -= deltaX * C.lookSensitivity; // drag right -> turn right
    pitch -= deltaY * C.lookSensitivity; // drag down -> look down
    pitch = Math.max(-C.maxPitch, Math.min(C.maxPitch, pitch));
    camera.rotation.set(pitch, yaw, 0);
    dismissHint(); // the player clearly knows how to look now
  };

  // ---------------------------------------------------------------------------
  // LOOK — one set of pointer handlers covers mouse right-drag AND touch drag.
  //   • Mouse: dragging begins immediately on a RIGHT-button press (the left
  //     button stays free for clicking objects, which the engine forwards).
  //   • Touch: a press starts as a "maybe" — only once the finger moves past a
  //     small threshold does it become a look-drag. Under the threshold it stays
  //     a tap, so the engine still gets it as a card selection.
  // ---------------------------------------------------------------------------
  let mode: "none" | "mouse" | "touchPending" | "touchLook" = "none";
  let pointerId = -1;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;

  // The browser's right-click menu would pop up mid-drag; suppress it.
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("pointerdown", (event) => {
    if (!inBrowser()) return;
    if (event.pointerType === "touch") {
      if (mode !== "none") return; // already tracking a finger
      mode = "touchPending";
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      // NOTE: no capture / preventDefault yet — a tap must still reach the engine.
    } else if (event.button === 2) {
      mode = "mouse";
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !inBrowser()) return;

    if (mode === "mouse" || mode === "touchLook") {
      look(event.clientX - lastX, event.clientY - lastY);
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }

    if (mode === "touchPending") {
      // Has the finger moved far enough to count as a look-drag (not a tap)?
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved > C.touchDragThreshold) {
        mode = "touchLook";
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId); // now it's a drag; keep the moves
      }
    }
  });

  const endPointer = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    if (mode === "mouse" || mode === "touchLook") {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* capture may already be gone */
      }
    }
    mode = "none";
    pointerId = -1;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  // ---------------------------------------------------------------------------
  // TEACHER RESTART — press "R" to start the whole day over (an escape hatch for
  // a stuck session). Behind a confirm() so a stray keypress can't wipe a good
  // run; flat-screen only (a headset has no keyboard, and the report's own "Play
  // Again" button covers that case). Resets the game in place — no page reload —
  // landing on a clean business picker.
  // ---------------------------------------------------------------------------
  window.addEventListener("keydown", (event) => {
    if (event.key !== "r" && event.key !== "R") return;
    if (!inBrowser()) return;
    if (
      window.confirm(
        "Restart the factory day? This starts over from the business picker.",
      )
    ) {
      resetGame(world);
    }
  });

  // ---------------------------------------------------------------------------
  // KEYBOARD CONTROLS — number keys 1–6 trigger the desk cards (in CONTROL order:
  // 1 Machine Speed, 2 Hire, 3 Order, 4 Repair, 5 Expand, 6 Start Line), matching
  // the digit shown on each card, for students who struggle with mouse/ray
  // precision. Flat-screen only; the ProductionSystem ignores keys for hidden or
  // tour-locked controls.
  // ---------------------------------------------------------------------------
  window.addEventListener("keydown", (event) => {
    if (!inBrowser()) return;
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= 6) {
      (world.getSystem(ProductionSystem) as ProductionSystem | undefined)?.pressControl(n - 1);
    }
  });

  // ---------------------------------------------------------------------------
  // TOUCH JOYSTICK — only on a touchscreen (a coarse pointer). It feeds the same
  // WASD keys the engine already binds for browser walking, so movement is
  // relative to where the player is looking, at the gentle browser pace.
  // ---------------------------------------------------------------------------
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  let joystickEl: HTMLElement | null = null;
  if (coarsePointer) {
    joystickEl = buildJoystick(C, inBrowser, dismissHint);
    joystickEl.style.display = "none"; // hidden until a business is picked
  }

  // The joystick is for WALKING, which only matters once the factory is running —
  // so keep it hidden during the business picker (where it would otherwise sit
  // over a choice card), and never show it in the headset. globals isn't
  // reactive, so poll cheaply until a business is picked, then settle.
  const updateJoystick = (): void => {
    if (!joystickEl) return;
    const picked = !!(world.globals as { activeFactory?: unknown }).activeFactory;
    joystickEl.style.display = inBrowser() && picked ? "" : "none";
  };
  if (joystickEl) {
    const waitForPick = (): void => {
      if ((world.globals as { activeFactory?: unknown }).activeFactory) {
        updateJoystick();
        return; // picked — stop polling
      }
      requestAnimationFrame(waitForPick);
    };
    requestAnimationFrame(waitForPick);
  }

  // ---------------------------------------------------------------------------
  // CONTROLS HINT — a small, one-time pill that teaches look + move, worded for
  // the device. Dismissed on first look/move, on tapping its ✕, or after a few
  // seconds — and remembered so it doesn't nag on the next run.
  // ---------------------------------------------------------------------------
  showControlsHint(coarsePointer);

  // The mute toggle (speaker button + "M" key).
  setupMuteControl();

  // Tuck the touch overlays away if the player enters the headset (belt-and-
  // suspenders — the DOM isn't drawn in XR anyway) and restore them on the way
  // back to the browser view.
  world.visibilityState.subscribe((state) => {
    updateJoystick();
    if (state !== VisibilityState.NonImmersive) dismissHint();
  });
}

// -----------------------------------------------------------------------------
// setupMuteControl — a small speaker button in the bottom-right corner that
// toggles all sound, mirrored by the "M" key. The preference is remembered in
// localStorage by the sound module, so it sticks across a refresh / next class.
// -----------------------------------------------------------------------------
function setupMuteControl(): void {
  if (typeof document === "undefined") return;

  const button = document.createElement("button");
  button.id = "mute-toggle";
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "1000";
  button.style.width = "44px";
  button.style.height = "44px";
  button.style.borderRadius = "50%";
  button.style.border = `2px solid ${UI.navy}`;
  button.style.background = UI.creamHud;
  button.style.boxShadow = `0 4px 14px ${UI.shadow}`;
  button.style.fontSize = "20px";
  button.style.lineHeight = "1";
  button.style.cursor = "pointer";

  const render = (): void => {
    const off = Sfx.isMuted();
    button.textContent = off ? "🔇" : "🔊";
    button.title = off ? "Sound off — click or press M" : "Sound on — click or press M";
    button.setAttribute("aria-label", off ? "Unmute sound" : "Mute sound");
  };
  render();

  button.addEventListener("click", () => {
    Sfx.toggleMuted();
    render();
  });
  document.body.appendChild(button);

  window.addEventListener("keydown", (event) => {
    if (event.key === "m" || event.key === "M") {
      Sfx.toggleMuted();
      render();
    }
  });
}

// -----------------------------------------------------------------------------
// buildJoystick — the on-screen movement stick. Returns a function that hides it.
// Drag the thumb; we read its offset as a direction and hold the matching WASD
// keys (8-way, full pace — plenty for gliding around the factory floor).
// -----------------------------------------------------------------------------
function buildJoystick(
  C: typeof CONSTANTS,
  inBrowser: () => boolean,
  onMove: () => void,
): HTMLElement {
  const J = C.joystick;
  const radius = J.size / 2;

  const base = document.createElement("div");
  base.id = "touch-joystick";
  base.style.position = "fixed";
  base.style.left = `${J.margin}px`;
  base.style.bottom = `${J.margin}px`;
  base.style.width = `${J.size}px`;
  base.style.height = `${J.size}px`;
  base.style.borderRadius = "50%";
  base.style.background = UI.creamHud;
  base.style.border = `2px solid ${UI.navy}`;
  base.style.boxShadow = `0 4px 14px ${UI.shadow}`;
  base.style.zIndex = "1000";
  base.style.touchAction = "none"; // we handle the gesture; don't scroll the page
  base.style.userSelect = "none";

  const thumb = document.createElement("div");
  thumb.style.position = "absolute";
  thumb.style.width = `${J.thumb}px`;
  thumb.style.height = `${J.thumb}px`;
  thumb.style.borderRadius = "50%";
  thumb.style.background = UI.gold;
  thumb.style.border = `2px solid ${UI.goldText}`;
  thumb.style.left = "50%";
  thumb.style.top = "50%";
  thumb.style.transform = "translate(-50%, -50%)";
  thumb.style.transition = "transform 0.08s ease-out";
  base.appendChild(thumb);
  document.body.appendChild(base);

  // The keys we are currently holding down, so we only fire keydown/keyup on a
  // real change (never a stream of repeats).
  const held = new Set<string>();
  const setHeld = (wanted: Set<string>): void => {
    for (const code of Object.values(MOVE_KEYS)) {
      if (wanted.has(code) && !held.has(code)) {
        held.add(code);
        window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
      } else if (!wanted.has(code) && held.has(code)) {
        held.delete(code);
        window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
      }
    }
  };
  const releaseAll = (): void => setHeld(new Set());

  let active = false;
  let jid = -1;

  base.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation(); // this gesture is the joystick's, not a look-drag
    active = true;
    jid = event.pointerId;
    base.setPointerCapture(event.pointerId);
  });

  base.addEventListener("pointermove", (event) => {
    if (!active || event.pointerId !== jid) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (event.clientX - cx) / radius; // -1..1 (past the edge clamps below)
    let dy = (event.clientY - cy) / radius;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }

    // Move the thumb to follow the finger (clamped inside the ring).
    thumb.style.transform = `translate(calc(-50% + ${dx * radius}px), calc(-50% + ${dy * radius}px))`;

    if (!inBrowser() || mag < J.deadzone) {
      releaseAll();
      return;
    }

    // Translate the vector into 8-way WASD. Screen-up (dy < 0) is forward.
    const wanted = new Set<string>();
    if (dy < -J.pressAt) wanted.add(MOVE_KEYS.forward);
    if (dy > J.pressAt) wanted.add(MOVE_KEYS.back);
    if (dx < -J.pressAt) wanted.add(MOVE_KEYS.left);
    if (dx > J.pressAt) wanted.add(MOVE_KEYS.right);
    setHeld(wanted);
    onMove(); // the player is clearly moving now — the hint can go
  });

  const end = (event: PointerEvent): void => {
    if (event.pointerId !== jid) return;
    active = false;
    jid = -1;
    releaseAll();
    thumb.style.transform = "translate(-50%, -50%)"; // spring back to center
    try {
      base.releasePointerCapture(event.pointerId);
    } catch {
      /* capture may already be gone */
    }
  };
  base.addEventListener("pointerup", end);
  base.addEventListener("pointercancel", end);

  return base;
}

// -----------------------------------------------------------------------------
// Controls hint — a one-time pill teaching look + move. Worded for the device,
// dismissible, and remembered so a second run doesn't show it again.
// -----------------------------------------------------------------------------
const HINT_STORAGE_KEY = "factory-controls-hint-dismissed";
let hintEl: HTMLElement | null = null;
let hintTimer: number | null = null;

function showControlsHint(touch: boolean): void {
  if (typeof document === "undefined") return;
  if (readDismissed()) return; // already dismissed on a previous run
  if (hintEl) return;

  const pill = document.createElement("div");
  pill.id = "controls-hint";
  pill.style.position = "fixed";
  pill.style.top = "18px";
  pill.style.left = "50%";
  pill.style.transform = "translateX(-50%)";
  pill.style.zIndex = "1001";
  pill.style.background = UI.creamHud;
  pill.style.border = `2px solid ${UI.navy}`;
  pill.style.borderRadius = "12px";
  pill.style.boxShadow = `0 4px 14px ${UI.shadow}`;
  pill.style.padding = "8px 12px";
  pill.style.display = "flex";
  pill.style.alignItems = "center";
  pill.style.gap = "10px";
  pill.style.fontFamily = "system-ui, sans-serif";
  pill.style.fontSize = "14px";
  pill.style.fontWeight = "700";
  pill.style.color = UI.navy;
  pill.style.transition = "opacity 0.4s ease";

  const text = document.createElement("span");
  text.textContent = touch
    ? "👆 Drag to look  •  use the stick to walk"
    : "🖱️ Right-drag to look  •  W A S D to walk";
  pill.appendChild(text);

  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "Dismiss controls hint");
  close.style.border = "none";
  close.style.background = UI.navy;
  close.style.color = UI.white;
  close.style.width = "22px";
  close.style.height = "22px";
  close.style.borderRadius = "50%";
  close.style.cursor = "pointer";
  close.style.fontWeight = "800";
  close.style.lineHeight = "1";
  close.addEventListener("click", () => dismissHint(true));
  close.addEventListener("pointerdown", (e) => e.stopPropagation());
  pill.appendChild(close);

  document.body.appendChild(pill);
  hintEl = pill;

  // Fade it out on its own after a while, even if the player never touches it.
  hintTimer = window.setTimeout(() => dismissHint(), 12000);
}

// Hide the hint. `remember` (set when the player explicitly dismisses or acts on
// it) persists the dismissal so the next run stays clean.
function dismissHint(remember = false): void {
  if (hintTimer !== null) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  if (remember) writeDismissed();
  if (!hintEl) return;
  const el = hintEl;
  hintEl = null;
  el.style.opacity = "0";
  window.setTimeout(() => el.remove(), 400);
}

// localStorage can throw in locked-down school browsers — never let it crash.
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeDismissed(): void {
  try {
    window.localStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    /* private mode / lockdown — the hint just shows again next time */
  }
}
