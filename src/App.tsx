import type { MouseEvent } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import BeamBand from './components/BeamBand.tsx';
import BiLabel from './components/BiLabel.tsx';
import BrandMark from './components/BrandMark.tsx';
import { PAGE_NAMES } from './components/pageNames.ts';
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
        {/* The header beam (DESIGN.md §5.1): jade ground, mirrored hwi band along its lower edge. */}
        <header className="app-header">
          <div className="app-header-inner">
            <Link to="/" className="app-brand" onClick={guardLeave}>
              <BrandMark className="app-brand-mark" />
              <BiLabel {...PAGE_NAMES.brand} />
            </Link>
            <Link to="/progress" className="app-nav-link" onClick={guardLeave}>
              <BiLabel {...PAGE_NAMES.progress} />
            </Link>
          </div>
          <BeamBand size="m" />
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
