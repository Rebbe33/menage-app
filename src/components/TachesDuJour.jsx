import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { reporterTachesNonFaites } from '../utils/planificateur'

export default function TachesDuJour() {
  const [taches, setTaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalMinutes, setTotalMinutes] = useState(0)
  const aujourd_hui = new Date().toISOString().split('T')[0]

  useEffect(() => {
    reporterTachesNonFaites().then(() => chargerTaches())
  }, [])

  const chargerTaches = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('menage_planning')
      .select('*, menage_taches(piece, zone, tache, duree_minutes)')
      .eq('date_prevue', aujourd_hui)
      .order('created_at')

    setTaches(data || [])
    const total = (data || []).reduce((sum, t) => sum + (t.menage_taches?.duree_minutes || 0), 0)
    setTotalMinutes(total)
    setLoading(false)
  }

  const marquerFaite = async (id) => {
    await supabase
      .from('menage_planning')
      .update({ date_faite: new Date().toISOString() })
      .eq('id', id)
    chargerTaches()
  }

  const marquerNonFaite = async (id) => {
    await supabase
      .from('menage_planning')
      .update({ date_faite: null })
      .eq('id', id)
    chargerTaches()
  }

  const faites = taches.filter(t => t.date_faite)
  const restantes = taches.filter(t => !t.date_faite)
  const progression = taches.length > 0 ? Math.round((faites.length / taches.length) * 100) : 0

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
          <span className="stat-number">{taches.length}</span>
          <span className="stat-label">tâches</span>
        </div>
        <div className="stat-pill">
          <span className="stat-number">{totalMinutes}</span>
          <span className="stat-label">minutes</span>
        </div>
        <div className="stat-pill">
          <span className="stat-number">{faites.length}</span>
          <span className="stat-label">faites</span>
        </div>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progression}%` }} />
        <span className="progress-label">{progression}%</span>
      </div>

      {taches.length === 0 ? (
        <div className="empty-state">
          <p>🎉 Rien à faire aujourd'hui !</p>
          <p>Profites-en pour te reposer.</p>
        </div>
      ) : (
        <>
          {restantes.length > 0 && (
            <div className="taches-section">
              <h3>À faire ({restantes.length})</h3>
              {restantes.map(t => (
                <div key={t.id} className={`tache-card ${t.reporte ? 'reporte' : ''}`}>
                  <div className="tache-info">
                    <span className="tache-piece">{t.menage_taches?.piece}</span>
                    <span className="tache-zone">{t.menage_taches?.zone}</span>
                    <span className="tache-nom">{t.menage_taches?.tache}</span>
                    {t.reporte && <span className="badge-reporte">Reportée</span>}
                  </div>
                  <div className="tache-actions">
                    <span className="duree">{t.menage_taches?.duree_minutes} min</span>
                    <button className="btn-check" onClick={() => marquerFaite(t.id)}>✓</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {faites.length > 0 && (
            <div className="taches-section done">
              <h3>Terminées ({faites.length})</h3>
              {faites.map(t => (
                <div key={t.id} className="tache-card faite">
                  <div className="tache-info">
                    <span className="tache-piece">{t.menage_taches?.piece}</span>
                    <span className="tache-zone">{t.menage_taches?.zone}</span>
                    <span className="tache-nom">{t.menage_taches?.tache}</span>
                  </div>
                  <div className="tache-actions">
                    <span className="duree">{t.menage_taches?.duree_minutes} min</span>
                    <button className="btn-uncheck" onClick={() => marquerNonFaite(t.id)}>↩</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}