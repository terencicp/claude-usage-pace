// Claude Usage Pace - shared config and color helpers
(() => {
  "use strict";

  const root = window;
  const ns = (root.__usagePace = root.__usagePace || {});

  ns.SESSION_WINDOW_MIN = 5 * 60; // session bar = 5 h window
  ns.WEEK_WINDOW_MIN = 7 * 24 * 60; // weekly bars = 7 d window
  ns.GRADIENT_START = 21; // first stop's gradient %
  ns.KNEE_POSITION = (ns.GRADIENT_START + 100) / 2; // yellow midpoint
  ns.NEUTRAL_COLOR = "oklch(55% 0 0)"; // grey for non-paced bars
  ns.BAR_HEIGHT = "8px"; // site's own bars are a skinny 4 px
  ns.RECHECK_INTERVAL_MS = 60_000; // resample once a minute
  ns.USAGE_BAR_SELECTOR =
    '[role="progressbar"][aria-label="Usage"], [role="meter"][aria-labelledby]';
  // Model-specific limits can prefix the reset with a description and middle dot.
  ns.RESET_TEXT_RE = /(?:^|·\s*)(Resets\s|Se\s+restablece\b)/i;
  ns.USED_TEXT_RE = /^\d+%\s*used$/i;
  ns.USED_TEXT_ES_RE = /^\d+%\s*usado$/i;

  // Under-pace exponents.
  ns.UNDER_PACE_EXPONENT = { session: 4, weekly: 8 };

  // Pace to CSS color sampled along the OKLCH gradient.
  ns.paceColor = function paceColor(position) {
    const p = Math.max(0, Math.min(100, position));
    if (p <= ns.GRADIENT_START) return "#066c1c";
    const t = ((p - ns.GRADIENT_START) / (100 - ns.GRADIENT_START)) * 100;
    return `color-mix(in oklch, #066c1c, #a62e3f ${t.toFixed(2)}%)`;
  };

  ns.trackColor = function trackColor(color) {
    return `color-mix(in oklch, ${color}, white 82%)`;
  };

  // Format pace as a percentage string.
  ns.formatPace = function formatPace(pace) {
    return Number.isFinite(pace) ? `${Math.round(pace * 100)}%` : "\u221e";
  };
})();
