// Claude Usage Pace - reset parsing and pace math
(() => {
  "use strict";

  const ns = (window.__usagePace = window.__usagePace || {});

  ns.parseRelative = function parseRelative(text) {
    // English: "Resets in 4 hr 52 min" / "Resets in 23 min" / "Resets in 2 hr"
    // Spanish: "Se restablece en 4 h 12 min" / "Se restablece en 23 min"
    const m = text.match(
      /(Resets\s+in|Se\s+restablece\s+en)\s+(?:(\d+)\s*(?:hr|h|hora|horas))?\s*(?:(\d+)\s*(?:min|mins|minutos))?/i,
    );
    if (!m || (!m[2] && !m[3])) return null;
    return parseInt(m[2] || "0", 10) * 60 + parseInt(m[3] || "0", 10);
  };

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

  ns.normalizeText = function normalizeText(text) {
    return (text || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  };

  ns.detectLocale = function detectLocale(resetText, usedText) {
    const combined = ns.normalizeText(`${resetText || ""} ${usedText || ""}`);
    if (combined.includes("se restablece") || combined.includes("usado"))
      return "es";
    return "en";
  };

  ns.parseWeekday = function parseWeekday(text) {
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
      const dayKey = ns.normalizeText(m24[1]).slice(0, 3);
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
  };

  ns.inferKindFromSection = function inferKindFromSection(pb) {
    let node = pb;
    while (node && node.tagName !== "SECTION") node = node.parentElement;
    if (!node) return null;
    const h3 = node.querySelector("h3");
    if (!h3) return null;
    const text = ns.normalizeText(h3.textContent || "");
    if (text.includes("weekly") || text.includes("limites semanales"))
      return "weekly";
    if (text.includes("plan usage") || text.includes("limites de uso del plan"))
      return "session";
    return null;
  };

  ns.inferKind = function inferKind(pb, remainingMin) {
    return (
      ns.inferKindFromSection(pb) ||
      (remainingMin > ns.SESSION_WINDOW_MIN ? "weekly" : "session")
    );
  };

  ns.elapsedAndKind = function elapsedAndKind(resetText, pb) {
    if (!resetText) return null;

    const rel = ns.parseRelative(resetText);
    if (rel !== null) {
      const kind = ns.inferKind(pb, rel);
      const win =
        kind === "session" ? ns.SESSION_WINDOW_MIN : ns.WEEK_WINDOW_MIN;
      return {
        elapsedPct: ((win - rel) / win) * 100,
        kind,
      };
    }
    const wk = ns.parseWeekday(resetText);
    if (wk !== null) {
      return {
        elapsedPct: ((ns.WEEK_WINDOW_MIN - wk) / ns.WEEK_WINDOW_MIN) * 100,
        kind: "weekly",
      };
    }
    return null;
  };

  ns.computePace = function computePace(usagePct, resetText, pb) {
    const e = ns.elapsedAndKind(resetText, pb);
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
    const exponent = ns.UNDER_PACE_EXPONENT[e.kind];
    let position;
    if (pace <= 1.0) {
      position = Math.pow(pace, exponent) * ns.KNEE_POSITION;
    } else {
      position =
        ns.KNEE_POSITION +
        Math.min(1.0, (pace - 1.0) / 0.18) * (100 - ns.KNEE_POSITION);
    }
    return {
      position: Math.max(0, Math.min(100, position)),
      pace,
      elapsedPct,
    };
  };
})();
