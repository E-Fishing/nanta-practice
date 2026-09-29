import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { slotKey, type CellState } from '../components/cellState';
import Chart from '../components/Chart';
import CountIn from '../components/CountIn';
import DrillControls from '../components/DrillControls';
import { drillModeInfo } from '../components/drillModes';
import DrillPad from '../components/DrillPad';
import DrillSetup from '../components/DrillSetup';
import DrillStats from '../components/DrillStats';
import ErrorCard from '../components/ErrorCard';
import PageNav, { type PageNavItem } from '../components/PageNav';
import { PAGE_NAMES } from '../components/pageNames';
import PartSelector from '../components/PartSelector';
import Plaque from '../components/Plaque';
import SoundGate from '../components/SoundGate';
import { chartKeysInRange, cueCellKeys, leadPartId, type DrillMode } from '../engine/drills';
import type { Piece } from '../engine/types';
import { getCurrentMember, PIECE_WIDE_SECTION, recordAttempt, todayIso } from '../storage/progress';
import { useDrillRun } from './useDrillRun';
import { useElementHeight } from './useElementHeight';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePiece } from './usePiece';
import { usePlayer } from './usePlayer';
import { useTapKeys } from './useTapKeys';
import './Drills.css';

/**
 * Drills page (SPEC §4.3; DESIGN.md §5.4, ornament at the ends only): pick a part, a section and a
 * mode; the player engine runs underneath. The chart and the tap pad stay plain paper.
 */
