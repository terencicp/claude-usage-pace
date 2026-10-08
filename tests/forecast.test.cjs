const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

process.env.TZ = "Europe/Madrid";
const now = Date.parse("2026-10-02T08:00:00+02:00");
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const sandbox = { window: {}, Date: Clock, Intl };
vm.createContext(sandbox);
for (const file of ["pace_config.js", "pace_parsing.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), sandbox);
}
const ns = sandbox.window.__usagePace;
ns.findLimitRow = (pb) => ({ textContent: pb.label });
const session = { label: "Current session", parentElement: null };
const fable = { label: "Fable this week", parentElement: null };

test("session projection uses elapsed usage rate and predicts 8:50 AM", () => {
  const result = ns.computePace(75, "Resets in 2 hr 30 min", session);
  assert.equal(result.kind, "session");
  assert.equal(result.pace, 1.5);
  assert.match(ns.limitForecast(75, result, "Current session", "en", now), /8:50 AM/);
});

test("Fable uses its own seven-day quota and predicts Saturday at noon", () => {
  const result = ns.computePace(75, "Resets in 3d 12h", fable);
  assert.equal(result.kind, "weekly");
  assert.equal(result.pace, 1.5);
  assert.match(ns.limitForecast(75, result, "Fable", "en", now), /Saturday.*12:00 PM/);
  // A weekly window remains weekly even in its final 90 minutes.
  assert.equal(ns.computePace(99.9, "Resets in 1 hr 30 min", fable).kind, "weekly");
});

test("warnings are shown strictly above 100%, including small overruns", () => {
  for (const used of [0, 40, 50]) {
    const result = ns.computePace(used, "Resets in 2 hr 30 min", session);
    assert.equal(ns.limitForecast(used, result, "Current session", "en", now), null);
  }
  const result = ns.computePace(50.1, "Resets in 2 hr 30 min", session);
  assert.match(ns.limitForecast(50.1, result, "Current session", "en", now), /could hit the limit/);
});

test("full quota, just-opened windows, and invalid resets have distinct feedback", () => {
  const full = ns.computePace(100, "Resets in 2 hr 30 min", session);
  assert.match(ns.limitForecast(100, full, "Current session", "en", now), /reached this limit/);
  const opened = ns.computePace(1, "Resets in 5 hr", session);
  assert.match(ns.limitForecast(1, opened, "Current session", "en", now), /window just started/);
  for (const reset of ["Resets soon", "Resets in 0 min", "Resets in 6 hr"]) {
    assert.equal(ns.computePace(75, reset, session), null);
  }
});

test("Spanish day countdowns and midnight crossings retain useful timing", () => {
  const result = ns.computePace(75, "Se restablece en 3 días 12 horas", fable);
  assert.match(ns.limitForecast(75, result, "Fable", "es", now), /sábado.*12:00/);
  const late = Date.parse("2026-10-02T23:30:00+02:00");
  const sessionResult = ns.computePace(75, "Resets in 2 hr 30 min", session);
  assert.match(ns.limitForecast(75, sessionResult, "Current session", "en", late), /Saturday.*12:20 AM/);
});
