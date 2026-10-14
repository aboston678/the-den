import {
  APPROACH_WORLD_Y, BALL_RETURN, type BallState, type BowlFrame, JOIN_REACH, LANE, LANES, type LaneSpec, PIN_SPOTS, PLATFORM_Y, STANCE, THROW, ballY, isGameOver, joinSpot,
  laneById, laneToWorld, nextBall, pinsStanding, reachedPins, stepBall, throwBall,
} from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { bowlSend, usePartyStore } from "../../net/party.ts";
import { playAt } from "../audio/audio.ts";
import { toWorld } from "../house/space.ts";
import { consumePress, isHeld } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { type LaneRender, laneRender, rackPins } from "./laneState.ts";
import { PinDeck, rapierReady } from "./pinSim.ts";
import { Pinsetter } from "./pinsetter.ts";
import { drivenHere, frameOf } from "./remoteFrames.ts";
import { ALL_PINS, type BowlMode, click, curveAt, popcount, powerAt, useBowling } from "./session.ts";
import { useLanes } from "./store.ts";

// Your turn at the lanes (GAME_SPEC §15, Andrew's meter controls). E at the ball return asks the
// server to put you on that lane. On your turn the bear stands on the approach: A/D slides, the
// mouse swings the aim arrow, a click starts the POWER meter, a click stops it, a click stops the
// CURVE meter, and the bear bowls. Your browser runs the ball (the lane model in
// shared/src/bowling/ball.ts, then the pin physics in pinSim.ts), streams it to the party, and
// tells the server which pins fell; the server keeps score and says whose turn is next.

type LaneId = "1" | "2";
const SLIDE_SPEED = 0.6; // m/s along the foul line (A/D)
const AIM_PER_PIXEL = 0.012; // degrees of aim per pixel of mouse movement
const LANE_YAW = Math.PI / 2; // facing +x, down the lanes
const SUBSTEP = 1 / 240;
const FRAME_EVERY = 1 / 20; // stream the ball and pins 20 times a second

const v = (a: [number, number, number]) => new Vector3(...a);
const spinQ = new Quaternion(), axis = new Vector3();
/** The ball return's hood, where balls pop back up (world). */
const RETURN_HOOD = toWorld([BALL_RETURN.x + 0.45, PLATFORM_Y + 0.6, BALL_RETURN.z]);

interface Run {
  ball: BallState | null;
  deck: PinDeck | null;
  setter: Pinsetter | null;
  /** Seconds in the current mode. */
  t: number;
  /** Which pins were standing before this ball. */
  before: number;
  /** The balls so far this game, before this one (to work out what the pinsetter does). */
  rolls: number[];
  crashed: boolean;
  /** Where each pin stood when this ball reached them (lane x, z), to hear the moment they're hit. */
  startPins: { x: number; z: number }[] | null;
  /** Seconds until the next streamed frame, and a sound to send with it. */
  sendIn: number;
  sound: BowlFrame["snd"];
}

