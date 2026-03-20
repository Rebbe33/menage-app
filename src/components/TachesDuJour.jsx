import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { reporterTachesNonFaites } from '../utils/planificateur'

export default function TachesDuJour() {
  const [tachesParPiece, setTachesParPiece] = useState({})
  const [piecesOuvertes, setPiecesOuvertes] = useState({})
  const [loading, setLoading] = useState(true)
  const [minutesRestantes, setMinutesRestantes] = useState(0)
  const [minutesTotal, setMinutesTotal] = useState(0)
  const [totalFaites, setTotalFaites] = useState(0)
  const [totalTaches, setTotalTaches] = useState(0)
  const piecesOuvertesRef = useRef({})
  const aujourd_hui = new Date().toISOString().split('T')[0]

  useEffect(() => {
    reporterTachesNonFaites().then(() => chargerTaches(true))
  }, [])

  const chargerTaches = async (init = false) => {
    if (init) setLoading(true)

    const { data } = await supabase
      .from('menage_planning')
      .select('*, menage_taches(piece, zone, tache, duree_minutes)')
      .eq('date_prevue', aujourd_hui)
      .order('created_at')

    const taches = data || []

    const groupes = {}
    for (const t of taches) {
      const piece = t.menage_taches?.piece || 'Autre'
      if (!groupes[piece]) groupes[piece] = []
      groupes[piece].push(t)
    }

    for (const piece in groupes) {
      groupes[piece].sort((a, b) => {
        if (!!a.date_faite === !!b.date_faite) return 0
        return a.date_faite ? 1 : -1
      })
    }

    const piecesTriees = Object.keys(groupes).sort((a, b) => {
      const aRestantes = groupes[a].filter(t => !t.date_faite).length
      const bRestantes = groupes[b].filter(t => !t.date_faite).length
      return bRestantes - aRestantes
    })

    const groupesOrdonnes = {}
    for (const p of piecesTriees) groupesOrdonnes[p] = groupes[p]

    setTachesParPiece(groupesOrdonnes)

    if (init) {
      const ouvertes = {}
      for (const p of piecesTriees) ouvertes[p] = false
      setPiecesOuvertes(ouvertes)
      piecesOuvertesRef.current = ouvertes
    } else {
      setPiecesOuvertes({ ...piecesOuvertesRef.current })
    }

    const total = taches.length
    const faites = taches.filter(t => t.date_faite).length
    const totalMin = taches.reduce((sum, t) => sum + (t.menage_taches?.duree_minutes || 0), 0)
    const restantesMin = taches
      .filter(t => !t.date_faite)
      .reduce((sum, t) => sum + (t.menage_taches?.duree_minutes || 0), 0)

    setTotalTaches(total)
    setTotalFaites(faites)
    setMinutesTotal(totalMin)
    setMinutesRestantes(restantesMin)
    if (init) setLoading(false)
  }

  const togglePiece = (piece) => {
    const nouvelEtat = { ...piecesOuvertesRef.current, [piece]: !piecesOuvertesRef.current[piece] }
    piecesOuvertesRef.current = nouvelEtat
    setPiecesOuvertes(nouvelEtat)
  }

  const marquerFaite = async (id) => {
    await supabase
      .from('menage_planning')
      .update({ date_faite: new Date().toISOString() })
      .eq('id', id)
    chargerTaches(false)
  }

  const marquerNonFaite = async (id) => {
    await supabase
      .from('menage_planning')
      .update({ date_faite: null })
      .eq('id', id)
    chargerTaches(false)
  }

  const progression = totalTaches > 0 ? Math.round((totalFaites / totalTaches) * 100) : 0

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div className="taches-container">
      <div className="jour-header">
        <h2>Aujourd'hui</h2>
        <span className="date-label">
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="stats-bar">
        <div className="stat-pill">
          <span className="stat-number">{totalTaches - totalFaites}</span>
          <span className="stat-label">restantes</span>
        </div>
        <div className="stat-pill highlight">
          <span className="stat-number">{minutesRestantes}</span>
          <span className="stat-label">min restantes</span>
        </div>
        <div className="stat-pill">
          <span className="stat-number">{totalFaites}</span>
          <span className="stat-label">faites</span>
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progression}%` }} />
        <span className="progress-label">{progression}%</span>
      </div>

      {totalTaches === 0 ? (
        <div className="empty-state">
          <p>🎉 Rien à faire aujourd'hui !</p>
          <p>Profites-en pour te reposer.</p>
        </div>
      ) : progression === 100 ? (
        <div className="empty-state">
          <p>🎉 Tout est fait !</p>
          <p>{minutesTotal} min de ménage aujourd'hui, bravo !</p>
        </div>
      ) : (
        <div className="pieces-accordion">
          {Object.entries(tachesParPiece).map(([piece, taches]) => {
            const restantes = taches.filter(t => !t.date_faite).length
            const minutesPiece = taches
              .filter(t => !t.date_faite)
              .reduce((s, t) => s + (t.menage_taches?.duree_minutes || 0), 0)
            const ouvert = piecesOuvertes[piece]

            return (
              <div key={piece} className={`piece-section ${ouvert ? 'open' : ''}`}>
                <button className="piece-header" onClick={() => togglePiece(piece)}>
                  <div className="piece-header-left">
                    <span className="piece-chevron">{ouvert ? '▾' : '▸'}</span>
                    <span className="piece-header-nom">{piece}</span>
                    {restantes > 0
                      ? <span className="piece-badge">{restantes}</span>
                      : <span className="piece-badge done">✓</span>
                    }
                  </div>
                  <span className="piece-header-meta">
                    {restantes > 0 ? `${minutesPiece} min` : '✓'}
                  </span>
                </button>

                {ouvert && (
                  <div className="piece-taches">
                    {taches.map(t => (
                      <div key={t.id} className={`tache-card ${t.date_faite ? 'faite' : ''} ${t.reporte ? 'reporte' : ''}`}>
                        <div className="tache-info">
                          <span className="tache-zone">{t.menage_taches?.zone}</span>
                          <span className="tache-nom">{t.menage_taches?.tache}</span>
                          {t.reporte && <span className="badge-reporte">Reportée</span>}
                        </div>
                        <div className="tache-actions">
                          <span className="duree">{t.menage_taches?.duree_minutes} min</span>
                          {t.date_faite
                            ? <button className="btn-uncheck" onClick={() => marquerNonFaite(t.id)}>↩</button>
                            : <button className="btn-check" onClick={() => marquerFaite(t.id)}>✓</button>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
