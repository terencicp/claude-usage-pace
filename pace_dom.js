// Claude Usage Pace - DOM helpers and UI wiring
(() => {
  "use strict";

  const ns = (window.__usagePace = window.__usagePace || {});

  function walkRow(pb, maxDepth, onRow) {
    let row = pb.parentElement;
    for (let i = 0; row && i < maxDepth; i++, row = row.parentElement) {
      const barCount = row.querySelectorAll(ns.USAGE_BAR_SELECTOR).length;
      if (barCount > 1) return null;
      const result = onRow(row);
      if (result !== undefined) return result;
    }
    return null;
  }

  ns.findResetText = function findResetText(progressbar) {
    return walkRow(progressbar, 10, (row) => {
      for (const span of row.querySelectorAll("span")) {
        if (span.children.length) continue;
        const t = (span.textContent || "").trim();
        if (ns.RESET_TEXT_RE.test(t)) return t;
      }
      return undefined;
    });
  };

  // WeakMap-based cache so mutation feedback loops self-terminate.
  const lastApplied = new WeakMap();
  ns.applyStyle = function applyStyle(fill, color) {
    if (lastApplied.get(fill) === color) return;
    fill.style.setProperty("background-color", color, "important");
    fill.style.setProperty("background-image", "none", "important");
    lastApplied.set(fill, color);
  };

  const lastTrackApplied = new WeakMap();
  ns.applyTrackStyle = function applyTrackStyle(pb, color) {
    const trackColor = ns.trackColor(color);
    if (lastTrackApplied.get(pb) === trackColor) return;
    pb.style.setProperty("background-color", trackColor, "important");
    pb.style.setProperty("background-image", "none", "important");
    lastTrackApplied.set(pb, trackColor);
  };

  ns.applyBarHeight = function applyBarHeight(pb) {
    if (pb.style.getPropertyValue("height") === ns.BAR_HEIGHT) return;
    pb.style.setProperty("height", ns.BAR_HEIGHT, "important");
  };

  ns.findUsedSpan = function findUsedSpan(pb) {
    return walkRow(pb, 6, (row) => {
      for (const s of row.querySelectorAll("span")) {
        if (
          s.hasAttribute("data-pace-used") ||
          s.hasAttribute("data-pace-line")
        )
          continue;
        if (s.hasAttribute("data-pace-augmented")) return s;
        if (s.children.length === 0) {
          const t = (s.textContent || "").trim();
          if (ns.USED_TEXT_RE.test(t) || ns.USED_TEXT_ES_RE.test(t)) return s;
        }
      }
      return undefined;
    });
  };

  ns.augmentUsedSpan = function augmentUsedSpan(
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
      locale = ns.detectLocale(resetText, usedText);
      usedSpan.dataset.paceLocale = locale;
    }

    if (!inner || !paceLine) {
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
    const paceText = `${paceLabel}: ${ns.formatPace(result.pace)}`;
    if (inner.textContent !== paceText) inner.textContent = paceText;

    const lineText = `${usagePct}% ${usedLabel}`;
    if (paceLine.textContent !== lineText) paceLine.textContent = lineText;

    if (inner.dataset.appliedColor !== color) {
      inner.style.setProperty("color", color, "important");
      inner.dataset.appliedColor = color;
    }
  };

  ns.centerPlainUsedSpan = function centerPlainUsedSpan(pb) {
    walkRow(pb, 6, (row) => {
      for (const s of row.querySelectorAll("span")) {
        if (s.hasAttribute("data-pace-augmented")) continue;
        if (s.children.length === 0) {
          const t = (s.textContent || "").trim();
          if (ns.USED_TEXT_RE.test(t) || ns.USED_TEXT_ES_RE.test(t)) {
            s.style.setProperty("display", "inline-block", "important");
            s.style.setProperty("text-align", "center", "important");
            return true;
          }
        }
      }
      return undefined;
    });
  };

  ns.pickTickColor = function pickTickColor(pb) {
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
  };

  ns.tickColor = function tickColor(color) {
    if (matchMedia("(prefers-color-scheme: dark)").matches) return "#fff";
    return `color-mix(in oklch, ${color}, black 35%)`;
  };

  ns.ensureTick = function ensureTick(pb, elapsedPct, color) {
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

    const tickColor = color ? ns.tickColor(color) : ns.pickTickColor(pb);
    if (tick.dataset.appliedColor !== tickColor) {
      tick.style.setProperty("background-color", tickColor, "important");
      tick.dataset.appliedColor = tickColor;
    }
  };

  ns.removeTick = function removeTick(pb) {
    const host = pb.parentElement;
    if (!host) return;
    const tick = host.querySelector(":scope > [data-pace-tick]");
    if (tick) tick.remove();
  };
})();