export function BowlingControls() {
  const { gl } = useThree();
  const run = useRef<Run>({ ball: null, deck: null, setter: null, t: 0, before: ALL_PINS, rolls: [], crashed: false, startPins: null, sendIn: 0, sound: undefined });

  // Clicks drive the meters (only with the mouse captured, so the first click just captures it).
  useEffect(() => {
    const canvas = gl.domElement;
    const down = (e: MouseEvent) => {
      if (e.button !== 0 || document.pointerLockElement !== canvas) return;
      click();
    };
    window.addEventListener("mousedown", down);
    void rapierReady();
    return () => window.removeEventListener("mousedown", down);
  }, [gl]);

  useEffect(() => () => {
    if (useBowling.getState().lane) bowlSend.leave();
    stopBowling();
    run.current.deck?.dispose();
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const ui = useBowling.getState();
    const r = run.current;
    r.t += dt;
    const set = (patch: Partial<typeof ui>) => useBowling.setState(patch);
    const mode = (m: BowlMode) => {
      r.t = 0;
      set({ mode: m });
    };
    const lanes = useLanes.getState().lanes;
    const me = usePartyStore.getState().sessionId;
    const myLane = (["1", "2"] as const).find((id) => lanes[id].bowlers.some((b) => b.id === me)) ?? null;

    // The server puts us on a lane (or takes us off). A ball we're rolling plays out either way.
    const busy = ui.mode === "throw" || ui.mode === "roll" || ui.mode === "pins" || ui.mode === "sweep";
    if (myLane !== ui.lane && !busy) {
      if (myLane) {
        set({ lane: myLane, mode: "wait", aim: 0, z: 0.2 });
        if (lanes[myLane].phase !== "rolling") rackPins(laneRender[myLane]);
      } else stopBowling();
      return;
    }

    // --- not on a lane: offer to join at the ball return ---
    if (!ui.lane) {
      // The nearest lane's side of the ball return (both lanes share it).
      const dist = (id: LaneId) => {
        const s = joinSpot(laneById(id)!);
        return Math.hypot(playerState.position.x - s.x, playerState.position.z - s.z);
      };
      // On the alley's floor only: the dining room is right above the ball return.
      const downstairs = Math.abs(playerState.position.y - APPROACH_WORLD_Y) < 1.5;
      const near = downstairs ? LANES.filter((l) => dist(l.id) < JOIN_REACH).sort((a, b) => dist(a.id) - dist(b.id))[0] : undefined;
      const lane = near && lanes[near.id];
      const full = !!lane && (lane.bowlers.length >= 4 || (lane.phase !== "over" && lane.bowlers.some((b) => b.rolls.length > 0)));
      const prompt = !near ? null : full ? `Lane ${near.id} is mid-game` : `Bowl on lane ${near.id}`;
      if (prompt !== ui.prompt) set({ prompt });
      if (near && !full && consumePress("KeyE")) bowlSend.join(near.id);
      return;
    }

    const id = ui.lane;
    const laneSpec = laneById(id)!;
    const lane = lanes[id];
    const render = laneRender[id];
    const myTurn = lane.bowlers[lane.turn]?.id === me && lane.phase === "aim";
    const atLine = ui.mode === "aim" || ui.mode === "power" || ui.mode === "curve" || ui.mode === "throw";
    drivenHere[id] = ui.mode === "roll" || ui.mode === "pins" || ui.mode === "sweep";

    // E leaves the lane (not mid-ball), or starts a new game once this one's over.
    const canLeave = ui.mode === "wait" || ui.mode === "aim";
    const over = lane.phase === "over";
    const prompt = canLeave ? (over ? "New game" : "Leave the lane") : null;
    if (prompt !== ui.prompt) set({ prompt });
    if (canLeave && consumePress("KeyE")) {
      if (over) bowlSend.newGame(id);
      else {
        bowlSend.leave();
        stopBowling();
      }
      return;
    }

    // --- your turn: stand at the line ---
    if (ui.mode === "wait" && myTurn) {
      mode("aim");
      r.before = lane.standing;
      r.rolls = lane.bowlers[lane.turn]!.rolls;
      r.ball = null;
      render.ball.visible = false;
      playerState.bowlReleased = false;
    }
    if (ui.mode === "aim" && !myTurn) mode("wait"); // the server moved on (we sat too long, or left)
    if (atLine) {
      if (ui.mode === "aim") {
        const slide = (isHeld("KeyD") ? 1 : 0) - (isHeld("KeyA") ? 1 : 0);
        if (slide) set({ z: clamp(ui.z + slide * SLIDE_SPEED * dt, -STANCE.maxZ, STANCE.maxZ) });
      }
      const [x, , z] = laneToWorld(laneSpec, STANCE.x, 0, useBowling.getState().z);
      playerState.hold = { x, z, yaw: LANE_YAW };
      cameraState.mouse = ui.mode === "aim" ? (dx) => set({ aim: clamp(useBowling.getState().aim + dx * AIM_PER_PIXEL, -THROW.maxAim, THROW.maxAim) }) : () => {};
      // Behind and above the bear's outside shoulder (away from the kiosk between the lanes), high
      // enough to see the aim arrow past it.
      const outside = id === "1" ? -1 : 1;
      shot(laneSpec, [STANCE.x - 2.5, 1.95, ui.z + outside * 0.75], [7, 0, ui.z * 0.4]);
    }
    if (ui.mode === "power") set({ power: powerAt(r.t) });
    if (ui.mode === "curve") set({ curve: curveAt(r.t) });

    // --- the bear bowls; the ball leaves the paw ---
    if (ui.mode === "throw" && playerState.bowlReleased) {
      playerState.bowlReleased = false;
      const s = useBowling.getState();
      r.ball = throwBall({ z: s.z, aim: s.aim, power: s.power, curve: s.curve });
      render.ball.visible = true;
      render.ball.colour = lane.turn;
      bowlSend.rolling(id);
      const at = laneToWorld(laneSpec, 0, 0, s.z);
      void playAt("ball-roll", at[0], at[1], at[2], 0.9, 10);
      r.sound = "roll";
      r.sendIn = 0;
      mode("roll");
    }

    // --- down the lane (the lane model), camera following ---
    if (ui.mode === "roll" && r.ball) {
      const b = r.ball;
      for (let t = 0; t < dt && !reachedPins(b); t += SUBSTEP) stepBall(b, SUBSTEP);
      render.ball.p.set(b.x, ballY(b), b.z);
      // Spin the ball as it rolls (about its own axis: ω = (wx, 0, wz)).
      axis.set(b.wx, 0, b.wz);
      const w = axis.length();
      if (w > 1e-3) render.ball.q.premultiply(spinQ.setFromAxisAngle(axis.divideScalar(w), w * dt)).normalize();
      const camX = Math.min(b.x - 3.2, LANE.headPin - 5.5);
      shot(laneSpec, [camX, 0.95, b.z * 0.5], [Math.min(b.x + 5, LANE.headPin), 0.1, b.z * 0.3]);
      if (reachedPins(b)) {
        r.deck = null;
        if (!b.gutter) {
          r.deck = new PinDeck();
          r.deck.rack(r.before === ALL_PINS ? null : render.pins);
          r.deck.launch(b);
        }
        r.crashed = false;
        r.startPins = null;
        mode("pins");
      }
    }

    // --- the crash: physics until the pins settle ---
    if (ui.mode === "pins") {
      shot(laneSpec, [LANE.headPin - 4.6, 1.05, 0], [LANE.headPin + 0.4, 0.12, 0]);
      const settled = r.deck ? crash(r, render, laneSpec, dt) : gutterBall(r, render, dt);
      if (settled) {
        // Count what fell (of the pins that were up for this ball) and tell the server.
        let knocked = 0;
        settled.forEach((up, i) => {
          if (!up && r.before & (1 << i)) knocked |= 1 << i;
        });
        r.deck?.dispose();
        r.deck = null;
        bowlSend.result(id, knocked);
        announce(knocked, r.before, !!r.ball?.gutter);
        // The pinsetter: set the standing pins back down, or a fresh rack at the end of the frame.
        const after = [...r.rolls, popcount(knocked)];
        const freshRack = nextBall(after)?.ball === 0 || isGameOver(after) || pinsStanding(after) === 10;
        r.setter = new Pinsetter(render, settled.map((s, i) => s && (r.before & (1 << i)) !== 0), freshRack);
        void playAt("sweep", ...laneToWorld(laneSpec, LANE.headPin, 0.6, 0), 0.6, 6);
        r.sound = "sweep";
        mode("sweep");
      }
    }

    // --- the pinsetter clears up; then wait for the server to say whose turn it is ---
    if (ui.mode === "sweep" && r.setter) {
      if (r.setter.update(dt)) {
        r.setter = null;
        void playAt("ball-return", ...RETURN_HOOD, 0.6, 5);
        r.sound = "return";
        stream(r, id, FRAME_EVERY); // the last frame: the pins as they'll be for the next ball
        drivenHere[id] = false;
        mode("wait");
        return;
      }
      shot(laneSpec, [LANE.headPin - 4.6, 1.05, 0], [LANE.headPin + 0.4, 0.12, 0]);
    }
    if (drivenHere[id]) stream(r, id, dt);
    if (ui.mode === "wait") releaseLine();
  });

  return null;
}

