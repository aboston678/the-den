import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, ROOM_CODE_LENGTH } from "@den/shared";
import { useState } from "react";
import { chooseUsername, signInWithGoogle, signOut, useAuth } from "../../net/auth.ts";
import { createParty, joinParty, leaveParty, savedNickname, startGame, usePartyStore } from "../../net/party.ts";
import { SettingsPanel } from "../Settings.tsx";
import { fullscreenIfWanted, toggleFullscreen, useFullscreen } from "../fullscreen.ts";
import { HomeStage, type StageBear } from "./HomeStage.tsx";
import { FriendsPanel, usePendingRequests } from "./Friends.tsx";
import { LeaderboardPanel } from "./Leaderboard.tsx";
import { mockSocial } from "../../net/social.ts";

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
  const full = useFullscreen();
  const [social, setSocial] = useState<"leaderboard" | "friends" | null>(null);
  const busy = status === "connecting";
  const inParty = status === "in-party" || status === "reconnecting";
  const isHost = hostId === sessionId;
  const realAuth = useAuth();
  // ?mocksocial (dev builds): pretend to be signed in, with made-up friends and scores, to look at the panels.
  const auth = mockSocial ? { ...realAuth, status: "ready" as const, username: "DevBear" } : realAuth;
  const signedIn = auth.status === "ready";
  const pending = usePendingRequests(signedIn);
  /** Development builds can also play without signing in (tests, and before the keys exist). */
  const devPlay = import.meta.env.DEV && auth.status !== "ready" && auth.status !== "needs-username";
  const myName = auth.status === "ready" ? auth.username ?? "Bear" : name;

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
    : [{ id: "me", name: myName.trim() || "Bear", you: true }];

  return (
    <div className="home" data-testid="lobby">
      <HomeStage bears={bears} />
      <div className="home-panel">
        <img className="home-logo" src="/ui/logo.png" alt="The Den" />
        {!inParty ? (
          <div className="panel">
            {auth.status === "loading" && <p className="note">Checking your sign-in…</p>}
            {auth.status === "signed-out" && (
              <>
                <p className="note">Sign in to play with your friends. Your Google account is only used to log you in.</p>
                <button data-testid="google-sign-in" className="primary big" onClick={() => void signInWithGoogle()}>
                  Sign in with Google
                </button>
                {auth.error && <p className="error">{auth.error}</p>}
              </>
            )}
            {auth.status === "needs-username" && <UsernameForm />}
            {auth.status === "ready" && (
              <p className="note signed-in" data-testid="signed-in">
                Signed in as <b>{auth.username}</b> · <button className="link" data-testid="sign-out" onClick={() => void signOut()}>Sign out</button>
              </p>
            )}
            {(auth.status === "ready" || devPlay) && (
              <>
                {devPlay && (
                  <label className="field">
                    Your name <span className="dev-tag">development</span>
                    <input data-testid="nickname" value={name} maxLength={NICKNAME_MAX_LENGTH} placeholder="Bear" onChange={(e) => setName(e.target.value)} />
                  </label>
                )}
                <button data-testid="create" className="primary big" disabled={busy} onClick={() => createParty(myName)}>
                  Create party
                </button>
                <div className="home-join">
                  <input
                    data-testid="join-code"
                    value={joinCode}
                    maxLength={ROOM_CODE_LENGTH + 2}
                    placeholder="Party code"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && joinParty(joinCode, myName)}
                  />
                  <button data-testid="join" disabled={busy} onClick={() => joinParty(joinCode, myName)}>
                    Join party
                  </button>
                </div>
              </>
            )}
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
              <button data-testid="play" className="primary big" onClick={() => {
                fullscreenIfWanted();
                startGame();
              }}>
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
        {signedIn && (
          <div className="home-social">
            <button data-testid="open-leaderboard" onClick={() => setSocial("leaderboard")}>Leaderboard</button>
            <button data-testid="open-friends" onClick={() => setSocial("friends")}>
              Friends{pending > 0 && <span className="count" data-testid="request-count">{pending}</span>}
            </button>
          </div>
        )}
        <div className="home-settings">
          <button className="quiet" data-testid="open-settings" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button className="quiet" data-testid="home-fullscreen" onClick={toggleFullscreen}>
            {full ? "Leave full screen" : "Full screen"}
          </button>
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {social === "leaderboard" && <LeaderboardPanel onClose={() => setSocial(null)} />}
      {social === "friends" && <FriendsPanel onClose={() => setSocial(null)} />}
    </div>
  );
}

/** First sign-in: pick the username that goes over your bear. */
function UsernameForm() {
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setProblem(await chooseUsername(value));
    setSaving(false);
  };
  return (
    <div className="username-form">
      <label className="field">
        Pick a username: it's your name tag
        <input data-testid="username" value={value} maxLength={16} placeholder="e.g. BigBear" onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()} />
      </label>
      <p className="note">3–16 letters, numbers or _</p>
      <button data-testid="save-username" className="primary big" disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "That's me"}
      </button>
      {problem && <p className="error" data-testid="username-error">{problem}</p>}
      <button className="quiet" onClick={() => void signOut()}>Use a different Google account</button>
    </div>
  );
}
