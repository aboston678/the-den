import { usePartyStore } from "../net/party.ts";

/** Small status badge in the corner. Replaced by the real HUD in milestone 1.11. */
export function ConnectionBadge() {
  const { status, code, players } = usePartyStore();
  const label = status === "reconnecting" ? "Reconnecting…" : `Party ${code} · ${players.length} bear${players.length === 1 ? "" : "s"}`;
  return (
    <div className={`badge badge--${status}`} data-testid="connection-status" data-status={status}>
      <strong>THE DEN</strong>
      <span>{label}</span>
    </div>
  );
}
