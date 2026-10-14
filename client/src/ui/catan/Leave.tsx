import { endVotesNeeded, type CatanGame, type CatanView } from "@den/shared";
import { useEffect, useState } from "react";
import { catanSend } from "../../net/party.ts";
import { closeAll, openPanel } from "../../game/catan/ui.ts";

// Stopping a game early (Andrew, GAME_SPEC §16): leave on your own (your cards go back to the bank,
// your pieces stay), or call a vote: if more than half of the players still in say yes, the game
// ends for everyone with no winner.

/** Top-right: vote to end, and leave. */
export function GameMenu({ view }: { view: CatanView }) {
  return (
    <div className="catan-menu" data-testid="catan-menu">
      <button type="button" disabled={!!view.endVote} data-testid="catan-vote-end" onClick={() => catanSend.act({ type: "proposeEnd" })}>
        Vote to end game
      </button>
      <button type="button" data-testid="catan-leave" onClick={() => openPanel("leave")}>Leave game</button>
    </div>
  );
}

/** "Are you sure?" before leaving (the Leave button, or E to get up). */
export function LeaveConfirm({ view }: { view: CatanView }) {
  const left = view.players.filter((p) => !p.gone).length - 1;
  return (
    <div className="catan-panel catan-modal" data-testid="catan-leave-confirm">
      <h3>Leave this game?</h3>
      <p className="note">
        Your cards go back to the bank and your pieces stay on the board.
        {left < 2 ? " With only one player left, the game ends with no winner." : " The others keep playing."}
      </p>
      <div className="row">
        <button type="button" className="primary" data-testid="catan-leave-go" onClick={() => {
          closeAll();
          catanSend.stand();
        }}>Leave and get up</button>
        <button type="button" data-testid="catan-leave-cancel" onClick={closeAll}>Keep playing</button>
      </div>
    </div>
  );
}

/** The vote everyone at the table sees, with Yes / No for anyone who hasn't answered. */
export function EndVote({ view, me }: { view: CatanView; me: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const v = view.endVote;
  if (!v) return null;
  const yes = v.votes.filter((x, i) => x === true && !view.players[i]!.gone).length;
  const need = endVotesNeeded(view as unknown as CatanGame);
  const caller = me === v.by ? "You want" : `${view.players[v.by]?.name ?? "Someone"} wants`;
  const answer = me >= 0 ? v.votes[me] : undefined;
  return (
    <div className="catan-panel catan-vote" data-testid="catan-end-vote">
      <div><b>{caller} to end the game.</b> {yes} of {need} yes votes needed ({Math.max(0, Math.ceil((v.until - now) / 1000))} s)</div>
      {answer === null ? (
        <div className="row">
          <button type="button" className="primary" data-testid="catan-vote-yes" onClick={() => catanSend.act({ type: "voteEnd", yes: true })}>Yes, end it</button>
          <button type="button" data-testid="catan-vote-no" onClick={() => catanSend.act({ type: "voteEnd", yes: false })}>No, keep playing</button>
        </div>
      ) : (
        answer !== undefined && <div className="note">You voted {answer ? "yes" : "no"}.</div>
      )}
    </div>
  );
}

/** True when the last game ended by a vote. */
export const endedByVote = (view: CatanView) => view.phase === "over" && view.winner === null && view.log.at(-1) === "The table voted to end the game";
