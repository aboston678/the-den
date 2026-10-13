import { useEffect, useState } from "react";
import { type Friendship, accept, addFriend, friendships, removeFriendship, searchBears, sortFriendships } from "../../net/social.ts";

// Friends (GAME_SPEC §14): find a bear by username, send a request, accept or decline requests,
// and see (or remove) your friends. The Friends leaderboard tab shows just you and them.

export function FriendsPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Friendship[] | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; username: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const reload = () => void friendships().then(setList);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => void searchBears(query).then(setFound), 250);
    return () => clearTimeout(id);
  }, [query]);

  const act = async (job: Promise<string | null>, ok: string) => {
    const err = await job;
    setMessage(err ?? ok);
    reload();
  };
  const groups = sortFriendships(list ?? []);
  const known = new Map((list ?? []).map((f) => [f.otherId, f]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel friends" data-testid="friends" onClick={(e) => e.stopPropagation()}>
        <h2>Friends</h2>
        <label className="field">
          Find a bear by username
          <input data-testid="friend-search" value={query} placeholder="Start typing a username" onChange={(e) => setQuery(e.target.value)} />
        </label>
        {found.length > 0 && (
          <ul className="friend-rows">
            {found.map((b) => {
              const f = known.get(b.id);
              return (
                <li key={b.id}>
                  <span>{b.username}</span>
                  {f?.status === "accepted" ? <span className="tag">friend</span>
                    : f?.direction === "outgoing" ? <span className="tag">requested</span>
                    : <button onClick={() => void act(addFriend(b.id), `Request sent to ${b.username}.`)}>{f ? "Accept" : "Add friend"}</button>}
                </li>
              );
            })}
          </ul>
        )}
        {message && <p className="note" data-testid="friends-message">{message}</p>}

        {groups.incoming.length > 0 && (
          <>
            <h3>Requests</h3>
            <ul className="friend-rows" data-testid="incoming">
              {groups.incoming.map((f) => (
                <li key={f.otherId}>
                  <span>{f.otherName}</span>
                  <span className="actions">
                    <button className="primary" onClick={() => void act(accept(f.otherId), `You and ${f.otherName} are friends.`)}>Accept</button>
                    <button className="quiet" onClick={() => void act(removeFriendship(f), "Declined.")}>Decline</button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3>Your friends</h3>
        {list === null ? <p className="note">Loading…</p> : groups.friends.length === 0 ? (
          <p className="note">No friends yet. Find your friends by username above.</p>
        ) : (
          <ul className="friend-rows" data-testid="friend-list">
            {groups.friends.map((f) => (
              <li key={f.otherId}>
                <span>{f.otherName}</span>
                <button className="quiet" onClick={() => confirm(`Remove ${f.otherName} from your friends?`) && void act(removeFriendship(f), `Removed ${f.otherName}.`)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {groups.outgoing.length > 0 && (
          <>
            <h3>Waiting for them to accept</h3>
            <ul className="friend-rows">
              {groups.outgoing.map((f) => (
                <li key={f.otherId}>
                  <span>{f.otherName}</span>
                  <button className="quiet" onClick={() => void act(removeFriendship(f), "Request cancelled.")}>Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** How many friend requests are waiting for you (for the badge on the Friends button). */
export function usePendingRequests(active: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const load = () => void friendships().then((l) => setN(sortFriendships(l).incoming.length));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [active]);
  return n;
}
