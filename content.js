// Claude Usage Pace - main runner
(() => {
  "use strict";

  const ns = window.__usagePace;
  if (!ns) return;

  function processPage() {
    const bars = document.querySelectorAll(ns.USAGE_BAR_SELECTOR);
    for (const pb of bars) {
      const fill = pb.firstElementChild;
      ns.applyBarHeight(pb);

      const usagePct = parseInt(pb.getAttribute("aria-valuenow") || "0", 10);
      if (usagePct === 0) {
        if (fill) ns.applyStyle(fill, ns.NEUTRAL_COLOR);
        ns.applyTrackStyle(pb, ns.NEUTRAL_COLOR);
        ns.removeTick(pb);
        ns.centerPlainUsedSpan(pb);
        continue;
      }

      if (!fill) continue;

      const resetText = ns.findResetText(pb);
      const result = ns.computePace(usagePct, resetText, pb);

      if (result) {
        const color = ns.paceColor(result.position);
        ns.applyStyle(fill, color);
        ns.applyTrackStyle(pb, color);
        ns.ensureTick(pb, result.elapsedPct, color);
        const usedSpan = ns.findUsedSpan(pb);
        if (usedSpan) {
          const usedText = (usedSpan.textContent || "").trim();
          ns.augmentUsedSpan(
            usedSpan,
            usagePct,
            result,
            color,
            resetText,
            usedText,
          );
        }
      } else {
        ns.applyStyle(fill, ns.NEUTRAL_COLOR);
        ns.applyTrackStyle(pb, ns.NEUTRAL_COLOR);
        ns.removeTick(pb);
        ns.centerPlainUsedSpan(pb);
      }
    }
  }

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

  setInterval(schedule, ns.RECHECK_INTERVAL_MS);
})();
