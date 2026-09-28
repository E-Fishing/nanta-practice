import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chart from '../components/Chart';
import ErrorCard from '../components/ErrorCard';
import MarkLegend from '../components/MarkLegend';
import PartSelector from '../components/PartSelector';
import Transport, { type TransportStatus } from '../components/Transport';
import type { Piece } from '../engine/types';
import { usePiece } from './usePiece';
import { usePlayer } from './usePlayer';
import './Player.css';

/** Player page (SPEC §4.2): the chart of one part with follow-along playback. */
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

function LoadedPlayer({ piece }: { piece: Piece }) {
  const [partId, setPartId] = useState(piece.parts[0].id);
  const part = piece.parts.find((p) => p.id === partId) ?? piece.parts[0];
  const instrument = piece.instruments.find((i) => i.id === part.instrument);
  const player = usePlayer(piece, part.id);
  const { pulse, state } = player.snapshot;

  const status: TransportStatus = {
    sectionName: pulse === null ? null : piece.sections[pulse.sectionIndex].name,
    rep: pulse?.rep ?? 1,
    repeatCount: pulse?.repeatCount ?? 1,
    bpm: player.snapshot.bpm,
  };

  return (
    <>
      <header className="player-header">
        <h1 className="player-title">{piece.title}</h1>
        <p className="player-meta">
          {piece.pulseBpm} pulses/min · {piece.sections.length} section{piece.sections.length === 1 ? '' : 's'}
          {instrument ? ` · ${part.name} on ${instrument.name}` : ''}
        </p>
      </header>
      <PartSelector parts={piece.parts} selectedId={part.id} onSelect={setPartId} />
      <MarkLegend />
      <Chart piece={piece} part={part} pulse={pulse} autoScroll={state === 'playing'} />
      <Transport
        state={state}
        audio={player.audio}
        metronome={player.snapshot.metronome}
        status={status}
        onToggle={player.toggle}
        onStop={player.stop}
        onMetronome={player.setMetronome}
        onEnableAudio={player.enableAudio}
      />
    </>
  );
}
