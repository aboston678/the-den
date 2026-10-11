import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@den/shared";
import { useState } from "react";
import { createParty, joinParty, leaveParty, savedNickname, startGame, usePartyStore } from "../net/party.ts";

/**
 * Temporary party screen (milestone 1.7): nickname, create/join, the party list and PLAY.
 * The Fortnite-style home screen replaces it in milestone 1.11.
 */
export function Lobby() {
  const { status, error, code, sessionId, hostId, players } = usePartyStore();
  const [name, setName] = useState(savedNickname);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const busy = status === "connecting";
  const inParty = status === "in-party" || status === "reconnecting";
  const isHost = hostId === sessionId;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  return (
    <div className="lobby" data-testid="lobby">
      <h1>THE DEN</h1>
      {!inParty ? (
        <div className="lobby-card">
          <label>
            Your name
            <input
              data-testid="nickname"
              value={name}
              maxLength={NICKNAME_MAX_LENGTH}
              placeholder="Bear"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button data-testid="create" disabled={busy} onClick={() => createParty(name)}>
            Create party
          </button>
          <div className="lobby-join">
            <input
              data-testid="join-code"
              value={joinCode}
              maxLength={ROOM_CODE_LENGTH + 2}
              placeholder="Party code"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && joinParty(joinCode, name)}
            />
            <button data-testid="join" disabled={busy} onClick={() => joinParty(joinCode, name)}>
              Join party
            </button>
          </div>
          {busy && <p className="lobby-note">Connecting…</p>}
          {error && <p className="lobby-error" data-testid="lobby-error">{error}</p>}
        </div>
      ) : (
        <div className="lobby-card">
          <p className="lobby-note">Party code</p>
          <div className="lobby-code">
            <span data-testid="party-code">{code}</span>
            <button onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
          </div>
          <p className="lobby-note">Bears ({players.length}/{MAX_PLAYERS})</p>
          <ul className="lobby-players" data-testid="party-list">
            {players.map((p) => (
              <li key={p.id} className={p.connected ? "" : "away"}>
                {p.name}
                {p.id === hostId && <span className="tag">host</span>}
                {p.id === sessionId && <span className="tag">you</span>}
                {!p.connected && <span className="tag">reconnecting…</span>}
              </li>
            ))}
          </ul>
          {isHost ? (
            <button data-testid="play" className="primary" onClick={startGame}>
              Play
            </button>
          ) : (
            <p className="lobby-note">Waiting for the host to press Play…</p>
          )}
          <button data-testid="leave" className="quiet" onClick={() => leaveParty()}>
            Leave party
          </button>
        </div>
      )}
    </div>
  );
}
