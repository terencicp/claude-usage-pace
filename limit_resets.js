// Header badges for available resets. Native reset controls remain in place.
(() => {
  "use strict";
  const badgeAttr = "data-usage-reset-count";

  function headingText(el) {
    return [...el.childNodes].filter((node) => !node.hasAttribute?.(badgeAttr))
      .map((node) => node.textContent).join("").trim();
  }

  function resetCount(section) {
    // The Available tab remains present when viewing reset history.
    for (const tab of section.querySelectorAll('[role="tab"]')) {
      const match = tab.textContent.trim().match(/^Available\s*(\d+)$/i);
      if (match) return Number(match[1]);
    }
    if (/No resets right now|No resets available/i.test(section.textContent)) return 0;
    const actions = [...section.querySelectorAll("button")].filter((button) =>
      /^(?:Use (?:full |weekly |session )?reset|Reset limits)$/i.test(button.textContent.trim())
      && !button.closest('[role="tabpanel"][hidden]'));
    if (actions.length) return actions.length;
    return null;
  }

  globalThis.__usageLimitResets = {
    update({ swapCredits = false } = {}) {
      for (const heading of document.querySelectorAll("h2, h3, h4, div, span")) {
        if (heading.closest(`[${badgeAttr}]`)) continue;
        // Match only the text-bearing header, not its enclosing containers.
        if ([...heading.children].some((child) => !child.hasAttribute(badgeAttr))) continue;
        const text = headingText(heading);
        if (!/^(?:Usage limit resets|Limit resets)$/i.test(text)) continue;
        const section = heading.closest("section");
        if (!section) continue;

        if (/^Usage limit resets$/i.test(text)) {
          for (const node of heading.childNodes) {
            if (node.nodeType === 3 && node.textContent.includes("Usage limit resets")) {
              node.textContent = node.textContent.replace("Usage limit resets", "Limit resets");
            }
          }
        }
        let badge = heading.querySelector(`[${badgeAttr}]`);
        const count = resetCount(section);
        if (count !== null) {
          if (!badge) {
            badge = document.createElement("span");
            badge.setAttribute(badgeAttr, "");
            badge.setAttribute("data-cup-owned", "");
            Object.assign(badge.style, {
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "24px", height: "24px", borderRadius: "50%", marginInlineStart: "8px",
              verticalAlign: "middle", transform: "translateY(-2px)", fontSize: "12px", fontWeight: "500", lineHeight: "1",
              background: "color-mix(in srgb, currentColor 10%, transparent)",
              fontVariantNumeric: "tabular-nums", flexShrink: "0",
            });
            heading.appendChild(badge);
          }
          const value = String(count);
          if (badge.textContent !== value) badge.textContent = value;
          const label = `${count} ${count === 1 ? "reset" : "resets"} available`;
          if (badge.getAttribute("aria-label") !== label) badge.setAttribute("aria-label", label);
        } else {
          badge?.remove();
        }

        if (swapCredits) {
          const credits = [...section.parentElement.children].find((sibling) =>
            sibling.tagName === "SECTION" && [...sibling.querySelectorAll("div, h2, h3, span")]
              .some((el) => !el.children.length && el.textContent.trim() === "Credits"));
          if (credits && (credits.compareDocumentPosition(section) & 4)) {
            section.parentElement.insertBefore(section, credits);
          }
        }
      }
    },
  };
})();
