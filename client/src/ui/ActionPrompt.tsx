import { useBowling } from "../game/bowling/session.ts";
import { useCatanPrompt } from "../game/catan/CatanControls.tsx";
import { useC4Prompt } from "../game/connect4/Connect4Controls.tsx";
import { useBikePrompt } from "../game/bike/BikeControls.tsx";
import { useCastUi } from "../game/fishing/FishingControls.tsx";
import { useDoorPrompt } from "../game/house/Doors.tsx";

/** "E  Open door" when you're next to something you can use. The real HUD arrives in milestone 1.11. */
export function ActionPrompt() {
  const door = useDoorPrompt((s) => s.text);
  const bucket = useCastUi((s) => s.prompt);
  const bowl = useBowling((s) => (s.mode === "off" || s.mode === "wait" ? s.prompt : null)); // on the line, the bowling HUD says it
  const seat = useCatanPrompt((s) => s.text);
  const c4 = useC4Prompt((s) => s.text);
  const bike = useBikePrompt((s) => s.text);
  const text = door ?? bike ?? bucket ?? bowl ?? seat ?? c4;
  if (!text) return null;
  return (
    <div className="action-prompt" data-testid="action-prompt">
      {text === "Locked" ? <span>Locked</span> : <><b>E</b> {text}</>}
    </div>
  );
}
