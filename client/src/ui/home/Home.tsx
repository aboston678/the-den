import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@den/shared";
import { useState } from "react";
import { createParty, joinParty, leaveParty, savedNickname, startGame, usePartyStore } from "../../net/party.ts";
import { SettingsPanel } from "../Settings.tsx";
import { HomeStage, type StageBear } from "./HomeStage.tsx";

/**
 * The home screen (GAME_SPEC §11.3): your bear on a pedestal with your party around you, and the
 * party controls: create or join with a code, the big party code, PLAY for the host, settings.
 */
export function Home() {
  const { status, error, code, sessionId, hostId, players } = usePartyStore();
  const [name, setName] = useState(savedNickname);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  // You in the middle, then everyone else in the order they joined.
  const bears: StageBear[] = inParty
    ? [
        ...players.filter((p) => p.id === sessionId).map((p) => ({ id: p.id, name: p.name, you: true })),
        ...players.filter((p) => p.id !== sessionId).map((p) => ({ id: p.id, name: p.name, you: false })),
      ]
    : [{ id: "me", name: name.trim() || "Bear", you: true }];

  return (
    <div className="home" data-testid="lobby">
      <HomeStage bears={bears} />
      <div className="home-panel">
        <img className="home-logo" src="/ui/logo.png" alt="The Den" />
        {!inParty ? (
          <div className="panel">
            <label className="field">
              Your name
              <input data-testid="nickname" value={name} maxLength={NICKNAME_MAX_LENGTH} placeholder="Bear" onChange={(e) => setName(e.target.value)} />
            </label>
            <button data-testid="create" className="primary big" disabled={busy} onClick={() => createParty(name)}>
              Create party
            </button>
            <div className="home-join">
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
            {busy && <p className="note">Connecting…</p>}
            {error && <p className="error" data-testid="lobby-error">{error}</p>}
          </div>
        ) : (
          <div className="panel">
            <p className="note">Party code</p>
            <div className="home-code">
              <span data-testid="party-code">{code}</span>
              <button onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <p className="note">Bears ({players.length}/{MAX_PLAYERS})</p>
            <ul className="home-players" data-testid="party-list">
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
              <button data-testid="play" className="primary big" onClick={startGame}>
                Play
              </button>
            ) : (
              <p className="note">Waiting for the host to press Play…</p>
            )}
            <button data-testid="leave" className="quiet" onClick={() => leaveParty()}>
              Leave party
            </button>
          </div>
        )}
        <button className="quiet home-settings" data-testid="open-settings" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
