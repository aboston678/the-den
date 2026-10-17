// The game exposes window.__den for tests (see client/src/game/state.ts).
interface Window {
  /** Set by tests that record the strongest camera shake seen. */
  __peakShake?: number;
  __den?: {
    player: {
      position: { x: number; y: number; z: number };
      yaw: number;
      speed: number;
      gameTime: number;
      grounded: boolean;
      action: string;
      flashlight: boolean;
      colliderHandle: number;
      trackFeet: boolean;
      /** Hide your own bear (screenshots). */
      hidden: boolean;
      feet: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
      /** The motorcycle's dials (and how far the front wheel is up). */
      bike: { speed: number; gear: number; revs: number; manual: boolean; wheelie: number };
    };
    /** `override`: a fixed shot (bowling; the picture tools) instead of following the bear. */
    camera: { yaw: number; pitch: number; distance: number; current: number; shake: number; override: { from: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } } | null };
    teleport: (x: number, z: number, y?: number) => void;
    ground: (x: number, z: number) => number;
    doors: () => Record<string, boolean>;
    serverPosition: () => { x: number; y: number; z: number } | null;
    time: () => number;
    setTime: (time: number | string) => void;
    audio: () => { state: string; recent: string[]; played: Record<string, number> };
    audioLevel: () => { rms: number; peak: number };
    perf: () => { fps: number; p95ms: number; calls: number; triangles: number; textureMB: number; programs: number; pixelRatio: number; size: string };
    perfBreakdown: () => string[];
    programNames?: () => string[];
    sky: () => { phase: string; daylight: number; exteriorLights: number };
    remotes: () => { id: string; name: string; x: number; z: number; action: string; flashlight: boolean; wheelie: number; tagVisible: boolean; connected: boolean; fish: { rod: boolean; state: string; species: string } }[];
    /** Fishing (2.4): cast with a power 0…1, our fishing state, catches, and a quick bite (dev only). */
    fish: {
      cast: (power: number) => boolean;
      me: () => { rod: boolean; state: string; lureX: number; lureZ: number; tension: number; line: number; species: string; weight: number };
      catches: () => { id: string; name: string; species: string; weight: number; best: boolean; mine: boolean }[];
      quickBite: (seconds?: number, species?: string, weight?: number) => void;
      /** Bears whose hooked fish is in the air right now ("me" for ours). */
      leaping: () => string[];
    };
    /** Bowling (Phase 3): the lanes as this browser sees them; setLanes shows made-up bowlers (dev only). */
    bowl?: {
      lanes: () => Record<"1" | "2", BowlLane>;
      setLanes: (lanes: Partial<Record<"1" | "2", Partial<BowlLane>>>) => void;
      me: () => { lane: string | null; mode: string; z: number; aim: number; power: number; curve: number; banner: string | null };
      click: () => void;
      throw: (t: { z: number; aim: number; power: number; curve: number }) => boolean;
      devRolls: (lane: string, rolls: number[]) => void;
      seen: (lane: "1" | "2") => { ball: boolean; ballX: number; gone: number };
    };
    /** Catan (Phase 4): the table as this browser sees it, and moves (sent to the server like clicks). */
    catan?: {
      state: () => {
        seats: string[];
        view: import("../shared/src/catan/view.ts").CatanView | null;
        mine: import("../shared/src/catan/view.ts").CatanPrivate | null;
        waitingFor: string;
        waitUntil: number;
        error: { text: string; at: number } | null;
        ok: number;
        wins: { id: string; name: string; vp: number; mine: boolean }[];
        prompt: string | null;
        seated: boolean;
      };
      sit: (seat: number) => void;
      stand: () => void;
      start: () => void;
      act: (action: import("../shared/src/catan/rules.ts").CatanAction) => void;
      quit: () => void;
      dev: (dice?: [number, number], give?: Record<string, number>, vp?: boolean) => void;
      screenOf: (kind: "vertex" | "edge" | "hex", id: number) => { x: number; y: number };
    };
    /** The motorcycle (round 2): riding, speed, the E prompt, and every bear's bike as this browser sees them. */
    bike?: {
      state: () => {
        riding: boolean;
        speed: number;
        /** Turns the front wheel has rolled (round 4). */
        wheelTurns: number;
        prompt: string | null;
        me: { state: string; x: number; y: number; z: number; yaw: number };
        others: Record<string, { state: string; x: number; y: number; z: number; yaw: number }>;
      };
      /** Dev: hide every bike's body so only the wheels and plate show. */
      showBodies: (on: boolean) => void;
      /** Dev: turn every bike's wheels to an angle (radians). */
      setWheelAngle: (angle: number) => void;
    };
    /** The racetrack (round 2): your laps, and (dev only) the bike riding itself out to the track or round it. */
    track?: {
      laps: () => { current: number | null; last: number | null; best: number | null; news: { name: string; s: number; best: boolean; record: boolean; mine: boolean }[] };
      autopilot: (route: "out" | "lap" | null) => void;
    };
    /** Connect Four (round 2): the table as this browser sees it, and moves (sent to the server like clicks). */
    c4?: {
      state: () => {
        seats: string[];
        game: import("../shared/src/connect4/rules.ts").C4Game | null;
        waitingFor: string;
        waitUntil: number;
        error: { text: string; at: number } | null;
        wins: { id: string; name: string; mine: boolean }[];
        confirmLeave: boolean;
        prompt: string | null;
        seated: boolean;
      };
      sit: (seat: number) => void;
      stand: () => void;
      start: () => void;
      drop: (col: number) => void;
      screenOfColumn: (col: number) => { x: number; y: number };
    };
  };
}

interface BowlLane {
  id: "1" | "2";
  bowlers: { id: string; name: string; rolls: number[] }[];
  turn: number;
  phase: string;
  standing: number;
}
