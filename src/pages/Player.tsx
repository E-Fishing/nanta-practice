import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chart from '../components/Chart';
import ErrorCard from '../components/ErrorCard';
import LoopControl from '../components/LoopControl';
import MarkLegend from '../components/MarkLegend';
import PartMixer from '../components/PartMixer';
import PartSelector from '../components/PartSelector';
import TempoControl from '../components/TempoControl';
import Transport, { type TransportStatus } from '../components/Transport';
import { linesInRange, type LineRef, type PulseRange } from '../engine/controls';
import type { Piece, Timeline } from '../engine/types';
import { useElementHeight } from './useElementHeight';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePiece } from './usePiece';
import { usePlayer } from './usePlayer';
import './Player.css';

/** Player page (SPEC §4.2): the chart of one part with follow-along playback and its controls. */
export default function Player() {
  const { pieceId } = useParams();
  const state = usePiece(pieceId);

  return (
    <section className="player">
      <nav className="player-nav">
        <Link to="/">← Library</Link>
      </nav>
      {state.status === 'loading' ? <p className="player-status">Loading {pieceId}...</p> : null}
      {state.status === 'error' ? <ErrorCard pieceId={pieceId ?? '?'} message={state.message} path={state.path} /> : null}
      {state.status === 'loaded' ? <LoadedPlayer key={state.piece.id} piece={state.piece} /> : null}
    </section>
  );
}

const NO_LINES: readonly LineRef[] = [];
const NO_SECTIONS: readonly number[] = [];

/** Sections a pulse range touches, as indices into `piece.sections`. */
function sectionsInRange(timeline: Timeline, range: PulseRange): number[] {
  return timeline.sections.filter((span) => span.start < range.end && span.end > range.start).map((span) => span.sectionIndex);
}

function LoadedPlayer({ piece }: { piece: Piece }) {
  const [partId, setPartId] = useState(piece.parts[0].id);
  const part = piece.parts.find((p) => p.id === partId) ?? piece.parts[0];
  const instrument = piece.instruments.find((i) => i.id === part.instrument);
  const player = usePlayer(piece, part.id);
  const { snapshot, timeline } = player;
  const { pulse, state, cued, countIn, loop, loopRange, loopCount } = snapshot;

  const barRef = useRef<HTMLDivElement>(null);
  const bottomInset = useElementHeight(barRef);

  // A line loop belongs to the part it was set on; switching parts keeps its section, drops its lines.
  const selectPart = useCallback(
    (id: string) => {
      setPartId(id);
      if (loop.kind === 'lines' && loop.partId !== id) player.setLoop({ kind: 'section', sectionId: loop.sectionId });
    },
    [loop, player],
  );

  const loopedLines = useMemo(() => (loopRange === null ? NO_LINES : linesInRange(timeline, part.id, loopRange)), [timeline, part.id, loopRange]);
  const loopedSections = useMemo(() => (loopRange === null ? NO_SECTIONS : sectionsInRange(timeline, loopRange)), [timeline, loopRange]);

  useKeyboardShortcuts({ playPause: player.toggle, jumpLine: player.jumpLine, stepTempo: player.stepBpm });

  const status: TransportStatus = {
    sectionName: pulse === null ? null : piece.sections[pulse.sectionIndex].name,
    rep: pulse?.rep ?? 1,
    repeatCount: pulse?.repeatCount ?? 1,
    looping: loopRange !== null,
    loopCount,
  };
  const countInView =
    countIn === null ? null : { status: countIn, sectionName: piece.sections.find((s) => s.id === countIn.sectionId)?.name ?? '' };

  return (
    <>
      <header className="player-header">
        <h1 className="player-title">{piece.title}</h1>
        <p className="player-meta">
          {piece.pulseBpm} pulses/min · {piece.sections.length} section{piece.sections.length === 1 ? '' : 's'}
          {instrument ? ` · ${part.name} on ${instrument.name}` : ''}
        </p>
      </header>
      <PartSelector parts={piece.parts} selectedId={part.id} onSelect={selectPart} />
      <MarkLegend />
      <div className="player-controls">
        <LoopControl piece={piece} part={part} loop={loop} onChange={player.setLoop} />
        <PartMixer parts={piece.parts} muted={snapshot.muted} solo={snapshot.solo} onMute={player.setMuted} onSolo={player.setSolo} />
      </div>
      <Chart
        piece={piece}
        part={part}
        pulse={pulse}
        cued={cued}
        autoScroll={state === 'playing' || cued}
        loopedLines={loopedLines}
        loopedSections={loopedSections}
        bottomInset={bottomInset}
      />
      <Transport
        ref={barRef}
        state={state}
        audio={player.audio}
        metronome={snapshot.metronome}
        status={status}
        countIn={countInView}
        onToggle={player.toggle}
        onStop={player.stop}
        onMetronome={player.setMetronome}
        onEnableAudio={player.enableAudio}
      >
        <TempoControl
          bpm={snapshot.bpm}
          range={snapshot.bpmRange}
          pulseBpm={piece.pulseBpm}
          stepPerLoop={snapshot.stepPerLoop}
          onBpm={player.setBpm}
          onStep={player.stepBpm}
          onStepPerLoop={player.setStepPerLoop}
        />
      </Transport>
    </>
  );
}
