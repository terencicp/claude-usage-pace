// Claude Usage Pace — content script
// ---------------------------------------------------------------------------
// Recolors progress bars on claude.ai's usage page so the bar color reflects
// "are you on pace?" rather than just "how full is the bar?".
//
// Bars with a parseable time-window reset ("Resets in 4 hr 52 min",
// "Resets Thu 6:00 PM", "Resets Thu 5:59 PM") are mapped onto a green→yellow→red
// OKLCH gradient based on usage vs. elapsed-window fraction. Every other
// progress bar on the page is forced to a neutral grey so the default blue
// accent doesn't compete with the paced ones.
//
// Math (verified — see README):
//   elapsed_pct = how far we are through the current reset window
//   pace        = usage_pct / elapsed_pct
//   if pace ≤ 1.0:  position = pace^k × 60.5    (k = 4 session, 8 weekly)
//   if pace > 1.0:  position = 60.5 + clamp((pace − 1) / 0.18, 0, 1) × 39.5
//
// 60.5 is the perceptual yellow midpoint of the gradient
//   linear-gradient(in oklch 90deg, #066c1c 21%, #a62e3f 100%)
// (i.e. midway between the green and red stops, since the gradient is now
// symmetric — green:21–60.5 spans 39.5, yellow→red:60.5–100 spans 39.5).
//
// Positions 0–21 also map to solid green because the gradient extends its
// first stop's color leftward — so under-pace bars naturally land in pure
// green without needing an extreme exponent.
//
// Session bars warn earlier (k=4); weekly bars trust the user more (k=8).
// Over-pace behavior (pace > 1.0) is identical for both, saturating to
// red at pace ≈ 1.18×.
//
// Grace period: on the local calendar date that a weekly bar resets, weekly
// pace isn't actionable — either the remaining quota is about to be wiped,
// or it just was and any usage in the few hours since looks comically fast
// against an almost-empty elapsed-window.

