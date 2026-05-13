# Claude Usage Pace

A tiny Chrome extension that recolors the progress bars on Claude's usage page
based on whether you're **ahead of, on, or over pace** for the current reset
window. Bars that aren't time-windowed get a flat neutral grey so they don't
compete visually with the paced ones.

![Claude Usage Pace screenshot](screenshot.png)

A small floating chip in the top-right of the page tracks your worst-paced
bar — **KEEP GOING** in green while every bar is under pace, **SLOW DOWN**
in red once any bar tips over.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and pick this folder.
4. Visit `https://claude.ai/settings/usage`. The bars recolor on load and
   re-sample once a minute as time elapses.
