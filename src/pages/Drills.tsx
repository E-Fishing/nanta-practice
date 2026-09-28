import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CellState } from '../components/cellState';
import Chart from '../components/Chart';
import CountIn from '../components/CountIn';
import DrillControls from '../components/DrillControls';
import DrillPad from '../components/DrillPad';
import DrillSetup from '../components/DrillSetup';
import DrillStats from '../components/DrillStats';
import ErrorCard from '../components/ErrorCard';
import PartSelector from '../components/PartSelector';
import SoundGate from '../components/SoundGate';
import type { Piece } from '../engine/types';
import { useDrillRun, type DrillMode } from './useDrillRun';
import { useElementHeight } from './useElementHeight';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePiece } from './usePiece';
import { usePlayer } from './usePlayer';
import { useTapKeys } from './useTapKeys';
import './Drills.css';

/** Drills page (SPEC §4.3): pick a part, a section and a mode; the player engine runs underneath. */
export default function Drills() {
  const { pieceId } = useParams();
  const state = usePiece(pieceId);

  return (
    <section className="drills">
      <nav className="drills-nav">
        <Link to="/">← Library</Link>
        {pieceId ? <Link to={`/play/${pieceId}`}>Player</Link> : null}
      </nav>
      {state.status === 'loading' ? <p className="drills-status">Loading {pieceId}...</p> : null}
      {state.status === 'error' ? <ErrorCard pieceId={pieceId ?? '?'} message={state.message} path={state.path} /> : null}
      {state.status === 'loaded' ? <LoadedDrills key={state.piece.id} piece={state.piece} /> : null}
    </section>
  );
}

function LoadedDrills({ piece }: { piece: Piece }) {
  const [partId, setPartId] = useState(piece.parts[0].id);
  const [target, setTarget] = useState(piece.sections[0]?.id ?? 'piece');
  const [mode, setMode] = useState<DrillMode>('fade');
  const [fadeTapping, setFadeTapping] = useState(false);
  const part = piece.parts.find((p) => p.id === partId) ?? piece.parts[0];
  const tapping = mode === 'tap' || fadeTapping;

  const player = usePlayer(piece, part.id);
  const { snapshot, setLoop } = player;
  const { state, pulse, cued, countIn } = snapshot;

  // The drill always loops what it drills. (`setLoop` is stable; `player` itself is not.)
  useEffect(() => {
    setLoop(target === 'piece' ? { kind: 'piece' } : { kind: 'section', sectionId: target });
  }, [setLoop, target]);

  const run = useDrillRun(player, piece, part.id, { mode, tapping });
  const padRef = useRef<HTMLDivElement>(null);
  const bottomInset = useElementHeight(padRef);

  useKeyboardShortcuts({ playPause: player.toggle, jumpLine: () => {}, stepTempo: player.stepBpm });
  useTapKeys(run.tap, tapping);

  const cellStates = useMemo(() => {
    const states = new Map<string, CellState>();
    for (const key of run.hidden) states.set(key, { hidden: true });
    if (tapping) {
      for (const [key, heat] of run.heat) states.set(key, { ...states.get(key), heat });
    }
    return states;
  }, [run.hidden, run.heat, tapping]);

  const sectionIds = useMemo(() => (target === 'piece' ? undefined : [target]), [target]);
  const countInSectionName = countIn === null ? '' : (piece.sections.find((s) => s.id === countIn.sectionId)?.name ?? '');
  const locked = player.audio === 'locked';
  const overlay = locked ? <SoundGate onEnable={player.enableAudio} /> : countIn !== null ? <CountIn countIn={countIn} sectionName={countInSectionName} /> : null;

  return (
    <>
      <header className="drills-header">
        <h1 className="drills-title">{piece.title}</h1>
        <p className="drills-meta">Drills · {part.name}</p>
      </header>
      <PartSelector parts={piece.parts} selectedId={part.id} onSelect={setPartId} />
      <DrillSetup
        piece={piece}
        target={target}
        mode={mode}
        tapping={fadeTapping}
        disabled={state !== 'stopped'}
        onTarget={setTarget}
        onMode={setMode}
        onTapping={setFadeTapping}
      />
      <DrillStats
        mode={mode}
        tapping={tapping}
        started={run.started}
        summary={run.score.summary}
        loops={run.loops}
        hiddenFraction={run.hiddenFraction}
        blankLoops={run.blankLoops}
      />
      <Chart
        piece={piece}
        part={part}
        sectionIds={sectionIds}
        pulse={pulse}
        cued={cued}
        autoScroll={state === 'playing'}
        cellStates={cellStates}
        bottomInset={bottomInset}
      />
      <DrillPad
        ref={padRef}
        tapping={tapping}
        enabled={state === 'playing' && countIn === null}
        onTap={run.tap}
        lastTap={run.lastTap}
        overlay={overlay}
        controls={
          <DrillControls
            state={state}
            metronome={snapshot.metronome}
            bpm={snapshot.bpm}
            range={snapshot.bpmRange}
            pulseBpm={piece.pulseBpm}
            fade={mode === 'fade'}
            onToggle={player.toggle}
            onStop={player.stop}
            onMetronome={player.setMetronome}
            onStep={player.stepBpm}
            onShowMe={run.showMe}
          />
        }
      />
    </>
  );
}
