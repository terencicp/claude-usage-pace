# Claude Usage Pace

Bro. You're paying for the sub. Are you actually **tokenmaxxing** it?

This is a tiny Chrome extension for the degens who treat every unused token
like a personal insult. It hijacks the progress bars on Claude's usage page
and recolors them based on whether you're **underfarming, perfectly pacing,
or about to get rate-limited into oblivion.** Bars that aren't tied to a
reset window get flattened to neutral grey. That tick mark on the bar?
That's the elapsed-time marker so you know how deep into the reset window you are.
The "Pace: X%" is your grind score so you know if you're ahead or sandbagging.

The mission: **use 100% of your sub. Squeeze every drop. No quota survives.**

![Claude Usage Pace screenshot](screenshot.png)

Supports session and weekly bars, including Fable's separate weekly limit.
English and Spanish only.

All limit resets show a live countdown: `2d 10h` for weekly resets, or
`4h 23m` for resets under a day, including sessions with 0% usage.
Hover over a countdown to see the full reset date, time, and time zone.
The Limit resets heading also shows a circular badge with the available reset
count, including `0` when no resets are available.

Tracks adapt to the page theme: dark mode mixes 28% of the bar color with
72% dark gray (`#202020`), matching ChatGPT Usage Pace. Light mode keeps the
pale track. Theme changes update the bars automatically.

When the current session or Fable is above 100% pace, an extra message below
that limit estimates when it will run out at your average usage rate. Session
feedback includes a time; Fable feedback includes a day and time. Warnings
disappear when pace returns to 100% or below. Claude's native weekly headline
is preserved. Newly opened windows avoid giving an unstable time estimate.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Flip **Developer mode** on (top-right).
3. Hit **Load unpacked** and point it at this folder.
4. Go to `https://claude.ai/settings/usage`. Bars recolor on load and
   re-sample every minute so your pace stays honest as time ticks.

Now go max that sub. Touch grass after.

## Check forecasts and countdowns

Run `node --test tests/*.test.cjs` to check independent session/Fable
projections, the 100% threshold, newly opened windows, midnight crossings,
and live reset countdowns in English and Spanish.