/** Run the pin physics; the pins' standing/fallen once they settle, else null. */
function crash(r: Run, render: LaneRender, lane: LaneSpec, dt: number): boolean[] | null {
  const deck = r.deck!;
  deck.step(dt);
  deck.write(render);
  r.startPins ??= render.pins.map((p) => ({ x: p.p.x, z: p.p.z }));
  // The crash sound (Andrew's pick) the moment the ball reaches the pins: full for a hit into the
  // middle of the rack, softer for a ball that only clips the edge.
  if (!r.crashed && deck.time < 1.5) {
    const moved = render.pins.some((p, i) => !p.gone && Math.hypot(p.p.x - r.startPins![i]!.x, p.p.z - r.startPins![i]!.z) > 0.01);
    if (moved) {
      r.crashed = true;
      const full = Math.abs(r.ball?.z ?? 0) < 0.3;
      const at = laneToWorld(lane, LANE.headPin, 0.3, 0);
      void playAt("pin-strike", at[0], at[1], at[2], full ? 1.1 : 0.6, 9);
      r.sound = full ? "crash" : "tap";
    }
  }
  return deck.settled() ? deck.standing() : null;
}

/** A gutter ball rolls on into the pit; the pins don't move. */
function gutterBall(r: Run, render: LaneRender, dt: number): boolean[] | null {
  const b = r.ball!;
  b.x += b.vx * dt;
  render.ball.p.set(b.x, ballY(b) - Math.max(0, b.x - LANE.pitEdge) * 0.6, b.z);
  if (r.t < 1.4) return null;
  return PIN_SPOTS.map((_, i) => (r.before & (1 << i)) !== 0);
}

