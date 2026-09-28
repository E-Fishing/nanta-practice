import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import Library from './pages/Library.tsx'
import Player from './pages/Player.tsx'
import Drills from './pages/Drills.tsx'
import Editor from './pages/Editor.tsx'
import Progress from './pages/Progress.tsx'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-header">
          <Link to="/" className="app-title">
            Nanta Practice
          </Link>
          <Link to="/progress">Progress</Link>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/play/:pieceId" element={<Player />} />
            <Route path="/drill/:pieceId" element={<Drills />} />
            <Route path="/edit/:pieceId" element={<Editor />} />
            <Route path="/progress" element={<Progress />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
