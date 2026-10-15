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
    };
    camera: { yaw: number; pitch: number; distance: number; current: number; shake: number };
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
    remotes: () => { id: string; name: string; x: number; z: number; action: string; flashlight: boolean; tagVisible: boolean; connected: boolean; fish: { rod: boolean; state: string; species: string } }[];
    /** Fishing (2.4): cast with a power 0…1, our fishing state, catches, and a quick bite (dev only). */
    fish: {
      cast: (power: number) => boolean;
      me: () => { rod: boolean; state: string; lureX: number; lureZ: number; tension: number; line: number; species: string; weight: number };
      catches: () => { id: string; name: string; species: string; weight: number; best: boolean; mine: boolean }[];
      quickBite: (seconds?: number, species?: string, weight?: number) => void;
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
  };
}

interface BowlLane {
  id: "1" | "2";
  bowlers: { id: string; name: string; rolls: number[] }[];
  turn: number;
  phase: string;
  standing: number;
}
