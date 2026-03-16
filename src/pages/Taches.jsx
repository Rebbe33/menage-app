import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { decalerProchaineOccurrence, genererPlanning } from '../utils/planificateur'

export default function Taches() {
  const [tachesParPiece, setTachesParPiece] = useState({})
  const [piecesOuvertes, setPiecesOuvertes] = useState({})
  const [pieces, setPieces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filtreRecherche, setFiltreRecherche] = useState('')
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState({
    piece: '', zone: '', tache: '', frequence_jours: 7, duree_minutes: 10
  })

  useEffect(() => { chargerTaches() }, [])

  const chargerTaches = async () => {
    setLoading(true)
    const aujourd_hui = new Date().toISOString().split('T')[0]

    const { data: tachesData } = await supabase
      .from('menage_taches')
      .select('*')
      .eq('actif', true)
      .order('piece')

    const tachesAvecPlanning = await Promise.all(
      (tachesData || []).map(async (t) => {
        const { data: prochaine } = await supabase
          .from('menage_planning')
          .select('id, date_prevue')
          .eq('tache_id', t.id)
          .gte('date_prevue', aujourd_hui)
          .is('date_faite', null)
          .order('date_prevue', { ascending: true })
          .limit(1)

        const { data: derniere } = await supabase
          .from('menage_planning')
          .select('date_faite')
          .eq('tache_id', t.id)
          .not('date_faite', 'is', null)
          .order('date_faite', { ascending: false })
          .limit(1)

        return {
          ...t,
          prochaine_occurrence: prochaine?.[0] || null,
          derniere_fois: derniere?.[0]?.date_faite || null
        }
      })
    )

    // Grouper par pièce
    const groupes = {}
    for (const t of tachesAvecPlanning) {
      const piece = t.piece || 'Autre'
      if (!groupes[piece]) groupes[piece] = []
      groupes[piece].push(t)
    }

    // Trier chaque groupe par prochaine occurrence (la plus proche en premier)
    for (const piece in groupes) {
      groupes[piece].sort((a, b) => {
        const dateA = a.prochaine_occurrence?.date_prevue || '9999-99-99'
        const dateB = b.prochaine_occurrence?.date_prevue || '9999-99-99'
        return dateA.localeCompare(dateB)
      })
    }

    // Trier les pièces A→Z
    const piecesTriees = Object.keys(groupes).sort()
    const groupesOrdonnes = {}
    for (const p of piecesTriees) groupesOrdonnes[p] = groupes[p]

    setTachesParPiece(groupesOrdonnes)
    setPieces(piecesTriees)

    // Tout fermé par défaut
    const ouvertes = {}
    for (const p of piecesTriees) ouvertes[p] = false
    setPiecesOuvertes(ouvertes)

    setLoading(false)
  }

  const togglePiece = (piece) => {
    setPiecesOuvertes(prev => ({ ...prev, [piece]: !prev[piece] }))
  }

  const cocherTache = async (tache) => {
    if (!tache.prochaine_occurrence) return
    await decalerProchaineOccurrence(
      tache.prochaine_occurrence.id,
      tache.id,
      tache.frequence_jours
    )
    setMessage({ type: 'success', text: `✅ "${tache.tache}" faite, prochaine occurrence décalée.` })
    setTimeout(() => setMessage(null), 3000)
    chargerTaches()
  }

  const supprimerTache = async (id) => {
    if (!confirm('Supprimer cette tâche et toutes ses occurrences planifiées ?')) return
    await supabase.from('menage_taches').update({ actif: false }).eq('id', id)
    await supabase.from('menage_planning').delete().eq('tache_id', id).is('date_faite', null)
    chargerTaches()
  }

  const ajouterTache = async () => {
    if (!form.piece || !form.zone || !form.tache) {
      setMessage({ type: 'error', text: 'Merci de remplir tous les champs.' })
      return
    }
    const { error } = await supabase.from('menage_taches').insert([{ ...form, actif: true }])
    if (error) { setMessage({ type: 'error', text: error.message }); return }

    await genererPlanning(365)
    setMessage({ type: 'success', text: `✅ Tâche "${form.tache}" ajoutée et planifiée !` })
    setForm({ piece: '', zone: '', tache: '', frequence_jours: 7, duree_minutes: 10 })
    setShowForm(false)
    setTimeout(() => setMessage(null), 3000)
    chargerTaches()
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const frequenceLabel = (jours) => {
    if (jours === 1) return 'Quotidien'
    if (jours === 7) return 'Hebdo'
    if (jours === 14) return '2 semaines'
    if (jours === 30) return 'Mensuel'
    if (jours === 90) return 'Trimestriel'
    if (jours === 180) return 'Semestriel'
    if (jours === 365) return 'Annuel'
    return `${jours}j`
  }

  // Filtrer les tâches par recherche
  const tachesParPieceFiltrees = {}
  for (const [piece, taches] of Object.entries(tachesParPiece)) {
    const filtrees = taches.filter(t =>
      t.tache.toLowerCase().includes(filtreRecherche.toLowerCase()) ||
      t.zone.toLowerCase().includes(filtreRecherche.toLowerCase()) ||
      piece.toLowerCase().includes(filtreRecherche.toLowerCase())
    )
    if (filtrees.length > 0) tachesParPieceFiltrees[piece] = filtrees
  }

  const totalTaches = Object.values(tachesParPieceFiltrees).reduce((s, t) => s + t.length, 0)

  if (loading) return <div className="loading">Chargement des tâches...</div>

  return (
    <div className="taches-list-container">
      <div className="taches-list-header">
        <h2>Toutes les tâches</h2>
        <button className="btn-add" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Annuler' : '+ Ajouter'}
        </button>
      </div>

      {message && <div className={`message message-${message.type}`}>{message.text}</div>}

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="form-card">
          <h3>Nouvelle tâche</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Pièce</label>
              <input type="text" placeholder="ex: Cuisine" value={form.piece}
                onChange={e => setForm({ ...form, piece: e.target.value })} list="pieces-list" />
              <datalist id="pieces-list">
                {pieces.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label>Zone</label>
              <input type="text" placeholder="ex: Plan de travail" value={form.zone}
                onChange={e => setForm({ ...form, zone: e.target.value })} />
            </div>
            <div className="form-group full">
              <label>Tâche</label>
              <input type="text" placeholder="ex: Nettoyer le micro-ondes" value={form.tache}
                onChange={e => setForm({ ...form, tache: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Fréquence</label>
              <select value={form.frequence_jours}
                onChange={e => setForm({ ...form, frequence_jours: parseInt(e.target.value) })}>
                <option value={1}>Quotidien</option>
                <option value={7}>Hebdomadaire</option>
                <option value={14}>Bi-mensuel</option>
                <option value={30}>Mensuel</option>
                <option value={90}>Trimestriel</option>
                <option value={180}>Semestriel</option>
                <option value={365}>Annuel</option>
              </select>
            </div>
            <div className="form-group">
              <label>Durée (min)</label>
              <input type="number" min={1} max={120} value={form.duree_minutes}
                onChange={e => setForm({ ...form, duree_minutes: parseInt(e.target.value) })} />
            </div>
          </div>
          <button className="btn-primary" onClick={ajouterTache}>✓ Ajouter la tâche</button>
        </div>
      )}

      {/* Recherche */}
      <input type="text" placeholder="🔍 Rechercher une tâche..." value={filtreRecherche}
        onChange={e => setFiltreRecherche(e.target.value)} className="filtre-search" />

      <p className="taches-count">{totalTaches} tâche{totalTaches > 1 ? 's' : ''}</p>

      {/* Accordion par pièce */}
      <div className="pieces-accordion">
        {Object.entries(tachesParPieceFiltrees).map(([piece, taches]) => {
          const ouvert = filtreRecherche ? true : piecesOuvertes[piece]

          return (
            <div key={piece} className={`piece-section ${ouvert ? 'open' : ''}`}>
              <button className="piece-header" onClick={() => togglePiece(piece)}>
                <div className="piece-header-left">
                  <span className="piece-chevron">{ouvert ? '▾' : '▸'}</span>
                  <span className="piece-header-nom">{piece}</span>
                  <span className="piece-badge neutral">{taches.length}</span>
                </div>
                <span className="piece-header-meta">
                  {taches.reduce((s, t) => s + t.duree_minutes, 0)} min
                </span>
              </button>

              {ouvert && (
                <div className="piece-taches">
                  {taches.map(t => (
                    <div key={t.id} className="tache-full-card">
                      <div className="tache-full-info">
                        <div className="tache-full-top">
                          <span className="tache-zone">{t.zone}</span>
                        </div>
                        <span className="tache-nom">{t.tache}</span>
                        <div className="tache-full-meta">
                          <span className="meta-tag">{frequenceLabel(t.frequence_jours)}</span>
                          <span className="meta-tag">{t.duree_minutes} min</span>
                          {t.derniere_fois && (
                            <span className="meta-tag muted">Fait le {formatDate(t.derniere_fois)}</span>
                          )}
                          {t.prochaine_occurrence && (
                            <span className="meta-tag accent">Prévu le {formatDate(t.prochaine_occurrence.date_prevue)}</span>
                          )}
                        </div>
                      </div>
                      <div className="tache-full-actions">
                        <button className="btn-check" title="Marquer comme faite"
                          onClick={() => cocherTache(t)} disabled={!t.prochaine_occurrence}>✓</button>
                        <button className="btn-delete" title="Supprimer"
                          onClick={() => supprimerTache(t.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
