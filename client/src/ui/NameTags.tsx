import { nameTagEls } from "../game/remote/nameTags.ts";
import { usePartyStore } from "../net/party.ts";
import { remotes } from "../net/remotes.ts";

/** One name tag per other bear; RemoteBears positions and fades them each frame. */
export function NameTags() {
  const ids = usePartyStore((s) => s.remoteIds);
  usePartyStore((s) => s.players); // re-render when names or connection status change
  return (
    <div className="name-tags">
      {ids.map((id) => {
        const bear = remotes.get(id);
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) nameTagEls.set(id, el);
              else nameTagEls.delete(id);
            }}
            className={`name-tag${bear?.connected === false ? " away" : ""}`}
            data-testid={`tag-${id}`}
            style={{ opacity: 0 }}
          >
            {bear?.name}
          </div>
        );
      })}
    </div>
  );
}
