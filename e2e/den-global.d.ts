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
    time: () => number;
    setTime: (time: number | string) => void;
    sky: () => { phase: string; daylight: number; exteriorLights: number };
    remotes: () => { id: string; name: string; x: number; z: number; action: string; flashlight: boolean; tagVisible: boolean; connected: boolean }[];
  };
}
