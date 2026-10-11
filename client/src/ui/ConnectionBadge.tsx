import { usePartyStore } from "../net/party.ts";

const LABELS = {
  idle: "Server: offline",
  connecting: "Server: connecting…",
  connected: "Server: connected",
  error: "Server: unreachable",
} as const;

/** Small debug badge in the corner. Replaced by the real HUD in milestone 1.11. */
export function ConnectionBadge() {
  const status = usePartyStore((s) => s.status);
  const playerCount = usePartyStore((s) => s.playerCount);

  return (
    <div className={`badge badge--${status}`} data-testid="connection-status" data-status={status}>
      <strong>THE DEN</strong>
      <span>{LABELS[status]}</span>
      {status === "connected" && <span>{playerCount} in party</span>}
    </div>
  );
}
