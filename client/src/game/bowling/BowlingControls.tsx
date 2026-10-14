import {
  BALL_RETURN, type BallState, JOIN_REACH, LANE, LANES, type LaneSpec, PIN_SPOTS, PLATFORM_Y, STANCE, THROW, ballY, houseToWorld, laneById,
  laneToWorld, reachedPins, stepBall, throwBall,
} from "@den/shared";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import { usePartyStore } from "../../net/party.ts";
import { playAt } from "../audio/audio.ts";
import { toWorld } from "../house/space.ts";
import { consumePress, isHeld } from "../input/keyboard.ts";
import { cameraState, playerState } from "../state.ts";
import { ALL_PINS, LOCAL_ID, laneDriver } from "./laneDriver.ts";
import { laneRender, rackPins } from "./laneState.ts";
import { PinDeck, rapierReady } from "./pinSim.ts";
import { Pinsetter } from "./pinsetter.ts";
import { type BowlMode, click, curveAt, powerAt, useBowling } from "./session.ts";
import { useLanes } from "./store.ts";

// Your turn at the lanes (GAME_SPEC §15, Andrew's meter controls): E at the ball return joins a
// lane; on your turn the bear stands on the approach, A/D slides, the mouse swings the aim arrow,
// a click starts the POWER meter, a click stops it, a click stops the CURVE meter, and the bear
// bowls. The ball runs on the lane model (shared/src/bowling/ball.ts) and then the pin physics
// (pinSim.ts); the pinsetter clears up and the next ball (or bowler) is up.

type LaneId = "1" | "2";
const SLIDE_SPEED = 0.6; // m/s along the foul line (A/D)
const AIM_PER_PIXEL = 0.012; // degrees of aim per pixel of mouse movement
const LANE_YAW = Math.PI / 2; // facing +x, down the lanes
const SUBSTEP = 1 / 240;

const v = (a: [number, number, number]) => new Vector3(...a);
const spinQ = new Quaternion(), axis = new Vector3();

/** Where you join a lane: next to the ball return, on that lane's side (world x, z). */
function joinSpot(id: LaneId) {
  const lane = laneById(id)!;
  return houseToWorld(BALL_RETURN.x, (BALL_RETURN.z + lane.cz) / 2);
}

interface Run {
  ball: BallState | null;
  deck: PinDeck | null;
  setter: Pinsetter | null;
  /** Seconds in the current mode. */
  t: number;
  /** Which pins were standing before this ball. */
  before: number;
  crashed: boolean;
}