(() => {
  "use strict";

  // ──────────────────────────────────────────────────────────────────────────
  // Config
  // ──────────────────────────────────────────────────────────────────────────

  const SESSION_WINDOW_MIN = 5 * 60; // session bar = 5 h window
  const WEEK_WINDOW_MIN = 7 * 24 * 60; // weekly bars = 7 d window
  const GRADIENT_START = 21; // first stop's gradient %
  const KNEE_POSITION = (GRADIENT_START + 100) / 2; // 60.5 — yellow midpoint
  const NEUTRAL_COLOR = "oklch(55% 0 0)"; // grey for non-paced bars
  const RECHECK_INTERVAL_MS = 60_000; // resample once a minute

  // Under-pace exponents. The session window is short (5 h), so we want to
  // warn early if usage outruns time-elapsed. The weekly window is long
  // enough to absorb a single heavy day, so we trust the user further:
  // even pace 0.85× should still look mostly green. Pace > 1.0 behaves
  // identically for both — over-pace is over-pace.
  const UNDER_PACE_EXPONENT = { session: 4, weekly: 8 };

  // ──────────────────────────────────────────────────────────────────────────
  // Pace → CSS color, sampled along your OKLCH gradient:
  //   linear-gradient(in oklch 90deg, #066c1c 21%, #a62e3f 100%)
  // Anything below the 21% stop renders as pure green, since the gradient
  // extends its first stop's color leftward.
  // ──────────────────────────────────────────────────────────────────────────

  function paceColor(position) {
    const p = Math.max(0, Math.min(100, position));
    if (p <= GRADIENT_START) return "#066c1c";
    const t = ((p - GRADIENT_START) / (100 - GRADIENT_START)) * 100;
    return `color-mix(in oklch, #066c1c, #a62e3f ${t.toFixed(2)}%)`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reset-text parsing
  // ──────────────────────────────────────────────────────────────────────────

  function parseRelative(text) {
    // English: "Resets in 4 hr 52 min" / "Resets in 23 min" / "Resets in 2 hr"
    // Spanish: "Se restablece en 4 h 12 min" / "Se restablece en 23 min"
    const m = text.match(
      /(Resets\s+in|Se\s+restablece\s+en)\s+(?:(\d+)\s*(?:hr|h|hora|horas))?\s*(?:(\d+)\s*(?:min|mins|minutos))?/i,
    );
    if (!m || (!m[2] && !m[3])) return null;
    return parseInt(m[2] || "0", 10) * 60 + parseInt(m[3] || "0", 10);
  }

  const DAY_MAP = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    dom: 0,
    lun: 1,
    mar: 2,
    mie: 3,
    jue: 4,
    vie: 5,
    sab: 6,
  };

  function normalizeText(text) {
    return (text || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  }

  function parseWeekday(text) {
    // English: "Resets Thu 6:00 PM"
    // Spanish: "Se restablece jue, 18:00"
    const m12 = text.match(
      /Resets\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\w*\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    );
    const m24 = text.match(
      /Se\s+restablece\s+([A-Za-z\u00C0-\u017F]{2,})\w*\s*,?\s*(\d{1,2}):(\d{2})/i,
    );
    if (!m12 && !m24) return null;

    const now = new Date();
    const next = new Date(now);
    let targetDay;
    let hour;
    let minute;

    if (m12) {
      targetDay = DAY_MAP[m12[1].slice(0, 3).toLowerCase()];
      hour = parseInt(m12[2], 10);
      minute = parseInt(m12[3], 10);
      if (m12[4].toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (m12[4].toUpperCase() === "AM" && hour === 12) hour = 0;
    } else {
      const dayKey = normalizeText(m24[1]).slice(0, 3);
      targetDay = DAY_MAP[dayKey];
      hour = parseInt(m24[2], 10);
      minute = parseInt(m24[3], 10);
    }

    if (targetDay === undefined) return null;
    next.setHours(hour, minute, 0, 0);
    let daysAhead = targetDay - now.getDay();
    if (daysAhead < 0) daysAhead += 7;
    if (daysAhead === 0 && next <= now) daysAhead = 7;
    next.setDate(next.getDate() + daysAhead);

    return Math.max(0, Math.floor((next - now) / 60_000));
  }

  /**
   * Look up the section heading that contains a given progressbar — returns
   * 'session', 'weekly', or null. This is the authoritative signal for
   * deciding which time window a bar belongs to, because Claude switches
   * weekly bars to the "Resets in X hr Y min" format in their final 24 h
   * (which would otherwise be indistinguishable from a session bar).
   */
  function inferKindFromSection(pb) {
    let node = pb;
    while (node && node.tagName !== "SECTION") node = node.parentElement;
    if (!node) return null;
    const h3 = node.querySelector("h3");
    if (!h3) return null;
    const text = normalizeText(h3.textContent || "");
    if (text.includes("weekly") || text.includes("limites semanales"))
      return "weekly";
    if (text.includes("plan usage") || text.includes("limites de uso del plan"))
      return "session";
    return null;
  }

  /**
   * Decide a bar's kind from its section heading first, with a magnitude
   * fallback: if more than 5 h remain it can't be a session bar.
   */
  function inferKind(pb, remainingMin) {
    return (
      inferKindFromSection(pb) ||
      (remainingMin > SESSION_WINDOW_MIN ? "weekly" : "session")
    );
  }

  /**
   * Returns { elapsedPct, kind } where kind ∈ {'session','weekly'}. Returns
   * null if the reset text doesn't describe a parseable time window.
   */
  function elapsedAndKind(resetText, pb) {
    if (!resetText) return null;
    const now = new Date();

    const rel = parseRelative(resetText);
    if (rel !== null) {
      const kind = inferKind(pb, rel);
      const win = kind === "session" ? SESSION_WINDOW_MIN : WEEK_WINDOW_MIN;
      return {
        elapsedPct: ((win - rel) / win) * 100,
        kind,
      };
    }
    const wk = parseWeekday(resetText);
    if (wk !== null) {
      return {
        elapsedPct: ((WEEK_WINDOW_MIN - wk) / WEEK_WINDOW_MIN) * 100,
        kind: "weekly",
      };
    }
    return null;
  }

  function computePace(usagePct, resetText, pb) {
    const e = elapsedAndKind(resetText, pb);
    if (!e) return null;
    const elapsedPct = Math.max(0, Math.min(100, e.elapsedPct));

    // Edge case: window just opened.
    if (elapsedPct < 0.5) {
      return {
        position: usagePct > 0 ? 100 : 0,
        pace: usagePct > 0 ? Infinity : 0,
        elapsedPct,
        kind: e.kind,
        resetsToday: e.resetsToday,
      };
    }

    const pace = usagePct / elapsedPct;
    const exponent = UNDER_PACE_EXPONENT[e.kind];
    let position;
    if (pace <= 1.0) {
      position = Math.pow(pace, exponent) * KNEE_POSITION;
    } else {
      position =
        KNEE_POSITION +
        Math.min(1.0, (pace - 1.0) / 0.18) * (100 - KNEE_POSITION);
    }
    return {
      position: Math.max(0, Math.min(100, position)),
      pace,
      elapsedPct,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOM
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Walk up from a progressbar until we find an ancestor whose subtree contains
   * a leaf <span> starting with "Resets " — that's the row sublabel.
   *
   * Crucially: we *abort* as soon as the current ancestor contains more than
   * one progressbar, because that means we've crossed out of this row into the
   * surrounding section. Without this guard, bars without their own "Resets…"
   * text (Claude Design, routine runs, extra usage spend) would inherit the
   * reset string from a sibling row and get incorrectly paced.
   */
  function findResetText(progressbar) {
    let row = progressbar.parentElement;
    for (let i = 0; row && i < 10; i++, row = row.parentElement) {
      const barCount = row.querySelectorAll(
        '[role="progressbar"][aria-label="Usage"]',
      ).length;
      if (barCount > 1) return null; // crossed a row boundary
      for (const span of row.querySelectorAll("span")) {
        if (span.children.length) continue;
        const t = (span.textContent || "").trim();
        if (/^(Resets\s|Se\s+restablece\b)/i.test(t)) return t;
      }
    }
    return null;
  }

  /**
   * Idempotent style application — uses a WeakMap-based "last applied" cache
   * so MutationObserver feedback loops self-terminate.
   */
  const lastApplied = new WeakMap();
  function applyStyle(fill, color) {
    if (lastApplied.get(fill) === color) return;
    fill.style.setProperty("background-color", color, "important");
    fill.style.setProperty("background-image", "none", "important");
    lastApplied.set(fill, color);
  }

  /** Format pace as a percentage string: 0.68 → "68%", 1.20 → "120%", ∞ → "∞". */
  function formatPace(pace) {
    return Number.isFinite(pace) ? `${Math.round(pace * 100)}%` : "∞";
  }

  /**
   * Locate the "X% used" span associated with a progressbar. Returns either
   * a fresh leaf span (first run) or a previously-augmented wrapper span.
   */
  function findUsedSpan(pb) {
    let row = pb.parentElement;
    for (let i = 0; row && i < 6; i++, row = row.parentElement) {
      const barCount = row.querySelectorAll(
        '[role="progressbar"][aria-label="Usage"]',
      ).length;
      if (barCount > 1) return null;
      for (const s of row.querySelectorAll("span")) {
        if (
          s.hasAttribute("data-pace-used") ||
          s.hasAttribute("data-pace-line")
        )
          continue;
        if (s.hasAttribute("data-pace-augmented")) return s;
        if (s.children.length === 0) {
          const t = (s.textContent || "").trim();
          if (/^\d+%\s*used$/i.test(t) || /^\d+%\s*usado$/i.test(t)) return s;
        }
      }
    }
    return null;
  }

  /**
   * Augment the "X% used" span with a small second line showing pace.
   * Idempotent: subsequent calls only update text/color when they actually
   * change, so the MutationObserver doesn't loop on our own writes.
   */
  function detectLocale(resetText, usedText) {
    const combined = normalizeText(`${resetText || ""} ${usedText || ""}`);
    if (combined.includes("se restablece") || combined.includes("usado"))
      return "es";
    return "en";
  }

  function augmentUsedSpan(
    usedSpan,
    usagePct,
    result,
    color,
    resetText,
    usedText,
  ) {
    let inner = usedSpan.querySelector(":scope > [data-pace-used]");
    let paceLine = usedSpan.querySelector(":scope > [data-pace-line]");
    let locale = usedSpan.dataset.paceLocale;

    if (!locale) {
      locale = detectLocale(resetText, usedText);
      usedSpan.dataset.paceLocale = locale;
    }

    if (!inner || !paceLine) {
      // First run on this span — restructure into a flex column.
      usedSpan.textContent = "";
      usedSpan.style.setProperty("display", "inline-flex", "important");
      usedSpan.style.setProperty("flex-direction", "column", "important");
      usedSpan.style.setProperty("align-items", "center", "important");
      usedSpan.style.setProperty("text-align", "center", "important");
      usedSpan.style.setProperty("line-height", "1.15", "important");
      usedSpan.setAttribute("data-pace-augmented", "1");

      inner = document.createElement("span");
      inner.setAttribute("data-pace-used", "1");
      inner.style.setProperty("white-space", "nowrap", "important");
      usedSpan.appendChild(inner);

      paceLine = document.createElement("span");
      paceLine.setAttribute("data-pace-line", "1");
      paceLine.style.setProperty("font-size", "0.78em", "important");
      paceLine.style.setProperty("white-space", "nowrap", "important");
      paceLine.style.setProperty("margin-top", "1px", "important");
      paceLine.style.setProperty(
        "font-variant-numeric",
        "tabular-nums",
        "important",
      );
      usedSpan.appendChild(paceLine);
    }

    const paceLabel = locale === "es" ? "Ritmo" : "Pace";
    const usedLabel = locale === "es" ? "usado" : "used";
    const paceText = `${paceLabel}: ${formatPace(result.pace)}`;
    if (inner.textContent !== paceText) inner.textContent = paceText;

    const lineText = `${usagePct}% ${usedLabel}`;
    if (paceLine.textContent !== lineText) paceLine.textContent = lineText;

    if (inner.dataset.appliedColor !== color) {
      inner.style.setProperty("color", color, "important");
      inner.dataset.appliedColor = color;
    }
  }

  function centerPlainUsedSpan(pb) {
    let row = pb.parentElement;
    for (let i = 0; row && i < 6; i++, row = row.parentElement) {
      const barCount = row.querySelectorAll(
        '[role="progressbar"][aria-label="Usage"]',
      ).length;
      if (barCount > 1) return;
      for (const s of row.querySelectorAll("span")) {
        if (s.hasAttribute("data-pace-augmented")) continue;
        if (s.children.length === 0) {
          const t = (s.textContent || "").trim();
          if (/^\d+%\s*used$/i.test(t) || /^\d+%\s*usado$/i.test(t)) {
            s.style.setProperty("display", "inline-block", "important");
            s.style.setProperty("text-align", "center", "important");
            return;
          }
        }
      }
    }
  }

  /**
   * Pick a tick color that contrasts with the page behind it. We can't sample
   * the track itself reliably — Claude paints it with a translucent fill like
   * rgba(0, 0, 0, 0.08) that *renders* light on a white page and dark on a
   * dark page, but whose raw RGB is identical in both themes. So we walk up
   * the ancestor chain skipping any near-translucent layer until we find a
   * fully opaque background to sample (usually <body>), then judge luminance.
   * Falls back to prefers-color-scheme if the entire chain is transparent.
   */
  function pickTickColor(pb) {
    for (let node = pb; node; node = node.parentElement) {
      const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
      if (!m || m.length < 3) continue;
      const alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
      if (alpha < 0.95) continue;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum < 128 ? "#f5f5f5" : "#121212";
    }
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "#f5f5f5"
      : "#121212";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // "You are here" tick — a 2px vertical line at elapsedPct along the bar.
  // Attached to the bar's parent (not the bar itself) so it can extend above
  // and below the bar height; the bar's `overflow: hidden` would clip it.
  // ──────────────────────────────────────────────────────────────────────────

  function ensureTick(pb, elapsedPct) {
    const host = pb.parentElement;
    if (!host) return;

    if (!host.hasAttribute("data-pace-tick-host")) {
      const cs = getComputedStyle(host);
      if (cs.position === "static")
        host.style.setProperty("position", "relative", "important");
      host.setAttribute("data-pace-tick-host", "1");
    }

    let tick = host.querySelector(":scope > [data-pace-tick]");
    if (!tick) {
      tick = document.createElement("div");
      tick.setAttribute("data-pace-tick", "1");
      Object.assign(tick.style, {
        position: "absolute",
        top: "50%",
        width: "2px",
        height: "calc(100% + 8px)",
        transform: "translate(-50%, -50%)",
        borderRadius: "1px",
        pointerEvents: "none",
        zIndex: "2",
      });
      host.appendChild(tick);
    }

    const leftStr = `${elapsedPct.toFixed(2)}%`;
    if (tick.style.left !== leftStr) tick.style.left = leftStr;

    const tickColor = pickTickColor(pb);
    if (tick.dataset.appliedColor !== tickColor) {
      tick.style.setProperty("background-color", tickColor, "important");
      tick.dataset.appliedColor = tickColor;
    }
  }

  function removeTick(pb) {
    const host = pb.parentElement;
    if (!host) return;
    const tick = host.querySelector(":scope > [data-pace-tick]");
    if (tick) tick.remove();
  }

  function processPage() {
    const bars = document.querySelectorAll(
      '[role="progressbar"][aria-label="Usage"]',
    );
    for (const pb of bars) {
      const fill = pb.firstElementChild;
      if (!fill) continue;

      const usagePct = parseInt(pb.getAttribute("aria-valuenow") || "0", 10);
      const resetText = findResetText(pb);
      const result = computePace(usagePct, resetText, pb);

      if (result) {
        const color = paceColor(result.position);
        applyStyle(fill, color);
        ensureTick(pb, result.elapsedPct);
        const usedSpan = findUsedSpan(pb);
        if (usedSpan) {
          const usedText = (usedSpan.textContent || "").trim();
          augmentUsedSpan(
            usedSpan,
            usagePct,
            result,
            color,
            resetText,
            usedText,
          );
        }
      } else {
        applyStyle(fill, NEUTRAL_COLOR);
        removeTick(pb);
        centerPlainUsedSpan(pb);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Run on load, on mutations, and on a 1-min ticker (since time progresses).
  // ──────────────────────────────────────────────────────────────────────────

  let pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      try {
        processPage();
      } catch (e) {
        console.warn("[usage-pace]", e);
      }
    }, 50);
  }
  schedule();

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "aria-valuenow", "aria-label"],
  });

  setInterval(schedule, RECHECK_INTERVAL_MS);
})();
