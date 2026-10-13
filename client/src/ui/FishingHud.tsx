import { formatWeight, speciesById } from "@den/shared";
import { useEffect, useState } from "react";
import { useCastUi } from "../game/fishing/FishingControls.tsx";
import { useFishStore } from "../net/party.ts";

// The fishing HUD (GAME_SPEC §11.5, §13): the cast power bar, "FISH ON! Spam R", the tension
// meter while you fight, "Snapped!" / "It got away", the catch card (species, weight, personal
// best), and a note when someone else in the party lands one.

const CARD_MS = 4500;

function useNow(ms: number) {
  const [now, setNow] = useState(performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function FishingHud() {
  const me = useFishStore((s) => s.me);
  const catches = useFishStore((s) => s.catches);
  const { charging, power, hint, hintAt } = useCastUi();
  const now = useNow(250);
  const mine = [...catches].reverse().find((c) => c.mine && now - c.at < CARD_MS);
  const others = catches.filter((c) => !c.mine && now - c.at < CARD_MS);
  const tensionColor = me.tension > 0.8 ? "#e2483a" : me.tension > 0.55 ? "#f0b43c" : "#5fbf6a";

  return (
    <div className="fishing-hud" data-testid="fishing-hud" data-state={me.state} data-rod={me.rod ? "yes" : "no"}>
      {charging && (
        <div className="cast-power" data-testid="cast-power">
          <span>Cast</span>
          <div className="bar"><div style={{ width: `${Math.round(power * 100)}%` }} /></div>
        </div>
      )}
      {hint && now - hintAt < 2500 && <div className="fish-hint">{hint}</div>}
      {me.state === "bite" && <div className="fish-on" data-testid="fish-on">FISH ON! <b>Spam R</b></div>}
      {me.state === "fight" && (
        <div className="tension" data-testid="tension">
          <div className="tension-label"><span>Tension</span><span>{Math.max(0, me.line).toFixed(0)} m of line · <b>R</b> reel</span></div>
          <div className="bar"><div style={{ width: `${Math.round(Math.min(1, me.tension) * 100)}%`, background: tensionColor }} /></div>
        </div>
      )}
      {me.state === "snapped" && <div className="fish-result">Snapped!</div>}
      {me.state === "missed" && <div className="fish-result">It got away…</div>}
      {mine && (
        <div className="catch-card" data-testid="catch-card">
          <div className="catch-species">{speciesById(mine.species)?.name ?? mine.species}</div>
          <div className="catch-weight">{formatWeight(mine.weight)}</div>
          {mine.best && <div className="catch-best">New personal best!</div>}
        </div>
      )}
      {others.map((c) => (
        <div key={`${c.id}${c.at}`} className="catch-toast" data-testid="catch-toast">
          <b>{c.name}</b> caught a {formatWeight(c.weight)} {speciesById(c.species)?.name.toLowerCase() ?? c.species}
        </div>
      ))}
      {me.rod && !me.state && !charging && <div className="fish-help">Hold <b>left mouse</b> to cast · <b>E</b> at the bucket puts the rod back</div>}
      {me.state === "cast" && <div className="fish-help">Waiting for a bite… · <b>R</b> winds the line in</div>}
    </div>
  );
}
