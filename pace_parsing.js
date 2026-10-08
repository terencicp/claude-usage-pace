// Claude Usage Pace - reset parsing and pace math
(() => {
  "use strict";

  const ns = (window.__usagePace = window.__usagePace || {});

  ns.parseRelative = function parseRelative(text) {
    // Include days for weekly countdowns, even near the end of the weekly window.
    const match = text.match(/(?:Resets\s+in|Se\s+restablece\s+en)\s+(.+)$/i);
    if (!match) return null;
    let found = false;
    let minutes = 0;
    const rest = ns.normalizeText(match[1]).replace(
      /(\d+(?:[.,]\d+)?)\s*(days?|dias?|d|hours?|hrs?|horas?|h|minutes?|mins?|minutos?|m|seconds?|secs?|segundos?|s)\b/gi,
      (_, amount, unit) => {
        found = true;
        const factor = unit.startsWith("d") ? 1440 : unit.startsWith("h") ? 60
          : unit.startsWith("m") ? 1 : 1 / 60;
        minutes += Number(amount.replace(",", ".")) * factor;
        return "";
      },
    ).replace(/\b(?:and|y)\b|[\s,·]+/g, "");
    return found && !rest ? minutes : null;
  };

  // 12 h hour + "AM"/"PM"/"a"/"p" to 24 h; no meridiem means already 24 h.
  function to24h(hour, meridiem) {
    if (!meridiem) return hour;
    return (hour % 12) + (/^p/i.test(meridiem) ? 12 : 0);
  }

  // Minutes until the next hour:minute, on targetDay (0 = Sun) or any day if null.
  function minutesUntil(hour, minute, targetDay) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    let daysAhead = targetDay === null ? 0 : (targetDay - now.getDay() + 7) % 7;
    if (daysAhead === 0 && next <= now) daysAhead = targetDay === null ? 1 : 7;
    next.setDate(next.getDate() + daysAhead);
    return Math.max(0, (next - now) / 60_000);
  }

  ns.parseTimeOfDay = function parseTimeOfDay(text) {
    // English: "Resets at 12:20 PM"
    // Spanish: "Se restablece a las 12:20"
    const m = text.match(
      /(?:Resets\s+at|Se\s+restablece\s+a\s+las?)\s+(\d{1,2}):(\d{2})\s*(?:([ap])\.?\s*m)?/i,
    );
    if (!m) return null;
    return minutesUntil(
      to24h(parseInt(m[1], 10), m[3]),
      parseInt(m[2], 10),
      null,
    );
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

  ns.formatResetCountdown = function formatResetCountdown(remainingMin) {
    const minutes = Math.max(0, Math.floor(remainingMin));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes / 60) % 24;
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
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

    let targetDay;
    let hour;
    let minute;

    if (m12) {
      targetDay = DAY_MAP[m12[1].slice(0, 3).toLowerCase()];
      hour = to24h(parseInt(m12[2], 10), m12[4]);
      minute = parseInt(m12[3], 10);
    } else {
      const dayKey = ns.normalizeText(m24[1]).slice(0, 3);
      targetDay = DAY_MAP[dayKey];
      hour = parseInt(m24[2], 10);
      minute = parseInt(m24[3], 10);
    }

    if (targetDay === undefined) return null;
    return minutesUntil(hour, minute, targetDay);
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
    const row = ns.findLimitRow?.(pb);
    const text = ns.normalizeText(row?.textContent);
    if (/\bfable\b|this week|weekly|esta semana|semanal/.test(text)) return "weekly";
    if (/current session|session limit|sesion actual/.test(text)) return "session";
    return (
      ns.inferKindFromSection(pb) ||
      (remainingMin > ns.SESSION_WINDOW_MIN ? "weekly" : "session")
    );
  };

  ns.elapsedAndKind = function elapsedAndKind(resetText, pb) {
    if (!resetText) return null;

    const remainingMin =
      ns.parseRelative(resetText) ?? ns.parseTimeOfDay(resetText);
    if (remainingMin !== null) {
      const kind = ns.inferKind(pb, remainingMin);
      const win =
        kind === "session" ? ns.SESSION_WINDOW_MIN : ns.WEEK_WINDOW_MIN;
      return {
        elapsedPct: ((win - remainingMin) / win) * 100,
        kind,
        remainingMin,
      };
    }
    const wk = ns.parseWeekday(resetText);
    if (wk !== null) {
      return {
        elapsedPct: ((ns.WEEK_WINDOW_MIN - wk) / ns.WEEK_WINDOW_MIN) * 100,
        kind: "weekly",
        remainingMin: wk,
      };
    }
    return null;
  };

  ns.computePace = function computePace(usagePct, resetText, pb) {
    const e = ns.elapsedAndKind(resetText, pb);
    if (!e) return null;
    const windowMin = e.kind === "session" ? ns.SESSION_WINDOW_MIN : ns.WEEK_WINDOW_MIN;
    if (e.remainingMin <= 0 || e.remainingMin > windowMin) return null;
    const elapsedPct = Math.max(0, Math.min(100, e.elapsedPct));

    // Edge case: window just opened.
    if (elapsedPct < 0.5) {
      return {
        position: usagePct > 0 ? 100 : 0,
        pace: usagePct > 0 ? Infinity : 0,
        elapsedPct,
        kind: e.kind,
        remainingMin: e.remainingMin,
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
      kind: e.kind,
      remainingMin: e.remainingMin,
    };
  };

  ns.limitForecast = function limitForecast(usagePct, result, label, locale, now = Date.now()) {
    if (!result || !(result.pace > 1) || !Number.isFinite(usagePct)
      || usagePct <= 0 || usagePct > 100) return null;
    const es = locale === "es";
    if (usagePct === 100) return es ? `${label}: Has alcanzado este límite. Espera al reinicio.`
      : `${label}: You’ve reached this limit. Wait for the reset.`;
    if (!Number.isFinite(result.pace) || result.elapsedPct < 0.5) return es
      ? `${label}: Vas por encima del ritmo, pero este periodo acaba de empezar. La estimación se estabilizará con el tiempo.`
      : `${label}: You’re above pace, but this window just started. The estimate will settle as more time passes.`;
    const windowMin = result.kind === "session" ? ns.SESSION_WINDOW_MIN : ns.WEEK_WINDOW_MIN;
    const elapsedMin = windowMin * result.elapsedPct / 100;
    const runsOutAt = now + elapsedMin * (100 - usagePct) / usagePct * 60_000;
    const when = new Intl.DateTimeFormat(es ? "es" : "en", {
      ...(result.kind === "weekly" || new Date(runsOutAt).toDateString() !== new Date(now).toDateString()
        ? { weekday: "long" } : {}),
      hour: "numeric", minute: "2-digit",
    }).format(runsOutAt);
    return es ? `${label}: A este ritmo, podrías alcanzar el límite alrededor de ${when}, antes del reinicio.`
      : `${label}: At this pace, you could hit the limit around ${when}, before the reset.`;
  };
})();
