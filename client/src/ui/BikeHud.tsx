import { MPH } from "@den/shared";
import { useEffect, useRef, useState } from "react";
import { playerState } from "../game/state.ts";

// The motorcycle's dials (Andrew, round 3): a speedometer in mph, the gear, a rev bar with a red zone,
// and whether the box is automatic or manual. Shown only while riding. The needle and numbers are
// written straight to the page every frame (they change 60 times a second).

const MAX_MPH = 160;
/** The dial's sweep: from 225° (bottom left) clockwise round to −45° (bottom right). */
const A0 = 225, SWEEP = 270;
const R = 74, C = 90;

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C - r * Math.sin(a)] as const;
};
const angleFor = (mph: number) => A0 - (SWEEP * Math.min(MAX_MPH, mph)) / MAX_MPH;

const TICKS = Array.from({ length: MAX_MPH / 10 + 1 }, (_, i) => i * 10);

export function BikeHud() {
  const [riding, setRiding] = useState(playerState.riding);
  useEffect(() => {
    const id = setInterval(() => setRiding(playerState.riding), 100);
    return () => clearInterval(id);
  }, []);
  return riding ? <Dials /> : null;
}

function Dials() {
  const needle = useRef<SVGLineElement>(null);
  const mph = useRef<HTMLElement>(null);
  const gear = useRef<HTMLElement>(null);
  const revs = useRef<HTMLDivElement>(null);
  const mode = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const b = playerState.bike;
      const speed = Math.abs(b.speed) * MPH;
      const [x, y] = polar(angleFor(speed), R - 12);
      needle.current?.setAttribute("x2", x.toFixed(1));
      needle.current?.setAttribute("y2", y.toFixed(1));
      if (mph.current) mph.current.textContent = String(Math.round(speed));
      if (gear.current) gear.current.textContent = b.speed < -0.2 ? "R" : String(b.gear);
      if (revs.current) revs.current.style.width = `${Math.round(b.revs * 100)}%`;
      if (mode.current) mode.current.textContent = b.manual ? "Manual" : "Auto";
      root.current?.classList.toggle("redline", b.revs > 0.93);
      root.current?.classList.toggle("refused", performance.now() - b.refusedAt < 350);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const [ax, ay] = polar(A0, R), [bx, by] = polar(A0 - SWEEP, R);
  return (
    <div className="bike-hud" data-testid="bike-hud" ref={root}>
      <svg viewBox="0 0 180 180" className="bike-dial" aria-hidden>
        <path d={`M ${ax} ${ay} A ${R} ${R} 0 1 1 ${bx} ${by}`} className="dial-arc" />
        {TICKS.map((t) => {
          const big = t % 20 === 0;
          const [x1, y1] = polar(angleFor(t), R), [x2, y2] = polar(angleFor(t), R - (big ? 10 : 5));
          const [tx, ty] = polar(angleFor(t), R - 20);
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className={big ? "tick big" : "tick"} />
              {big && <text x={tx} y={ty + 3.5} className="tick-label">{t}</text>}
            </g>
          );
        })}
        <line ref={needle} x1={C} y1={C} x2={C} y2={C} className="needle" />
        <circle cx={C} cy={C} r={5} className="hub" />
      </svg>
      <div className="bike-readout">
        <b ref={mph} data-testid="bike-mph">0</b>
        <span>mph</span>
      </div>
      <div className="bike-gear">
        <span>Gear</span>
        <b ref={gear} data-testid="bike-gear">1</b>
        <i ref={mode} data-testid="bike-mode">Auto</i>
      </div>
      <div className="bike-revs" aria-hidden>
        <div ref={revs} />
      </div>
      <div className="bike-keys"><b>Q</b>/<b>Z</b> shift · <b>M</b> auto/manual<br /><b>Space</b> wheelie</div>
    </div>
  );
}
