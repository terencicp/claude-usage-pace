// Claude Usage Pace - main runner
(() => {
  "use strict";

  const ns = window.__usagePace;
  if (!ns) return;

  function processPage() {
    for (const heading of document.querySelectorAll("h2.text-heading-semibold.text-primary")) {
      if ((heading.textContent || "").trim().toLowerCase() === "your usage") {
        heading.textContent = "Claude usage";
      }
    }
    globalThis.__usageLimitResets?.update();
    const bars = document.querySelectorAll(ns.USAGE_BAR_SELECTOR);
    ns.styleUsageHeadline(bars);
    ns.hideTopBuyMoreUsage(bars);
    ns.cleanupLimitFeedback(bars);
    ns.compactUsageRows(bars);
    for (const pb of bars) {
      ns.renameLimitLabel(pb);
      const fill = pb.firstElementChild;
      ns.applyBarHeight(pb);

      const usagePct = parseInt(pb.getAttribute("aria-valuenow") || "0", 10);
      const resetText = ns.updateResetCountdown(pb);
      if (usagePct === 0) {
        if (fill) ns.applyUsageFillStyle(pb, ns.NEUTRAL_COLOR);
        ns.applyTrackStyle(pb, ns.NEUTRAL_COLOR);
        ns.removeTick(pb);
        ns.centerPlainUsedSpan(pb);
        ns.updateLimitFeedback(pb, usagePct, null, resetText);
        continue;
      }

      if (!fill) {
        ns.updateLimitFeedback(pb, usagePct, null, resetText);
        continue;
      }

      const result = ns.computePace(usagePct, resetText, pb);
      ns.updateLimitFeedback(pb, usagePct, result, resetText);

      if (result) {
        const color = ns.paceColor(result.position);
        ns.applyUsageFillStyle(pb, color);
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
        ns.applyUsageFillStyle(pb, ns.NEUTRAL_COLOR);
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

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class", "data-theme", "aria-valuenow", "aria-label"],
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", schedule);
  setInterval(schedule, ns.RECHECK_INTERVAL_MS);
})();
