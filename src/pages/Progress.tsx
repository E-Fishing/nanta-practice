import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AccuracyChart from '../components/AccuracyChart';
import { drillModeInfo } from '../components/drillModes';
import type { DrillMode } from '../engine/drills';
import type { Piece } from '../engine/types';
import {
  exportProgress,
  getCurrentMember,
  importProgress,
  listMembers,
  normalizeSection,
  PIECE_WIDE_SECTION,
  readProgress,
  type ProgressStore,
  type SectionProgress,
} from '../storage/progress';
import { usePieceLibrary } from './usePieceLibrary';
import './Progress.css';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Progress page (SPEC §4.5): per member, per piece, per section figures, a chart each, export/import. */
export default function Progress() {
  const [store, setStore] = useState<ProgressStore>(readProgress);
  const members = useMemo(() => listMembers(store), [store]);
  const current = getCurrentMember();
  const [member, setMember] = useState(() => (current !== '' ? current : ''));
  const shown = member !== '' ? member : (members[0] ?? '');
  const [notice, setNotice] = useState<Notice>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const library = usePieceLibrary();
  const pieces = useMemo(() => {
    const byId = new Map<string, Piece>();
    for (const entry of library.entries) if (entry.status === 'loaded') byId.set(entry.piece.id, entry.piece);
    return byId;
  }, [library.entries]);

  const download = useCallback(() => {
    const blob = new Blob([exportProgress(store)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nanta-progress-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice({ kind: 'ok', text: 'Progress downloaded as JSON.' });
  }, [store]);

  const importFile = useCallback(async (file: File | undefined) => {
    if (file === undefined) return;
    try {
      const merged = importProgress(await file.text());
      setStore(merged);
      setNotice({ kind: 'ok', text: `Imported ${file.name}: ${listMembers(merged).length} member${listMembers(merged).length === 1 ? '' : 's'} after merging.` });
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
    if (fileRef.current !== null) fileRef.current.value = '';
  }, []);

  const memberProgress = shown === '' ? undefined : store.members[shown];

  return (
    <section className="progress">
      <nav className="progress-nav">
        <Link to="/">← Library</Link>
      </nav>
      <header className="progress-header">
        <h1 className="progress-title">Progress</h1>
        <div className="progress-tools">
          <label className="progress-member">
            <span className="progress-member-label">Member</span>
            <select className="progress-select" value={shown} onChange={(e) => setMember(e.target.value)} disabled={members.length === 0}>
              {members.length === 0 ? <option value="">nobody yet</option> : null}
              {members.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="progress-button" onClick={download} disabled={members.length === 0}>
            Export JSON
          </button>
          <button type="button" className="progress-button" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input ref={fileRef} className="progress-file" type="file" accept="application/json,.json" onChange={(e) => void importFile(e.target.files?.[0])} aria-label="Import progress file" />
        </div>
        {notice !== null ? (
          <p className={notice.kind === 'error' ? 'progress-notice progress-notice--error' : 'progress-notice'} role="status">
            {notice.text}
          </p>
        ) : null}
      </header>
      {members.length === 0 ? (
        <p className="progress-empty">No progress yet. Type a name on the Library page, run a drill, and come back.</p>
      ) : memberProgress === undefined ? (
        <p className="progress-empty">No progress for {shown}.</p>
      ) : (
        Object.entries(memberProgress).map(([pieceId, sections]) => (
          <PieceProgressCard key={pieceId} pieceId={pieceId} piece={pieces.get(pieceId)} sections={sections} />
        ))
      )}
    </section>
  );
}

function sectionName(piece: Piece | undefined, sectionId: string): string {
  if (sectionId === PIECE_WIDE_SECTION) return 'Whole piece';
  return piece?.sections.find((section) => section.id === sectionId)?.name ?? sectionId;
}

function PieceProgressCard({ pieceId, piece, sections }: { pieceId: string; piece: Piece | undefined; sections: Record<string, SectionProgress> }) {
  // Chart order for known sections, the whole-piece row last, unknown ids after.
  const order = (id: string) => (id === PIECE_WIDE_SECTION ? 1e6 : (piece?.sections.findIndex((section) => section.id === id) ?? -1));
  const rows = Object.entries(sections)
    .map(([id, raw]) => ({ id, section: normalizeSection(raw) }))
    .sort((a, b) => order(a.id) - order(b.id));
  return (
    <article className="progress-piece">
      <h2 className="progress-piece-title">
        {piece?.title ?? pieceId}
        {piece ? (
          <span className="progress-piece-links">
            <Link to={`/play/${pieceId}`}>Practice</Link>
            <Link to={`/drill/${pieceId}`}>Drills</Link>
          </span>
        ) : null}
      </h2>
      <table className="progress-table">
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Best BPM (tap-along ≥ 85%)</th>
            <th scope="col">Last accuracy</th>
            <th scope="col">Attempts</th>
            <th scope="col">Last practiced</th>
            <th scope="col">Accuracy over time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, section }) => {
            const lastMode = section.history?.[section.history.length - 1]?.mode;
            return (
              <tr key={id}>
                <th scope="row">{sectionName(piece, id)}</th>
                <td>{section.bestBpm > 0 ? section.bestBpm : '–'}</td>
                <td>
                  {section.history?.some((entry) => entry.accuracy !== null) || section.lastAccuracy > 0 ? percent(section.lastAccuracy) : '–'}
                  {lastMode ? <span className="progress-mode"> {drillModeInfo(lastMode as DrillMode).name}</span> : null}
                </td>
                <td>{section.attempts}</td>
                <td>{section.lastPracticed || '–'}</td>
                <td>
                  <AccuracyChart history={section.history ?? []} title={`${sectionName(piece, id)} accuracy over time`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
