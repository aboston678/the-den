// The game exposes window.__den for tests (see client/src/game/state.ts).
interface Window {
  __den?: {
    player: {
      position: { x: number; y: number; z: number };
      speed: number;
      gameTime: number;
      grounded: boolean;
      action: string;
      colliderHandle: number;
      trackFeet: boolean;
      feet: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    };
    camera: { yaw: number; pitch: number; distance: number; current: number; shake: number };
    teleport: (x: number, z: number, y?: number) => void;
    remotes: () => { id: string; name: string; x: number; z: number; action: string; tagVisible: boolean; connected: boolean }[];
  };
}
