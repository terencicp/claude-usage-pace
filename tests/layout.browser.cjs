// Run with Playwright on NODE_PATH. Uses only a local fixture, no account state.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const fixture = fs.readFileSync(path.join(__dirname, "claude-usage.html"), "utf8");
// Minimal native utilities from the supplied Claude markup; extension CSS is
// loaded separately so alignment is exercised through the actual wrappers.
const nativeCSS = `
  * { box-sizing: border-box; }
  body { margin: 24px; background: #202020; color: #eee; font: 16px Arial; }
  .flex { display: flex; } .flex-col { flex-direction: column; }
  .flex-wrap { flex-wrap: wrap; } .flex-1 { flex: 1 1 0%; }
  .w-full { width: 100%; } .w-52 { width: 208px; }
  .min-w-48 { min-width: 192px; } .min-w-20 { min-width: 80px; }
  .shrink-0 { flex-shrink: 0; } .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-lg { gap: 24px; } .gap-md { gap: 16px; } .gap-xs { gap: 4px; }
  .gap-x-lg { column-gap: 24px; } .gap-y-sm { row-gap: 8px; }
  .pt-lg { padding-top: 24px; } .inline-flex { display: inline-flex; }
  .block { display: block; } .relative { position: relative; }
  .absolute { position: absolute; } .inset-y-0 { top: 0; bottom: 0; }
  .start-0 { left: 0; } .h-full { height: 100%; }
  .h-1 { height: 4px; } .overflow-hidden { overflow: hidden; }
  .rounded-full { border-radius: 999px; } .bg-blue-300 { background: #6da8ed; }
  .whitespace-nowrap { white-space: nowrap; } .text-end { text-align: end; }
  .text-footnote { font-size: 14px; } .text-secondary { color: #bdbdb4; }
  button { color: inherit; background: none; border: 0; font: inherit; padding: 0; }
  [hidden] { display: none !important; }
`;

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.PACE_BROWSER_CHANNEL || "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent(`<style>${nativeCSS}</style>${fixture}`);
    await page.addStyleTag({ path: path.join(root, "usage-pace.css") });
    // Model Claude's native panel behavior and retain the actual toggle node.
    await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="pace-week-toggle"]');
      window.nativeToggle = toggle;
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        document.getElementById(toggle.getAttribute("aria-controls")).hidden = expanded;
      });
    });
    for (const file of ["pace_config.js", "pace_parsing.js", "pace_dom.js", "content.js"]) {
      await page.addScriptTag({ path: path.join(root, file) });
    }
    await page.waitForFunction(() => document.querySelectorAll("[data-pace-augmented]").length === 3);

    async function checkAlignment() {
      const bounds = await page.locator('[role="meter"]').evaluateAll((bars) => bars
        .filter((bar) => bar.getBoundingClientRect().width)
        .map((bar) => ({ x: bar.getBoundingClientRect().x, right: bar.getBoundingClientRect().right })));
      assert.ok(bounds.every((b) => Math.abs(b.x - bounds[0].x) < 1), JSON.stringify(bounds));
      assert.ok(bounds.every((b) => Math.abs(b.right - bounds[0].right) < 1), JSON.stringify(bounds));
    }
    await checkAlignment();
    assert.equal((await page.locator('[data-testid="pace-week-toggle"]').textContent()).trim(), "Weekly limit\uE027");
    assert.equal(await page.evaluate(() => window.nativeToggle === document.querySelector('[data-testid="pace-week-toggle"]')), true);
    const fills = await page.locator('[role="meter"]').evaluateAll((bars) => bars.map((bar) => ({
      value: bar.getAttribute("aria-valuenow"),
      colors: [...bar.children].map((fill) => getComputedStyle(fill).backgroundColor),
      share: bar.querySelector('[data-testid="usage-meter-share"]')?.style.inlineSize,
    })));
    assert.deepEqual(fills.map((f) => f.value), ["3", "46", "14"]);
    for (const fill of fills) assert.ok(fill.colors.every((color) => color === fill.colors[0]));
    assert.equal(fills[1].share, "7%");
    assert.equal(fills[2].share, "14%");
    await page.screenshot({ path: "/tmp/claude-usage-layout-fixed.png", fullPage: true });

    await page.getByRole("button", { name: "Weekly limit" }).click();
    assert.equal(await page.locator('[data-testid="pace-week-scoped"]').isVisible(), false);
    await checkAlignment();
    await page.getByRole("button", { name: "Weekly limit" }).click();
    assert.equal(await page.locator('[data-testid="pace-week-scoped"]').isVisible(), true);
    await checkAlignment();

    // Native data changes and panel replacement must be picked up independently.
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="pace-week-scoped"]');
      panel.replaceWith(panel.cloneNode(true));
      document.querySelectorAll('[role="meter"]')[2].setAttribute("aria-valuenow", "65");
      document.querySelectorAll('[role="meter"]')[2].firstElementChild.style.transform = "translateX(-35%)";
    });
    await page.waitForFunction(() => document.querySelectorAll("[data-pace-line]")[2].textContent === "65% used");
    assert.match(await page.locator("[data-pace-feedback]").textContent(), /Fable.*could hit the limit/);
    await checkAlignment();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileRows = await page.locator('[data-pace-row]').evaluateAll((rows) => rows.map((row) => ({
      labelBottom: row.querySelector('[data-pace-label-column]').getBoundingClientRect().bottom,
      bar: row.querySelector('[role="meter"]').getBoundingClientRect().toJSON(),
    })));
    assert.ok(mobileRows.every((row) => row.bar.width > 200 && row.bar.y >= row.labelBottom), JSON.stringify(mobileRows));
    await page.screenshot({ path: "/tmp/claude-usage-layout-mobile.png", fullPage: true });

    // Marking wrappers, recoloring overlays, and renaming buttons must settle.
    await page.waitForTimeout(150);
    const mutations = await page.evaluate(async () => {
      let count = 0;
      const observer = new MutationObserver((records) => { count += records.length; });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      await new Promise((resolve) => setTimeout(resolve, 350));
      observer.disconnect();
      return count;
    });
    assert.equal(mutations, 0);
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: nested row alignment, share colors, native toggle, panel replacement, forecasts, mobile, mutation stability.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
