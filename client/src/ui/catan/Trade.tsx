import { tradeRatios, type CatanPrivate, type CatanView, type Hand, type Resource } from "@den/shared";
import { useState } from "react";
import { catanSend } from "../../net/party.ts";
import { asGame, closeAll } from "../../game/catan/ui.ts";
import { Card, Chip, Picker, RESOURCES, RESOURCE_LABELS, describe, total } from "./common.tsx";

// Trading (GAME_SPEC §16): with the bank (4:1, or 3:1 / 2:1 with a harbor) and with players: on
// your turn you offer cards for cards; others accept, decline or counter; you pick who to trade with.

export function TradePanel({ view, mine, me }: { view: CatanView; mine: CatanPrivate; me: number }) {
  const ratios = tradeRatios(asGame(view), me);
  const [give, setGive] = useState<Resource | null>(null);
  const [get, setGet] = useState<Resource | null>(null);
  const [offerGive, setOfferGive] = useState<Partial<Hand>>({});
  const [offerGet, setOfferGet] = useState<Partial<Hand>>({});
  const bankOk = give && get && give !== get && mine.hand[give] >= ratios[give] && view.bank[get] > 0;

  return (
    <div className="catan-panel catan-trade" data-testid="catan-trade-panel">
      <button type="button" className="close" onClick={closeAll}>×</button>
      <h3>Trade with the bank</h3>
      <p className="note">Give</p>
      <div className="catan-hand">
        {RESOURCES.map((r) => (
          <Card key={r} r={r} n={ratios[r]} small picked={give === r} onClick={mine.hand[r] >= ratios[r] ? () => setGive(r) : undefined} />
        ))}
      </div>
      <p className="note">Get 1</p>
      <div className="catan-hand">
        {RESOURCES.map((r) => <Card key={r} r={r} small picked={get === r} onClick={r !== give && view.bank[r] > 0 ? () => setGet(r) : undefined} />)}
      </div>
      <button type="button" className="primary" disabled={!bankOk} data-testid="catan-bank-trade" onClick={() => {
        catanSend.act({ type: "bankTrade", give: give!, get: get! });
        setGive(null);
        setGet(null);
      }}>
        {give && get ? `Trade ${ratios[give]} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[get]}` : "Pick what to give and get"}
      </button>

      <h3>Offer the table</h3>
      <p className="note">You give</p>
      <Picker value={offerGive} onChange={setOfferGive} max={mine.hand} />
      <p className="note">You want</p>
      <Picker value={offerGet} onChange={setOfferGet} />
      <button type="button" className="primary" disabled={total(offerGive) === 0 || total(offerGet) === 0} data-testid="catan-send-offer" onClick={() => {
        catanSend.act({ type: "offer", give: offerGive, get: offerGet });
      }}>
        Send offer
      </button>
    </div>
  );
}

/** The offer on the table: replies for the player who made it, Accept / Decline / Counter for everyone else. */
export function OfferCard({ view, mine, me }: { view: CatanView; mine: CatanPrivate | null; me: number }) {
  const offer = view.offer;
  const [countering, setCountering] = useState(false);
  const [cGive, setCGive] = useState<Partial<Hand>>({});
  const [cGet, setCGet] = useState<Partial<Hand>>({});
  if (!offer || view.phase !== "main") return null;
  const from = view.players[view.turn]!;
  const mineToConfirm = view.turn === me;
  const has = (h: Partial<Hand>) => !!mine && RESOURCES.every((r) => mine.hand[r] >= (h[r] ?? 0));

  if (mineToConfirm) {
    return (
      <div className="catan-panel catan-offer" data-testid="catan-offer">
        <h3>Your offer</h3>
        <p>You give <b>{describe(offer.give)}</b> for <b>{describe(offer.get)}</b></p>
        {view.players.map((p, i) => {
          if (i === me || p.gone) return null;
          const r = offer.replies[i];
          return (
            <div key={p.id} className="reply">
              <Chip seat={p.seat} /> {p.name}:{" "}
              {!r && <i>thinking…</i>}
              {r?.kind === "decline" && <i>no thanks</i>}
              {r?.kind === "accept" && <button type="button" className="primary" data-testid={`confirm-${i}`} onClick={() => catanSend.act({ type: "confirmTrade", with: i })}>Trade with {p.name}</button>}
              {r?.kind === "counter" && (
                <>
                  counters: they give <b>{describe(r.give)}</b> for <b>{describe(r.get)}</b>{" "}
                  <button type="button" className="primary" data-testid={`confirm-${i}`} onClick={() => catanSend.act({ type: "confirmTrade", with: i })}>Accept</button>
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="quiet" onClick={() => catanSend.act({ type: "cancelOffer" })}>Cancel offer</button>
      </div>
    );
  }

  if (!mine) return null;
  const reply = offer.replies[me];
  return (
    <div className="catan-panel catan-offer" data-testid="catan-offer">
      <h3><Chip seat={from.seat} /> {from.name} offers</h3>
      <p><b>{describe(offer.give)}</b> for your <b>{describe(offer.get)}</b></p>
      {reply && !countering && <p className="note">You {reply.kind === "accept" ? "accepted" : reply.kind === "decline" ? "said no" : "sent a counter-offer"}.</p>}
      {!countering ? (
        <div className="row">
          <button type="button" className="primary" disabled={!has(offer.get)} data-testid="catan-accept" onClick={() => catanSend.act({ type: "reply", offer: offer.id, reply: { kind: "accept" } })}>Accept</button>
          <button type="button" data-testid="catan-decline" onClick={() => catanSend.act({ type: "reply", offer: offer.id, reply: { kind: "decline" } })}>No thanks</button>
          <button type="button" data-testid="catan-counter" onClick={() => {
            setCGive({ ...offer.get });
            setCGet({ ...offer.give });
            setCountering(true);
          }}>Counter</button>
        </div>
      ) : (
        <>
          <p className="note">You give</p>
          <Picker value={cGive} onChange={setCGive} max={mine.hand} />
          <p className="note">You want</p>
          <Picker value={cGet} onChange={setCGet} />
          <div className="row">
            <button type="button" className="primary" disabled={total(cGive) === 0 || total(cGet) === 0} data-testid="catan-send-counter" onClick={() => {
              catanSend.act({ type: "reply", offer: offer.id, reply: { kind: "counter", give: cGive, get: cGet } });
              setCountering(false);
            }}>Send counter</button>
            <button type="button" className="quiet" onClick={() => setCountering(false)}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}