export function BowlingControls() {
  const { gl } = useThree();
  const run = useRef<Run>({ ball: null, deck: null, setter: null, t: 0, before: ALL_PINS, crashed: false });

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
    leaveLane();
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

    // --- not on a lane: offer to join at the ball return ---
    if (!ui.lane) {
      // The nearest lane's side of the ball return (both lanes share it).
      const dist = (id: LaneId) => {
        const s = joinSpot(id);
        return Math.hypot(playerState.position.x - s.x, playerState.position.z - s.z);
      };
      const near = LANES.filter((l) => dist(l.id) < JOIN_REACH).sort((a, b) => dist(a.id) - dist(b.id))[0];
      const prompt = near ? `Bowl on lane ${near.id}` : null;
      if (prompt !== ui.prompt) set({ prompt });
      if (near && consumePress("KeyE")) joinLane(near.id);
      return;
    }

    const id = ui.lane;
    const laneSpec = laneById(id)!;
    const lane = useLanes.getState().lanes[id];
    const render = laneRender[id];
    const myTurn = lane.bowlers[lane.turn]?.id === myId() && lane.phase === "aim";
    const atLine = ui.mode === "aim" || ui.mode === "power" || ui.mode === "curve" || ui.mode === "throw";

    // E leaves the lane (not mid-ball), or starts a new game once this one's over.
    const canLeave = ui.mode === "wait" || ui.mode === "aim";
    const over = lane.phase === "over";
    const prompt = canLeave ? (over ? "New game" : "Leave the lane") : null;
    if (prompt !== ui.prompt) set({ prompt });
    if (canLeave && consumePress("KeyE")) return over ? joinLane(id) : leaveLane();

    // --- your turn: stand at the line ---
    if (ui.mode === "wait" && myTurn) {
      mode("aim");
      startTurn(r, render, lane.standing);
    }
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
      laneDriver.rolling(id);
      const at = laneToWorld(laneSpec, 0, 0, s.z);
      void playAt("ball-roll", at[0], at[1], at[2], 0.9, 10);
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
        if (b.gutter) {
          mode("pins");
          r.deck = null;
        } else {
          r.deck ??= new PinDeck();
          r.deck.rack(r.before === ALL_PINS ? null : render.pins);
          r.deck.launch(b);
          r.crashed = false;
          mode("pins");
        }
      }
    }

    // --- the crash: physics until the pins settle ---
    if (ui.mode === "pins") {
      shot(laneSpec, [LANE.headPin - 4.6, 1.05, 0], [LANE.headPin + 0.4, 0.12, 0]);
      const deck = r.deck;
      let standing: boolean[];
      if (deck) {
        deck.step(dt);
        deck.write(render);
        if (!r.crashed && deck.time > 0.2) {
          r.crashed = true;
          const moved = render.pins.filter((p, i) => !p.gone && Math.hypot(p.p.x - PIN_SPOTS[i]!.x, p.p.z - PIN_SPOTS[i]!.z) > 0.03).length;
          const at = laneToWorld(laneSpec, LANE.headPin, 0.3, 0);
          if (moved > 0) void playAt(moved >= 4 ? "pin-crash" : "pin-tap", at[0], at[1], at[2], moved >= 4 ? 1.1 : 0.7, 9);
        }
        if (!deck.settled()) return;
        standing = deck.standing();
      } else {
        // Gutter ball: roll on into the pit; the pins don't move.
        const b = r.ball!;
        b.x += b.vx * dt;
        render.ball.p.set(b.x, ballY(b) - Math.max(0, b.x - LANE.pitEdge) * 0.6, b.z);
        if (r.t < 1.4) return;
        standing = PIN_SPOTS.map((_, i) => (r.before & (1 << i)) !== 0);
      }
      // Count what fell (of the pins that were up for this ball).
      let knocked = 0;
      standing.forEach((up, i) => {
        if (!up && r.before & (1 << i)) knocked |= 1 << i;
      });
      laneDriver.result(id, knocked);
      announce(knocked, r.before, !deck);
      const after = useLanes.getState().lanes[id];
      r.setter = new Pinsetter(render, standing.map((s, i) => s && (r.before & (1 << i)) !== 0), after.standing === ALL_PINS);
      void playAt("sweep", ...laneToWorld(laneSpec, LANE.headPin, 0.6, 0), 0.6, 6);
      mode("sweep");
    }

    // --- the pinsetter clears up; then back to the line, or wait for your next turn ---
    if (ui.mode === "sweep" && r.setter) {
      if (r.setter.update(dt)) {
        r.setter = null;
        const after = useLanes.getState().lanes[id];
        if (after.standing === ALL_PINS) rackPins(render);
        laneDriver.ready(id);
        void playAt("ball-return", ...RETURN_HOOD, 0.6, 5);
        mode("wait");
        if (after.phase === "over") releaseLine();
      } else shot(laneSpec, [LANE.headPin - 4.6, 1.05, 0], [LANE.headPin + 0.4, 0.12, 0]);
    }
    if (ui.mode === "wait") releaseLine();
  });

  return null;
}

function startTurn(r: Run, render: (typeof laneRender)["1"], standing: number) {
  r.before = standing;
  r.ball = null;
  render.ball.visible = false;
  playerState.bowlReleased = false;
}

/** Step back from the line: the bear and camera are yours again. */
function releaseLine() {
  playerState.hold = null;
  cameraState.override = null;
  cameraState.mouse = null;
}

function joinLane(id: LaneId) {
  laneDriver.join(id, myName());
  rackPins(laneRender[id]);
  useBowling.setState({ lane: id, mode: "wait", aim: 0, z: 0.2, prompt: null });
}

function leaveLane() {
  const { lane } = useBowling.getState();
  if (lane) laneDriver.leave(lane);
  releaseLine();
  useBowling.setState({ lane: null, mode: "off", prompt: null });
}

/** STRIKE! / SPARE! / GUTTER / n pins, and a celebration for a strike. */
function announce(knockedMask: number, before: number, gutter: boolean) {
  const n = popcountMask(knockedMask);
  const fresh = before === ALL_PINS;
  let text = n === 1 ? "1 pin" : `${n} pins`, big = false;
  if (fresh && n === 10) (text = "STRIKE!"), (big = true), (playerState.celebrateRequest = true);
  else if (!fresh && popcountMask(before) === n && n > 0) (text = "SPARE!"), (big = true);
  else if (gutter) text = "Gutter";
  else if (n === 0) text = "Miss";
  useBowling.setState({ banner: { text, big, at: performance.now() } });
}

const popcountMask = (m: number) => PIN_SPOTS.reduce((n, _, i) => n + ((m >> i) & 1), 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Who "you" are on the lanes (the practice lane in this browser, 3.2). */
const myId = () => LOCAL_ID;
const myName = () => {
  const p = usePartyStore.getState();
  return p.players.find((x) => x.id === p.sessionId)?.name ?? "You";
};
/** The ball return's hood, where balls pop back up (world). */
const RETURN_HOOD = toWorld([BALL_RETURN.x + 0.45, PLATFORM_Y + 0.6, BALL_RETURN.z]);

/** Point the camera from/at lane coordinates. */
function shot(lane: LaneSpec, from: [number, number, number], look: [number, number, number]) {
  cameraState.override = { from: v(laneToWorld(lane, ...from)), look: v(laneToWorld(lane, ...look)) };
}
