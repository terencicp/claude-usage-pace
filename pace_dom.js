// Claude Usage Pace - DOM helpers and UI wiring
(() => {
  "use strict";

  const ns = (window.__usagePace = window.__usagePace || {});

  ns.styleUsageHeadline = function styleUsageHeadline(bars) {
    const firstBar = bars[0];
    if (!firstBar) return;
    const headline = [...document.querySelectorAll('[data-settings-item] > p.text-title.font-semibold')]
      .find((el) => el.tagName === "P" && (el.compareDocumentPosition(firstBar) & 4));
    if (!headline) return;
    for (const [property, value] of [["font-size", "20px"], ["line-height", "1.3"], ["margin-bottom", "-4px"]]) {
      if (headline.style.getPropertyValue(property) !== value
        || headline.style.getPropertyPriority(property) !== "important") {
        headline.style.setProperty(property, value, "important");
      }
    }
  };

  ns.hideTopBuyMoreUsage = function hideTopBuyMoreUsage(bars) {
    const firstBar = bars[0];
    if (!firstBar) return;
    const button = [...document.querySelectorAll('button[data-cds="Button"]')].find((el) =>
      (el.textContent || "").trim() === "Buy more usage"
      && (el.compareDocumentPosition(firstBar) & 4));
    if (button && (button.style.getPropertyValue("display") !== "none"
      || button.style.getPropertyPriority("display") !== "important")) {
      button.style.setProperty("display", "none", "important");
    }
  };

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

  ns.findResetSpan = function findResetSpan(progressbar) {
    return walkRow(progressbar, 10, (row) => {
      for (const span of row.querySelectorAll("span")) {
        if (span.children.length) continue;
        const t = (span.textContent || "").trim();
        if (ns.RESET_TEXT_RE.test(t)) return span;
      }
      return undefined;
    });
  };

  ns.findResetText = function findResetText(progressbar) {
    return ns.findResetSpan(progressbar)?.textContent.trim() || null;
  };

  ns.renameLimitLabel = function renameLimitLabel(pb) {
    const labels = {
      "current session": "Session limit",
      "this week": "Weekly limit",
      "fable": "Fable (weekly)",
      "fable this week": "Fable (weekly)",
    };
    walkRow(pb, 10, (row) => {
      for (const span of row.querySelectorAll("span")) {
        // The weekly label now lives in a button with an icon. Update just
        // its text node so React's toggle and accessibility wiring survive.
        const button = span.querySelector?.("button[aria-expanded]");
        if (button) {
          for (const node of button.childNodes) {
            const replacement = node.nodeType === 3 && labels[node.textContent.trim().toLowerCase()];
            if (replacement) {
              node.textContent = replacement;
              return true;
            }
          }
        }
        if (span.children.length) continue;
        const replacement = labels[(span.textContent || "").trim().toLowerCase()];
        if (replacement) {
          span.textContent = replacement;
          return true;
        }
      }
      return undefined;
    });
  };

  // Keep the deadline separate from the rounded label so our own DOM changes
  // never restart the countdown or reduce the precision of pace calculations.
  const resetCountdowns = new WeakMap();
  ns.updateResetCountdown = function updateResetCountdown(pb) {
    const span = ns.findResetSpan(pb);
    if (!span) return null;
    const text = span.textContent.trim();
    let state = resetCountdowns.get(span);
    if (!state || text !== state.displayedText) {
      const timing = ns.elapsedAndKind(text, pb);
      if (!timing || !Number.isFinite(timing.remainingMin) || timing.remainingMin < 0) {
        if (state && span.title === state.title) span.title = "";
        resetCountdowns.delete(span);
        return text;
      }
      const match = /Resets\s|Se\s+restablece\b/i.exec(text);
      state = {
        resetAt: Date.now() + timing.remainingMin * 60_000,
        prefix: text.slice(0, match.index).replace(/^Separate weekly limit for Fable\s*·\s*/i, ""),
        label: ns.detectLocale(text) === "es" ? "Se restablece en" : "Resets in",
      };
      state.title = new Intl.DateTimeFormat(ns.detectLocale(text), {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
      }).format(state.resetAt);
      resetCountdowns.set(span, state);
    }
    const remainingMin = Math.max(0, (state.resetAt - Date.now()) / 60_000);
    state.displayedText = `${state.prefix}${state.label} ${ns.formatResetCountdown(remainingMin)}`;
    if (span.textContent !== state.displayedText) span.textContent = state.displayedText;
    if (span.title !== state.title) span.title = state.title;
    return `${state.prefix}${state.label} ${remainingMin} min`;
  };

  ns.findLimitRow = function findLimitRow(progressbar) {
    return walkRow(progressbar, 10, (row) => {
      for (const span of row.querySelectorAll("span")) {
        if (!span.children.length && ns.RESET_TEXT_RE.test(span.textContent.trim())) return row;
      }
      return undefined;
    });
  };

  // Share an intrinsic label column so every bar starts just after the widest
  // label/countdown, instead of reserving Claude's fixed w-52 column.
  ns.compactUsageRows = function compactUsageRows(bars) {
    const parents = new Set();
    for (const pb of bars) {
      const row = ns.findLimitRow(pb);
      const reset = ns.findResetSpan(pb);
      if (!row?.children || !reset) continue;
      const labelColumn = [...row.children].find((el) => el.contains(reset));
      const meterColumn = [...row.children].find((el) => el.contains(pb));
      if (!labelColumn || !meterColumn || labelColumn === meterColumn) continue;
      for (const span of labelColumn.querySelectorAll("span")) {
        if (!span.children.length && span.textContent.trim() === "Up to 50% of your weekly limit"
          && span.style.getPropertyValue("display") !== "none") {
          span.style.setProperty("display", "none", "important");
        }
      }
      for (const [el, name] of [[row, "data-pace-row"],
        [labelColumn, "data-pace-label-column"], [meterColumn, "data-pace-meter-column"]]) {
        if (!el.hasAttribute(name)) el.setAttribute(name, "");
      }
      if (row.parentElement) parents.add(row.parentElement);
    }
    // Propagate the shared columns through Claude's Collapsible and panel
    // wrappers, including an empty panel while its content is unmounted.
    for (let parent of parents) {
      while (parent?.children?.length) {
        const panelIds = new Set([...parent.querySelectorAll("button[aria-controls]")]
          .map((button) => button.getAttribute("aria-controls")));
        if (![...parent.children].every((el) =>
          el.matches("[data-pace-row], [data-pace-rows], [data-pace-feedback]")
          || (el.id && panelIds.has(el.id) && !el.children.length))) break;
        if (!parent.hasAttribute("data-pace-rows")) parent.setAttribute("data-pace-rows", "");
        if (parent.matches("[data-settings-item], section")) break;
        parent = parent.parentElement;
      }
    }
  };

  ns.applyUsageFillStyle = function applyUsageFillStyle(pb, color) {
    // Scoped usage shares are separate native fills layered above the main
    // one. Preserve their size/semantics and give them the same pace color.
    for (const fill of pb.children) {
      if (fill === pb.firstElementChild || fill.hasAttribute("data-usage-bar-fill")) {
        ns.applyStyle(fill, color);
      }
    }
  };

  // Extra feedback belongs to its own limit, leaving Claude's weekly headline intact.
  const feedback = new Map();
  ns.updateLimitFeedback = function updateLimitFeedback(pb, usagePct, result, resetText) {
    const row = ns.findLimitRow(pb);
    const locale = ns.detectLocale(resetText);
    const isFable = /\bfable\b/i.test(row?.textContent || "");
    const label = isFable ? "Fable (weekly)" : result?.kind === "session"
      ? locale === "es" ? "Sesión actual" : "Session limit" : null;
    const text = label && row ? ns.limitForecast(usagePct, result, label, locale) : null;
    let state = feedback.get(pb);
    if (!text) {
      state?.message.remove();
      feedback.delete(pb);
      return;
    }
    if (state && (state.row !== row || !state.message.isConnected)) {
      state.message.remove();
      feedback.delete(pb);
      state = null;
    }
    if (!state) {
      const message = document.createElement("p");
      message.setAttribute("data-pace-feedback", "1");
      Object.assign(message.style, {
        fontSize: "14px", lineHeight: "1.45", margin: "8px 0 16px",
        maxWidth: "100%", textWrap: "pretty",
      });
      if (row.tagName === "SECTION") row.appendChild(message);
      else row.insertAdjacentElement("afterend", message);
      state = { row, message };
      feedback.set(pb, state);
    }
    if (state.message.textContent !== text) state.message.textContent = text;
    const color = ns.isDarkTheme(pb) ? "#b9b9b9" : "#646464";
    if (state.message.dataset.color !== color) {
      state.message.style.color = color;
      state.message.dataset.color = color;
    }
    const title = locale === "es" ? "Estimación basada en que tu ritmo medio de uso se mantenga."
      : "Estimate assumes your average usage rate continues.";
    if (state.message.title !== title) state.message.title = title;
  };

  ns.cleanupLimitFeedback = function cleanupLimitFeedback(bars) {
    const current = new Set(bars);
    for (const [pb, state] of feedback) {
      if (!pb.isConnected || !current.has(pb)) {
        state.message.remove();
        feedback.delete(pb);
      }
    }
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
    const trackColor = ns.trackColor(color, ns.isDarkTheme(pb));
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

  ns.isDarkTheme = function isDarkTheme(pb) {
    // Inspect the page surface, excluding the bar's own tinted background.
    for (let node = pb.parentElement; node; node = node.parentElement) {
      const m = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
      if (!m || m.length < 3) continue;
      const alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
      if (alpha < 0.95) continue;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return lum < 128;
    }
    const root = document.documentElement;
    if (root.classList.contains("dark") || root.dataset.theme === "dark") return true;
    if (root.classList.contains("light") || root.dataset.theme === "light") return false;
    return matchMedia("(prefers-color-scheme: dark)").matches;
  };

  ns.pickTickColor = function pickTickColor(pb) {
    return ns.isDarkTheme(pb) ? "#f5f5f5" : "#121212";
  };

  ns.tickColor = function tickColor(color, pb) {
    if (ns.isDarkTheme(pb)) return "#fff";
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

    const tickColor = color ? ns.tickColor(color, pb) : ns.pickTickColor(pb);
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
