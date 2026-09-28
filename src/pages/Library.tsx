import { useState, type ReactNode } from 'react';
import ErrorCard from '../components/ErrorCard';
import MemberField from '../components/MemberField';
import PieceCard from '../components/PieceCard';
import { getCurrentMember, getLastPracticed, setCurrentMember } from '../storage/progress';
import { usePieceLibrary, type PieceEntryState } from './usePieceLibrary';
import './Library.css';

/** Library page (SPEC §4.1): member name field, then one card per piece in index.json. */
export default function Library() {
  const [member, setMember] = useState(getCurrentMember);
  const { loading, indexError, entries } = usePieceLibrary();
  const empty = !loading && indexError === null && entries.length === 0;

  function handleMemberChange(name: string) {
    setCurrentMember(name);
    setMember(name);
  }

  return (
    <section className="library">
      <h1 className="library-title">Library</h1>
      <MemberField value={member} onChange={handleMemberChange} />
      {indexError !== null ? (
        <p className="library-status library-status--error" role="alert">
          {indexError}
        </p>
      ) : null}
      {loading ? <p className="library-status">Loading pieces...</p> : null}
      {empty ? <p className="library-status">No pieces in public/pieces/index.json</p> : null}
      {entries.length > 0 ? (
        <ul className="library-grid">
          {entries.map((entry, i) => (
            <li key={`${i}:${entry.id}`} className="library-item">
              <LibraryEntry entry={entry} member={member} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function LibraryEntry({ entry, member }: { entry: PieceEntryState; member: string }): ReactNode {
  switch (entry.status) {
    case 'loading':
      return <p className="library-status">Loading {entry.id}...</p>;
    case 'error':
      return <ErrorCard pieceId={entry.id} message={entry.message} path={entry.path} />;
    case 'loaded':
      return (
        <PieceCard
          piece={entry.piece}
          timeline={entry.timeline}
          lastPracticed={getLastPracticed(member, entry.piece.id)}
        />
      );
  }
}
