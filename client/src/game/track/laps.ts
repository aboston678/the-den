import { DRIVEWAY, LapTimer, TRACK, TRACK_ROAD } from "@den/shared";
import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import { create } from "zustand";
import { sendLap } from "../../net/party.ts";
import { playerState } from "../state.ts";

// Lap timing at the racetrack (Andrew, 2026-10-16): your browser times your laps on the bike (cross
// the start/finish line, go all the way round past both sector points, cross it again) and tells the
// server, which checks it and tells the party. Your current, last and best lap show on screen.

export interface LapNews { id: string; name: string; s: number; best: boolean; record: boolean; at: number; mine: boolean }

export const useLaps = create<{ current: number | null; last: number | null; best: number | null; news: LapNews[] }>(() => ({ current: null, last: null, best: null, news: [] }));

const timer = new LapTimer();

export function LapControls() {
  useEffect(() => {
    if (!window.__den) return;
    // Dev and tests: let the bike ride itself out to the track, or round it.
    window.__den.track = {
      laps: () => useLaps.getState(),
      autopilot: (route) => {
        playerState.autopilot = route === "out"
          ? { points: [...DRIVEWAY.points].reverse().concat(TRACK_ROAD.points), loop: false, maxSpeed: 24 }
          : route === "lap" ? { points: TRACK.points.slice(0, -1), loop: true, maxSpeed: 48 } : null;
      },
    };
  }, []);

  useFrame(() => {
    const now = performance.now() / 1000;
    const p = playerState.position;
    if (!playerState.riding) {
      timer.startedAt = null;
      if (useLaps.getState().current !== null) useLaps.setState({ current: null });
      return;
    }
    const done = timer.update(p.x, p.z, now);
    if (done !== null) {
      sendLap(done);
      const { best } = useLaps.getState();
      useLaps.setState({ last: done, best: best === null ? done : Math.min(best, done) });
    }
    const current = timer.current(now);
    // Only a few updates a second for the screen.
    const shown = useLaps.getState().current;
    if ((current === null) !== (shown === null) || (current !== null && shown !== null && Math.abs(current - shown) >= 0.05)) useLaps.setState({ current });
  });

  return null;
}