export default function Drills() {
  const { pieceId } = useParams();
  const state = usePiece(pieceId);
  const nav: PageNavItem[] = [
    { to: '/', back: true, ...PAGE_NAMES.library },
    ...(pieceId ? [{ to: `/play/${pieceId}`, ...PAGE_NAMES.player }] : []),
    { to: '/progress', ...PAGE_NAMES.progress },
  ];

  return (
    <section className="drills page">
      <PageNav items={nav} />
      {state.status !== 'loaded' ? <Plaque {...PAGE_NAMES.drills} /> : null}
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
  const [extraTapping, setExtraTapping] = useState(false);
  const [member] = useState(getCurrentMember);
  const part = piece.parts.find((p) => p.id === partId) ?? piece.parts[0];
  const info = drillModeInfo(mode);
  const tapping = info.taps || (info.optionalTaps && extraTapping);

  const player = usePlayer(piece, part.id);
  const { snapshot, timeline, setLoop, setSoundFilter, setStopAtLoopEnd, setBpm } = player;
  const { state, pulse, cued, countIn } = snapshot;

  // The drill always loops what it drills. (`setLoop` and friends are stable; `player` is not.)
  useEffect(() => {
    setLoop(target === 'piece' ? { kind: 'piece' } : { kind: 'section', sectionId: target });
  }, [setLoop, target]);

  // Blind run: one pass. Cue drill: only the lead's cue figures sound.
  useEffect(() => {
    setStopAtLoopEnd(mode === 'blind');
    if (mode !== 'cue') {
      setSoundFilter(null);
      return undefined;
    }
    const lead = leadPartId(piece, part.id);
    const cues = cueCellKeys(piece, lead);
    setSoundFilter((cuePulse, cuePartId) => {
      if (cuePartId !== lead) return false;
      const key = slotKey(cuePulse.sectionIndex, cuePulse.parts[cuePartId]);
      return key !== null && cues.has(key);
    });
    return () => setSoundFilter(null);
  }, [mode, piece, part.id, setSoundFilter, setStopAtLoopEnd]);

  const run = useDrillRun(player, piece, part.id, { mode, tapping });
  const padRef = useRef<HTMLDivElement>(null);
  const bottomInset = useElementHeight(padRef);

  // The blind run is always at performance tempo.
  const toggle = useCallback(() => {
    if (mode === 'blind' && snapshot.state === 'stopped') setBpm(piece.pulseBpm);
    player.toggle();
  }, [mode, snapshot.state, setBpm, piece.pulseBpm, player]);

  const answering = mode === 'gap' && state === 'playing';
  useKeyboardShortcuts({ playPause: answering ? () => {} : toggle, jumpLine: () => {}, stepTempo: player.stepBpm });
  // Fill the gap: F, J and space answer the next blank instead of tapping the beat.
  useTapKeys(
    mode === 'gap' ? { onTap: (hand) => run.answer(hand), onRest: () => run.answer('rest') } : { onTap: run.tap },
    tapping || mode === 'gap',
  );

  // Save every finished run for the current member (SPEC §4.5).
  const savedCount = useRef(0);
  useEffect(() => {
    if (run.finishedCount === savedCount.current) return;
    savedCount.current = run.finishedCount;
    if (run.loops === 0 && run.score.summary.due === 0 && run.gapResults.length === 0) return;
    const scoredTaps = tapping && run.score.summary.due + run.score.summary.extra > 0;
    const accuracy =
      mode === 'gap'
        ? run.gapResults.length === 0
          ? null
          : run.gapResults.filter((result) => result.correct).length / run.gapResults.length
        : scoredTaps
          ? run.score.summary.accuracy
          : null;
    recordAttempt(member, piece.id, target === 'piece' ? PIECE_WIDE_SECTION : target, {
      date: todayIso(),
      accuracy,
      bpm: snapshot.bpm,
      mode,
    });
  }, [run.finishedCount, run.loops, run.score.summary, run.gapResults, tapping, mode, member, piece.id, target, snapshot.bpm]);

  const rangeKeys = useMemo(() => chartKeysInRange(timeline, part.id, snapshot.loopRange), [timeline, part.id, snapshot.loopRange]);

  const cellStates = useMemo(() => {
    const states = new Map<string, CellState>();
    const put = (key: string, patch: CellState) => states.set(key, { ...states.get(key), ...patch });
    for (const key of run.hidden) put(key, { hidden: true });
    if (mode === 'gueum') for (const key of rangeKeys) put(key, { hideHand: true, hideGueum: run.stage === 2 });
    for (const key of run.gapWrong) put(key, { wrong: true });
    if (tapping && (mode !== 'blind' || run.finished)) for (const [key, heat] of run.heat) put(key, { heat });
    return states;
  }, [run.hidden, run.heat, run.gapWrong, run.stage, run.finished, mode, tapping, rangeKeys]);

  const sectionIds = useMemo(() => (target === 'piece' ? undefined : [target]), [target]);
  const countInSectionName = countIn === null ? '' : (piece.sections.find((s) => s.id === countIn.sectionId)?.name ?? '');
  const locked = player.audio === 'locked';
  const overlay = locked ? <SoundGate onEnable={player.enableAudio} /> : countIn !== null ? <CountIn countIn={countIn} sectionName={countInSectionName} /> : null;
  const input = mode === 'gap' ? 'answers' : tapping ? 'taps' : 'none';

  return (
    <>
      <header className="drills-header">
        <Plaque {...PAGE_NAMES.drills} />
        <div className="drills-heading">
          <h1 className="drills-title">{piece.title}</h1>
          <p className="drills-meta">
            Drills · {part.name}
            {member === '' ? ' · progress is not saved: type your name on the Library page' : ` · saving progress for ${member}`}
          </p>
        </div>
      </header>
      <PartSelector parts={piece.parts} selectedId={part.id} onSelect={setPartId} />
      <DrillSetup
        piece={piece}
        target={target}
        mode={mode}
        tapping={extraTapping}
        disabled={state !== 'stopped'}
        onTarget={setTarget}
        onMode={setMode}
        onTapping={setExtraTapping}
      />
      <DrillStats
        piece={piece}
        partId={part.id}
        mode={mode}
        tapping={tapping}
        started={run.started}
        finished={run.finished}
        summary={run.score.summary}
        loops={run.loops}
        hiddenFraction={run.hiddenFraction}
        blankLoops={run.blankLoops}
        stage={run.stage}
        stageLoops={run.stageLoops}
        gapResults={run.gapResults}
        transitions={run.transitions}
        worst={run.worst}
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
        input={input}
        enabled={state === 'playing' && countIn === null}
        onTap={run.tap}
        onAnswer={run.answer}
        lastTap={run.lastTap}
        lastAnswer={run.lastAnswer}
        overlay={overlay}
        controls={
          <DrillControls
            state={state}
            mode={mode}
            metronome={snapshot.metronome}
            bpm={snapshot.bpm}
            range={snapshot.bpmRange}
            pulseBpm={piece.pulseBpm}
            stage={run.stage}
            onToggle={toggle}
            onStop={player.stop}
            onMetronome={player.setMetronome}
            onStep={player.stepBpm}
            onShowMe={run.showMe}
            onStage={run.setStage}
          />
        }
      />
    </>
  );
}
