// Our own hunter's aiming (bear hunt, 2026-10-17), shared between the controls (hunt/HuntControls.tsx),
// the player (it faces where we aim) and the camera (over the shoulder, or through the scope).
// A plain object: it changes every frame.
export const huntAim = {
  /** Right mouse held: shouldered and aiming. */
  aiming: false,
  /** Looking through the scope (aiming with a scope fitted). */
  scoped: false,
  /** When we last fired (performance.now): the gun stays up for a moment after. */
  firedAt: 0,
  /** The bear asked to swipe (the player plays it). */
  swipeRequest: false,
};

/** Is the gun up: aiming, or just fired. */
export const gunUp = () => huntAim.aiming || performance.now() - huntAim.firedAt < 900;