/** Send the party where our ball and pins are (20 a second, and straight away with a sound). */
function stream(r: Run, id: LaneId, dt: number) {
  r.sendIn -= dt;
  if (r.sendIn > 0 && !r.sound) return;
  r.sendIn = FRAME_EVERY;
  bowlSend.frame(frameOf(id, r.sound));
  r.sound = undefined;
}

/** Step back from the line: the bear and camera are yours again. */
function releaseLine() {
  playerState.hold = null;
  cameraState.override = null;
  cameraState.mouse = null;
}

/** Off the lane entirely. */
function stopBowling() {
  releaseLine();
  drivenHere["1"] = drivenHere["2"] = false;
  useBowling.setState({ lane: null, mode: "off", prompt: null });
}

/** STRIKE! / SPARE! / GUTTER / n pins, and a celebration for a strike. */
function announce(knockedMask: number, before: number, gutter: boolean) {
  const n = popcount(knockedMask);
  const fresh = before === ALL_PINS;
  let text = n === 1 ? "1 pin" : `${n} pins`, big = false;
  if (fresh && n === 10) (text = "STRIKE!"), (big = true), (playerState.celebrateRequest = true);
  else if (!fresh && popcount(before) === n && n > 0) (text = "SPARE!"), (big = true);
  else if (gutter) text = "Gutter";
  else if (n === 0) text = "Miss";
  useBowling.setState({ banner: { text, big, at: performance.now() } });
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Point the camera from/at lane coordinates. */
function shot(lane: LaneSpec, from: [number, number, number], look: [number, number, number]) {
  cameraState.override = { from: v(laneToWorld(lane, ...from)), look: v(laneToWorld(lane, ...look)) };
}
