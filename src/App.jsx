import { useState, useEffect } from 'react'
import TachesDuJour from './components/TachesDuJour'
import Stats from './components/Stats'
import ImportXlsx from './components/ImportXlsx'
import Taches from './pages/Taches'
import { supabase } from './lib/supabase'
import './App.css'

export default function App() {
  const [page, setPage] = useState('today')
  const [enPause, setEnPause] = useState(false)
  const [loadingPause, setLoadingPause] = useState(true)

  useEffect(() => {
    chargerEtatPause()
  }, [])

  const chargerEtatPause = async () => {
    const { data } = await supabase
      .from('menage_config')
      .select('valeur')
      .eq('cle', 'app_en_pause')
      .single()
    setEnPause(data?.valeur === 'true')
    setLoadingPause(false)
  }

  const togglePause = async () => {
    const nouvelEtat = !enPause
    await supabase
      .from('menage_config')
      .upsert({ cle: 'app_en_pause', valeur: String(nouvelEtat) }, { onConflict: 'cle' })
    setEnPause(nouvelEtat)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <h1>🏠 Ménage</h1>
          {!loadingPause && (
            <button
              className={`btn-pause ${enPause ? 'active' : ''}`}
              onClick={togglePause}
              title={enPause ? 'Reprendre l\'app' : 'Mettre en pause'}
            >
              {enPause ? '▶ Reprendre' : '⏸ Pause'}
            </button>
          )}
        </div>
        <nav className="app-nav">
          <button className={`nav-btn ${page === 'today' ? 'active' : ''}`} onClick={() => setPage('today')}>
            Aujourd'hui
          </button>
          <button className={`nav-btn ${page === 'taches' ? 'active' : ''}`} onClick={() => setPage('taches')}>
            Tâches
          </button>
          <button className={`nav-btn ${page === 'stats' ? 'active' : ''}`} onClick={() => setPage('stats')}>
            Stats
          </button>
          <button className={`nav-btn ${page === 'import' ? 'active' : ''}`} onClick={() => setPage('import')}>
            Import
          </button>
        </nav>
      </header>

      {enPause && (
        <div className="bandeau-pause">
          <span>⏸</span>
          <div>
            <strong>Application en pause</strong>
            <p>Les tâches non faites ne seront pas reportées pendant ton absence.</p>
          </div>
        </div>
      )}

      <main className="app-main">
        {page === 'today'  && <TachesDuJour enPause={enPause} />}
        {page === 'taches' && <Taches />}
        {page === 'stats'  && <Stats />}
        {page === 'import' && <ImportXlsx onImportSuccess={() => setPage('today')} />}
      </main>
    </div>
  )
}
