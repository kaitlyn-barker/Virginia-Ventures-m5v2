// =============================================================================
// report-summary.ts — the teacher-facing "My Day" panel (browser only).
//
// When the End of Day report appears, this drops a small DOM card in the top-
// right corner with the run's CLASS CODE (a short human-readable string a teacher
// can collect on paper or in an LMS with zero backend) and a "Copy my report"
// button that puts the full plain-text recap on the clipboard. It is a DOM
// overlay, so it shows in the BROWSER view only — in a headset the in-world
// report board carries the recap + class code instead.
//
// Everything is guarded (clipboard + DOM can be locked down in school browsers),
// so a failure degrades quietly instead of crashing the game.
// =============================================================================

import { UI } from "./ui-style.js";

let panelEl: HTMLElement | null = null;

// showReportSummary(fullText, classCode): drop the teacher card into the page.
// `fullText` is the whole plain-text recap (copied by the button); `classCode`
// is the short code shown prominently and also included in fullText.
export function showReportSummary(fullText: string, classCode: string): void {
  if (typeof document === "undefined") return;
  hideReportSummary(); // never stack two

  const card = document.createElement("div");
  card.id = "report-summary";
  card.style.position = "fixed";
  card.style.top = "16px";
  card.style.right = "16px";
  card.style.zIndex = "1000";
  card.style.maxWidth = "300px";
  card.style.background = UI.creamHud;
  card.style.border = `2px solid ${UI.navy}`;
  card.style.borderRadius = "14px";
  card.style.padding = "12px 14px";
  card.style.fontFamily = "system-ui, sans-serif";
  card.style.boxShadow = `0 4px 14px ${UI.shadow}`;

  const title = document.createElement("div");
  title.textContent = "📋 Teacher Report";
  title.style.color = UI.navy;
  title.style.fontWeight = "800";
  title.style.fontSize = "15px";
  title.style.marginBottom = "8px";
  card.appendChild(title);

  const codeLabel = document.createElement("div");
  codeLabel.textContent = "Class code";
  codeLabel.style.color = UI.goldText;
  codeLabel.style.fontWeight = "700";
  codeLabel.style.fontSize = "11px";
  codeLabel.style.textTransform = "uppercase";
  codeLabel.style.letterSpacing = "0.05em";
  card.appendChild(codeLabel);

  // The class code, monospace + selectable so a teacher can read/copy it directly.
  const code = document.createElement("div");
  code.textContent = classCode;
  code.style.color = UI.navy;
  code.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
  code.style.fontWeight = "700";
  code.style.fontSize = "15px";
  code.style.userSelect = "all";
  code.style.wordBreak = "break-all";
  code.style.margin = "2px 0 10px";
  card.appendChild(code);

  const button = document.createElement("button");
  button.textContent = "📋 Copy my report";
  button.style.width = "100%";
  button.style.border = "none";
  button.style.background = UI.gold;
  button.style.color = UI.white;
  button.style.fontWeight = "800";
  button.style.fontSize = "14px";
  button.style.padding = "9px 10px";
  button.style.borderRadius = "10px";
  button.style.cursor = "pointer";
  button.addEventListener("click", () => {
    copyText(fullText).then((ok) => {
      button.textContent = ok ? "✓ Copied!" : "Select the code above to copy";
      window.setTimeout(() => {
        button.textContent = "📋 Copy my report";
      }, 2000);
    });
  });
  card.appendChild(button);

  document.body.appendChild(card);
  panelEl = card;
}

// hideReportSummary(): remove the teacher card (called on "Play Again" / reset).
export function hideReportSummary(): void {
  if (typeof document !== "undefined") {
    document.getElementById("report-summary")?.remove();
  }
  panelEl = null;
}

// Copy text to the clipboard, guarded — the async Clipboard API is blocked in
// some school browsers, so fall back to a hidden textarea + execCommand, and give
// up quietly (returning false) if even that is locked down.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

// (Referenced only to keep the live handle around; the id lookup is the source of
// truth for removal, so this stays robust even across a hot reload.)
void panelEl;
