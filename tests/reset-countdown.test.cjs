const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

process.env.TZ = "Europe/Madrid";

function setup(label, resetText) {
  let now = Date.parse("2026-10-08T17:00:00+02:00");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const sandbox = { window: {}, Date: Clock, Intl };
  vm.createContext(sandbox);
  for (const file of ["pace_config.js", "pace_parsing.js", "pace_dom.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
  }
  const ns = sandbox.window.__usagePace;
  const span = { children: [], textContent: resetText };
  const row = {
    parentElement: null,
    get textContent() { return `${label} ${span.textContent}`; },
    querySelectorAll(selector) { return selector === "span" ? [span] : [pb]; },
  };
  const pb = { parentElement: row };
  return { ns, pb, span, sandbox, advance(minutes) { now += minutes * 60_000; } };
}

test("all three native reset labels become countdowns without the redundant Fable description", () => {
  for (const [label, source, expected] of [
    ["Current session", "Resets at 9:30 PM", "Resets in 4h 30m"],
    ["This week", "Resets Sunday 4:00 AM", "Resets in 2d 11h"],
    ["Fable this week", "Separate weekly limit for Fable · Resets Sunday 4:00 AM",
      "Resets in 2d 11h"],
  ]) {
    const { ns, pb, span } = setup(label, source);
    assert.ok(ns.updateResetCountdown(pb));
    assert.equal(span.textContent, expected);
  }
});

test("reprocessing advances the deadline without using rounded display values", () => {
  const { ns, pb, span, advance } = setup("This week", "Resets in 2d 11h 30m");
  const first = ns.computePace(81, ns.updateResetCountdown(pb), pb);
  assert.equal(span.textContent, "Resets in 2d 11h");
  advance(31);
  const next = ns.computePace(81, ns.updateResetCountdown(pb), pb);
  assert.equal(span.textContent, "Resets in 2d 10h");
  assert.equal(next.remainingMin, first.remainingMin - 31);
  assert.ok(next.pace < first.pace);
});

test("Claude updates replace the cached deadline and expired windows stay at zero", () => {
  const { ns, pb, span, advance } = setup("Current session", "Resets in 10 min");
  ns.updateResetCountdown(pb);
  advance(11);
  assert.equal(ns.computePace(75, ns.updateResetCountdown(pb), pb), null);
  assert.equal(span.textContent, "Resets in 0m");
  span.textContent = "Resets at 9:30 PM";
  ns.updateResetCountdown(pb);
  assert.equal(span.textContent, "Resets in 4h 19m");
});

test("Spanish countdowns retain their locale; unrecognized reset text is untouched", () => {
  const { ns, pb, span } = setup("Esta semana", "Se restablece dom, 4:00");
  ns.updateResetCountdown(pb);
  assert.equal(span.textContent, "Se restablece en 2d 11h");
  span.textContent = "Se restablece pronto";
  assert.equal(ns.updateResetCountdown(pb), "Se restablece pronto");
  assert.equal(span.textContent, "Se restablece pronto");
});

test("the page runner updates reset countdowns even with zero usage", () => {
  const { ns, pb, span, sandbox } = setup("Current session", "Resets at 9:30 PM");
  pb.getAttribute = () => "0";
  for (const name of ["cleanupLimitFeedback", "applyBarHeight", "applyTrackStyle",
    "removeTick", "centerPlainUsedSpan", "updateLimitFeedback"]) ns[name] = () => {};
  Object.assign(sandbox, {
    document: { querySelectorAll: () => [pb], documentElement: {} },
    setTimeout: (callback) => { callback(); return 1; },
    setInterval: () => {},
    matchMedia: () => ({ addEventListener() {} }),
    MutationObserver: class { observe() {} },
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"), sandbox);
  assert.equal(span.textContent, "Resets in 4h 30m");
});
