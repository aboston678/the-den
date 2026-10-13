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
      feet: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    };
    camera: { yaw: number; pitch: number; distance: number; current: number; shake: number };
    teleport: (x: number, z: number, y?: number) => void;
    ground: (x: number, z: number) => number;
    doors: () => Record<string, boolean>;
    serverPosition: () => { x: number; y: number; z: number } | null;
    time: () => number;
    setTime: (time: number | string) => void;
    audio: () => { state: string; recent: string[] };
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
  };
}
