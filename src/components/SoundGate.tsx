import { useState } from 'react';
import type { AudioState } from '../engine/player';
import './SoundGate.css';

export interface SoundGateProps {
  /** Runs inside the tap handler so the browser counts it as a user gesture. */
  onEnable: () => Promise<AudioState>;
}

type GateStatus = 'idle' | 'busy' | 'failed';

/**
 * "Tap to enable sound" overlay (SPEC §6 audio gotchas). Browsers, iOS Safari above all, keep
 * audio silent until a tap; this one big target calls `Tone.start()` from the tap.
 */
export default function SoundGate({ onEnable }: SoundGateProps) {
  const [status, setStatus] = useState<GateStatus>('idle');

  const handleClick = async () => {
    setStatus('busy');
    const result = await onEnable();
    setStatus(result === 'ready' ? 'idle' : 'failed');
  };

  return (
    <div className="sound-gate" role="dialog" aria-label="Enable sound">
      <button type="button" className="sound-gate-button" onClick={handleClick} disabled={status === 'busy'}>
        <span className="sound-gate-icon" aria-hidden="true">
          🔊
        </span>
        {status === 'busy' ? 'Enabling sound…' : 'Tap to enable sound'}
      </button>
      <p className="sound-gate-hint">
        {status === 'failed'
          ? 'Sound is still blocked. On an iPhone, check the silent switch, then tap again.'
          : 'The browser needs one tap before it can play audio.'}
      </p>
    </div>
  );
}
