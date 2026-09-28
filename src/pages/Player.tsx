import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chart from '../components/Chart';
import ErrorCard from '../components/ErrorCard';
import MarkLegend from '../components/MarkLegend';
import PartSelector from '../components/PartSelector';
import type { Piece } from '../engine/types';
import { usePiece } from './usePiece';
import './Player.css';

/** Player page (SPEC §4.2). Milestone 2: the static chart of one part. Playback comes in M3. */
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
      <Chart piece={piece} part={part} />
    </>
  );
}
