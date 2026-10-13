import { useCastUi } from "../game/fishing/FishingControls.tsx";
import { useDoorPrompt } from "../game/house/Doors.tsx";

/** "E  Open door" when you're next to something you can use. The real HUD arrives in milestone 1.11. */
export function ActionPrompt() {
  const door = useDoorPrompt((s) => s.text);
  const bucket = useCastUi((s) => s.prompt);
  const text = door ?? bucket;
  if (!text) return null;
  return (
    <div className="action-prompt" data-testid="action-prompt">
      {text === "Locked" ? <span>Locked</span> : <><b>E</b> {text}</>}
    </div>
  );
}
