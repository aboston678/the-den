import { useEffect, useRef } from "react";
import { LOGO_AT, LYRICS, cueOpacity } from "./lyrics.ts";
import { INTRO_LENGTH, introTime, skipIntro, startIntro } from "./music.ts";

// The lyric-video intro (GAME_SPEC §11), drawn over the 3D backdrop (<IntroBackdrop>): the song plays, the words come in line by line, the logo
// fades in when the music kicks in, and at the end (or on Skip) you're in. Everything follows the
// song's own clock, so the words stay in time with the singing.

export function Intro({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const lines = useRef<(HTMLDivElement | null)[]>([]);
  const logo = useRef<HTMLImageElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  const finish = (skipped: boolean) => {
    if (done.current) return;
    done.current = true;
    if (skipped) void skipIntro();
    onDone();
  };

  useEffect(() => {
    void startIntro();
    let raf = 0;
    const tick = () => {
      const t = introTime();
      if (root.current) root.current.dataset.t = t.toFixed(2); // for tests
      LYRICS.forEach((c, i) => {
        const el = lines.current[i];
        if (!el) return;
        const o = cueOpacity(c, t);
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 14}px)`;
      });
      if (logo.current) {
        const o = Math.min(1, Math.max(0, (t - LOGO_AT) / 1.6));
        logo.current.style.opacity = String(o);
        logo.current.style.transform = `scale(${0.94 + 0.06 * o})`;
        if (shade.current) shade.current.style.opacity = String(o);
      }
      if (t >= INTRO_LENGTH) finish(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") finish(true);
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={root} className="intro-overlay" data-testid="intro">
      <div className="intro-vignette" />
      {LYRICS.map((c, i) => (
        <div key={c.text} ref={(el) => { lines.current[i] = el; }} className="intro-lyric" data-testid={`lyric-${i}`}>
          {c.text}
        </div>
      ))}
      <div ref={shade} className="intro-logo-shade" />
      <img ref={logo} className="intro-logo" src="/ui/logo.png" alt="The Den" data-testid="intro-logo" />
      <button className="intro-skip" data-testid="skip-intro" onClick={() => finish(true)}>
        Skip intro ›
      </button>
    </div>
  );
}
