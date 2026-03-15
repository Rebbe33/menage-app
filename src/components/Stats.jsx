import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Stats() {
  const [statsSemaine, setStatsSemaine] = useState([])
  const [statsGlobales, setStatsGlobales] = useState({ total: 0, faites: 0, tauxCompletion: 0 })
  const [statsPieces, setStatsPieces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { chargerStats() }, [])

  const chargerStats = async () => {
    setLoading(true)

    // Stats des 7 derniers jours
    const il_y_a_7j = new Date()
    il_y_a_7j.setDate(il_y_a_7j.getDate() - 6)
    const debut = il_y_a_7j.toISOString().split('T')[0]
    const aujourd_hui = new Date().toISOString().split('T')[0]

    const { data: semaine } = await supabase
      .from('menage_planning')
      .select('date_prevue, date_faite, menage_taches(duree_minutes)')
      .gte('date_prevue', debut)
      .lte('date_prevue', aujourd_hui)

    // Grouper par jour
    const parJour = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(il_y_a_7j)
      d.setDate(il_y_a_7j.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      parJour[dateStr] = { date: dateStr, total: 0, faites: 0, minutes: 0 }
    }

    for (const t of semaine || []) {
      if (!parJour[t.date_prevue]) continue
      parJour[t.date_prevue].total++
      parJour[t.date_prevue].minutes += t.menage_taches?.duree_minutes || 0
      if (t.date_faite) parJour[t.date_prevue].faites++
    }

    const dataGraph = Object.values(parJour).map(d => ({
      ...d,
      label: new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      taux: d.total > 0 ? Math.round((d.faites / d.total) * 100) : 0
    }))
    setStatsSemaine(dataGraph)

    // Stats globales (30 derniers jours)
    const il_y_a_30j = new Date()
    il_y_a_30j.setDate(il_y_a_30j.getDate() - 30)
    const { data: global } = await supabase
      .from('menage_planning')
      .select('date_faite')
      .gte('date_prevue', il_y_a_30j.toISOString().split('T')[0])
      .lte('date_prevue', aujourd_hui)

    const total = global?.length || 0
    const faites = global?.filter(t => t.date_faite).length || 0
    setStatsGlobales({
      total,
      faites,
      tauxCompletion: total > 0 ? Math.round((faites / total) * 100) : 0
    })

    // Stats par pièce (30 derniers jours)
    const { data: parPiece } = await supabase
      .from('menage_planning')
      .select('date_faite, menage_taches(piece)')
      .gte('date_prevue', il_y_a_30j.toISOString().split('T')[0])
      .lte('date_prevue', aujourd_hui)

    const pieces = {}
    for (const t of parPiece || []) {
      const piece = t.menage_taches?.piece || 'Inconnu'
      if (!pieces[piece]) pieces[piece] = { piece, total: 0, faites: 0 }
      pieces[piece].total++
      if (t.date_faite) pieces[piece].faites++
    }

    setStatsPieces(
      Object.values(pieces)
        .map(p => ({ ...p, taux: Math.round((p.faites / p.total) * 100) }))
        .sort((a, b) => b.total - a.total)
    )

    setLoading(false)
  }

  if (loading) return <div className="loading">Chargement des statistiques...</div>

  return (
    <div className="stats-container">
      <h2>Statistiques</h2>

      {/* Cards globales */}
      <div className="stats-cards">
        <div className="stat-card">
          <span className="stat-card-number">{statsGlobales.tauxCompletion}%</span>
          <span className="stat-card-label">Taux de complétion (30j)</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-number">{statsGlobales.faites}</span>
          <span className="stat-card-label">Tâches faites (30j)</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-number">{statsGlobales.total - statsGlobales.faites}</span>
          <span className="stat-card-label">Tâches manquées (30j)</span>
        </div>
      </div>

      {/* Graphique 7 jours */}
      <div className="chart-section">
        <h3>Charge des 7 derniers jours (minutes)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statsSemaine} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value, name) => [
                name === 'minutes' ? `${value} min` : `${value}%`,
                name === 'minutes' ? 'Durée' : 'Complétion'
              ]}
            />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {statsSemaine.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.taux === 100 ? '#4ade80' : entry.taux > 50 ? '#facc15' : '#f87171'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="chart-legend">
          🟢 Tout fait &nbsp; 🟡 En cours &nbsp; 🔴 Non commencé
        </p>
      </div>

      {/* Stats par pièce */}
      {statsPieces.length > 0 && (
        <div className="pieces-section">
          <h3>Par pièce (30 derniers jours)</h3>
          {statsPieces.map(p => (
            <div key={p.piece} className="piece-row">
              <span className="piece-nom">{p.piece}</span>
              <div className="piece-bar-bg">
                <div className="piece-bar-fill" style={{ width: `${p.taux}%` }} />
              </div>
              <span className="piece-taux">{p.taux}%</span>
              <span className="piece-detail">({p.faites}/{p.total})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}