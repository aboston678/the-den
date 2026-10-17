// The engine running on the browser's audio thread (bike/rider.ts loads it): one per bike, so the
// note glides smoothly between the game's frames. The game sets `rpm`, `throttle` and `on` each frame
// and posts { shift: ±1 } on a gear change and { idle, rate } once with Andrew's idle recording.
import { EngineSynth } from "./engineSynth.ts";

// The audio thread's globals (not in the page's DOM types).
declare const sampleRate: number;
declare function registerProcessor(name: string, processor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: { processorOptions?: { seed?: number } });
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rpm", defaultValue: 2400, automationRate: "k-rate" },
      { name: "throttle", defaultValue: 0, automationRate: "k-rate" },
      { name: "on", defaultValue: 0, automationRate: "k-rate" },
    ];
  }

  private synth: EngineSynth;

  constructor(options?: { processorOptions?: { seed?: number } }) {
    super(options);
    this.synth = new EngineSynth(sampleRate, options?.processorOptions?.seed ?? 1);
    this.port.onmessage = (e: MessageEvent<{ shift?: number; idle?: Float32Array; rate?: number }>) => {
      if (e.data.shift) this.synth.shift(e.data.shift);
      if (e.data.idle && e.data.rate) this.synth.setIdle(e.data.idle, e.data.rate);
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    if (params.on![0]! < 0.5) out.fill(0);
    else this.synth.render(out, params.rpm![0]!, params.throttle![0]!);
    return true;
  }
}

registerProcessor("den-engine", EngineProcessor);
