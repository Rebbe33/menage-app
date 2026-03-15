import { useState } from 'react'
import TachesDuJour from './components/TachesDuJour'
import Stats from './components/Stats'
import ImportXlsx from './components/ImportXlsx'
import './App.css'

export default function App() {
  const [page, setPage] = useState('today')

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏠 Ménage</h1>
        <nav className="app-nav">
          <button
            className={`nav-btn ${page === 'today' ? 'active' : ''}`}
            onClick={() => setPage('today')}
          >
            Aujourd'hui
          </button>
          <button
            className={`nav-btn ${page === 'stats' ? 'active' : ''}`}
            onClick={() => setPage('stats')}
          >
            Stats
          </button>
          <button
            className={`nav-btn ${page === 'import' ? 'active' : ''}`}
            onClick={() => setPage('import')}
          >
            Import
          </button>
        </nav>
      </header>

      <main className="app-main">
        {page === 'today' && <TachesDuJour />}
        {page === 'stats' && <Stats />}
        {page === 'import' && (
          <ImportXlsx onImportSuccess={() => setPage('today')} />
        )}
      </main>
    </div>
  )
}