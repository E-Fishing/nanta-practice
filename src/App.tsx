import type { MouseEvent } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import Library from './pages/Library.tsx';
import Player from './pages/Player.tsx';
import Drills from './pages/Drills.tsx';
import Editor from './pages/Editor.tsx';
import Progress from './pages/Progress.tsx';
import { confirmLeave } from './pages/unsavedChanges.ts';

/** Header links ask before leaving the editor with unsaved changes (SPEC §4.4). */
function guardLeave(event: MouseEvent<HTMLAnchorElement>) {
  if (!confirmLeave()) event.preventDefault();
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-header">
          <Link to="/" className="app-title" onClick={guardLeave}>
            Nanta Practice
          </Link>
          <Link to="/progress" onClick={guardLeave}>
            Progress
          </Link>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/play/:pieceId" element={<Player />} />
            <Route path="/drill/:pieceId" element={<Drills />} />
            <Route path="/edit" element={<Editor />} />
            <Route path="/edit/:pieceId" element={<Editor />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
