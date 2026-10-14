import { RESOURCES, type Hand, type Resource } from "@den/shared";
import { RESOURCE_COLOURS, RESOURCE_LABELS } from "../../game/catan/textures.ts";
import { SEAT_COLOURS } from "../../game/catan/store.ts";

// Small shared pieces of the Catan HUD.

export { RESOURCES, RESOURCE_COLOURS, RESOURCE_LABELS };

export const DEV_NAMES = { knight: "Knight", vp: "Victory Point", roadBuilding: "Road Building", yearOfPlenty: "Year of Plenty", monopoly: "Monopoly" } as const;

export const DEV_HELP = {
  knight: "Move the robber and steal a card. 3 knights can earn Largest Army.",
  vp: "1 victory point, kept secret until the game ends.",
  roadBuilding: "Build 2 roads for free.",
  yearOfPlenty: "Take any 2 resources from the bank.",
  monopoly: "Name a resource: everyone gives you all of theirs.",
} as const;

/** A coloured chip for a player's seat. */
export function Chip({ seat }: { seat: number }) {
  return <span className="catan-chip" style={{ background: SEAT_COLOURS[seat] }} />;
}

/** A resource card with a count. */
export function Card({ r, n, small, onClick, picked }: { r: Resource; n?: number; small?: boolean; onClick?: () => void; picked?: boolean }) {
  return (
    <button
      type="button"
      className={`catan-card${small ? " small" : ""}${picked ? " picked" : ""}`}
      style={{ background: RESOURCE_COLOURS[r] }}
      onClick={onClick}
      disabled={!onClick}
      data-testid={`card-${r}`}
    >
      <span className="label">{RESOURCE_LABELS[r]}</span>
      {n !== undefined && <span className="count">{n}</span>}
    </button>
  );
}

/** "2 Brick, 1 Ore". */
export function describe(h: Partial<Hand>) {
  return RESOURCES.filter((r) => (h[r] ?? 0) > 0).map((r) => `${h[r]} ${RESOURCE_LABELS[r]}`).join(", ") || "nothing";
}

/** A row of + / − counters for picking cards. */
export function Picker({ value, onChange, max }: { value: Partial<Hand>; onChange: (v: Partial<Hand>) => void; max?: Partial<Hand> }) {
  return (
    <div className="catan-picker">
      {RESOURCES.map((r) => {
        const n = value[r] ?? 0;
        const top = max ? (max[r] ?? 0) : 19;
        return (
          <div key={r} className="catan-pick">
            <Card r={r} n={n} small />
            <div className="pm">
              <button type="button" data-testid={`minus-${r}`} disabled={n <= 0} onClick={() => onChange({ ...value, [r]: n - 1 })}>−</button>
              <button type="button" data-testid={`plus-${r}`} disabled={n >= top} onClick={() => onChange({ ...value, [r]: n + 1 })}>+</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const total = (h: Partial<Hand>) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);
