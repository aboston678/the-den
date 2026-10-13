import { useQuality } from "../game/quality.ts";
import { type GraphicsPreset, type Settings, updateSettings, useSettings } from "./settings.ts";

// The settings panel (GAME_SPEC §11.4), from the home screen or the pause menu.

function Slider({ label, value, onChange, testId, min = 0, max = 1, step = 0.05, show = (v: number) => `${Math.round(v * 100)}%` }: {
  label: string; value: number; onChange: (v: number) => void; testId: string; min?: number; max?: number; step?: number; show?: (v: number) => string;
}) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} data-testid={testId} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{show(value)}</output>
    </label>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const tier = useQuality().tier;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel settings" data-testid="settings" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="setting">
          <span>Graphics</span>
          <select value={s.graphics} data-testid="setting-graphics" onChange={(e) => updateSettings({ graphics: e.target.value as GraphicsPreset })}>
            <option value="auto">Auto ({tier[0]!.toUpperCase() + tier.slice(1)})</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <output />
        </label>
        <p className="note setting-note">Low runs on older laptops; High adds glow and soft shadows for strong graphics cards.</p>
        <label className="setting">
          <span>Art style</span>
          <select
            value={s.artStyle} data-testid="setting-art-style"
            onChange={(e) => {
              updateSettings({ artStyle: e.target.value as Settings["artStyle"] });
              location.reload(); // shaders and trees are built for one style
            }}
          >
            <option value="cartoon">Cartoon</option>
            <option value="realistic">Realistic (old look)</option>
          </select>
          <output />
        </label>
        <Slider label="Music" value={s.music} testId="setting-music" onChange={(music) => updateSettings({ music })} />
        <Slider label="Effects" value={s.effects} testId="setting-effects" onChange={(effects) => updateSettings({ effects })} />
        <Slider label="Ambience" value={s.ambience} testId="setting-ambience" onChange={(ambience) => updateSettings({ ambience })} />
        <Slider
          label="Mouse speed" value={s.sensitivity} testId="setting-sensitivity" min={0.4} max={2.5} step={0.1}
          show={(v) => `${v.toFixed(1)}×`} onChange={(sensitivity) => updateSettings({ sensitivity })}
        />
        <label className="setting check">
          <span>Invert mouse up/down</span>
          <input type="checkbox" checked={s.invertY} data-testid="setting-invert" onChange={(e) => updateSettings({ invertY: e.target.checked })} />
        </label>
        <button className="primary" data-testid="settings-done" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
