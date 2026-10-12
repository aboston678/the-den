// The intro's lyric lines and when they're sung (seconds into the 19 s clip). Times were read from
// the clip's loudness; nudge them here if a line comes in early or late.
// The first line names the town, as sung: Andrew's exception to the no-town-name rule (CLAUDE.md).

export interface Cue {
  text: string;
  from: number;
  to: number;
}

export const LYRICS: Cue[] = [
  { text: "There is a bear in Manchester, Maine", from: 0.1, to: 4.4 },
  { text: "and he does not have a coat", from: 5.4, to: 8.4 },
  { text: "on purpose", from: 10.7, to: 13.6 },
];

/** The logo fades in when the music kicks in. */
export const LOGO_AT = 14.3;

/** How visible a cue is at time t (0…1): a quick fade in, hold, fade out. */
export function cueOpacity(c: Cue, t: number, fade = 0.35) {
  if (t < c.from || t > c.to) return 0;
  return Math.min(1, (t - c.from) / fade, (c.to - t) / fade);
}

/** The line on screen at time t, if any. */
export const cueAt = (t: number) => LYRICS.find((c) => t >= c.from && t <= c.to) ?? null;
