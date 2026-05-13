# Claude Usage Pace

A tiny Chrome extension that recolors the progress bars on Claude's usage page
along a green → yellow → red OKLCH gradient based on whether you're **ahead
of, on, or over pace** for the current reset window. Bars that aren't
time-windowed (Claude Design, routine runs, extra usage spend) get a flat
neutral grey so they don't compete visually with the paced ones.

![Claude Usage Pace screenshot](screenshot.png)

A small floating chip in the top-right of the page tracks your worst-paced
bar — **KEEP GOING** in green while every bar is under pace, **SLOW DOWN**
in red once any bar tips over. It's tinted with the same gradient color as
the bar it's tracking, so the chip and the bar always agree.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and pick this folder.
4. Visit `https://claude.ai/settings/usage`. The bars recolor on load and
   re-sample once a minute as time elapses.

## Files

- `manifest.json` — MV3 manifest, scoped to `claude.ai` only.
- `content.js` — all logic. No background script, no storage, no network.
- `icons/` — toolbar icons at 16/32/48/128 px.

## License

MIT — see [LICENSE](LICENSE).
